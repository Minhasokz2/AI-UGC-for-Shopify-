// An in-memory fake implementing just enough of the firebase-admin Firestore
// surface for every repo in server/src/repos to be unit-tested without a real
// Firebase project: doc get/set/update/delete, collection where/orderBy/limit/
// startAfter queries, transactions (with get/set/update/delete), batch writes, and
// FieldValue.increment()/serverTimestamp()/delete().
//
// Every repo in this codebase is written as a factory — `createXRepo({ db,
// FieldValue })` — precisely so tests can inject this fake instead of the real
// firebase-admin Firestore handle. Production code wires the factory to the real
// `getFirestore()` + `require('firebase-admin/firestore').FieldValue` once, lazily,
// behind a `getXRepo()` singleton accessor.

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

const INCREMENT = Symbol('increment');
const SERVER_TIMESTAMP = Symbol('serverTimestamp');
const DELETE_FIELD = Symbol('deleteField');

class FakeTimestamp {
  constructor(millis) {
    this._millis = millis;
  }
  toMillis() {
    return this._millis;
  }
  toDate() {
    return new Date(this._millis);
  }
  isEqual(other) {
    return other instanceof FakeTimestamp && other._millis === this._millis;
  }
  static now() {
    return new FakeTimestamp(Date.now());
  }
  static fromMillis(millis) {
    return new FakeTimestamp(millis);
  }
  static fromDate(date) {
    return new FakeTimestamp(date.getTime());
  }
}

const FieldValue = {
  increment(n) {
    return { __type: INCREMENT, n };
  },
  serverTimestamp() {
    return { __type: SERVER_TIMESTAMP };
  },
  delete() {
    return { __type: DELETE_FIELD };
  },
};

function isSentinel(value, type) {
  return value && typeof value === 'object' && value.__type === type;
}

/** Resolves FieldValue sentinels against a document's current field value. */
function resolveFieldValue(existing, incoming) {
  if (isSentinel(incoming, INCREMENT)) return (typeof existing === 'number' ? existing : 0) + incoming.n;
  if (isSentinel(incoming, SERVER_TIMESTAMP)) return FakeTimestamp.now();
  return incoming;
}

function applyMerge(target, patch) {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isSentinel(value, DELETE_FIELD)) {
      delete result[key];
    } else {
      result[key] = resolveFieldValue(target[key], value);
    }
  }
  return result;
}

function matchesFilter(doc, { field, op, value }) {
  const actual = doc[field];
  switch (op) {
    case '==':
      return actual === value;
    case '!=':
      return actual !== value;
    case '<':
      return actual < value;
    case '<=':
      return actual <= value;
    case '>':
      return actual > value;
    case '>=':
      return actual >= value;
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(value);
    default:
      throw new Error(`fakeFirestore: unsupported operator "${op}"`);
  }
}

function compareValues(a, b) {
  const av = a instanceof FakeTimestamp ? a.toMillis() : a;
  const bv = b instanceof FakeTimestamp ? b.toMillis() : b;
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

class FakeQuery {
  constructor(store, collectionName, filters = [], orderByField = null, orderByDirection = 'asc', limitCount = null, startAfterValue = undefined) {
    this._store = store;
    this._collectionName = collectionName;
    this._filters = filters;
    this._orderByField = orderByField;
    this._orderByDirection = orderByDirection;
    this._limitCount = limitCount;
    this._startAfterValue = startAfterValue;
  }

  where(field, op, value) {
    return new FakeQuery(
      this._store,
      this._collectionName,
      [...this._filters, { field, op, value }],
      this._orderByField,
      this._orderByDirection,
      this._limitCount,
      this._startAfterValue,
    );
  }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this._store, this._collectionName, this._filters, field, direction, this._limitCount, this._startAfterValue);
  }

  limit(n) {
    return new FakeQuery(this._store, this._collectionName, this._filters, this._orderByField, this._orderByDirection, n, this._startAfterValue);
  }

  startAfter(value) {
    return new FakeQuery(this._store, this._collectionName, this._filters, this._orderByField, this._orderByDirection, this._limitCount, value);
  }

  async get() {
    const collectionMap = this._store._data[this._collectionName] || {};
    // Kept as { id, data } pairs throughout — never merged into one object — so a
    // document that legitimately stores a field literally named "id" (e.g. a
    // Shopify Session's `toObject()`) round-trips unchanged, exactly like real
    // Firestore (which never auto-strips or auto-injects an "id" field).
    let entries = Object.entries(collectionMap).map(([id, data]) => ({ id, data }));
    for (const filter of this._filters) entries = entries.filter(({ data }) => matchesFilter(data, filter));
    if (this._orderByField) {
      entries.sort((a, b) => {
        const cmp = compareValues(a.data[this._orderByField], b.data[this._orderByField]);
        return this._orderByDirection === 'desc' ? -cmp : cmp;
      });
    }
    if (this._startAfterValue !== undefined && this._orderByField) {
      entries = entries.filter(({ data }) => {
        const cmp = compareValues(data[this._orderByField], this._startAfterValue);
        return this._orderByDirection === 'desc' ? cmp < 0 : cmp > 0;
      });
    }
    if (this._limitCount != null) entries = entries.slice(0, this._limitCount);
    return makeQuerySnapshot(this._store, this._collectionName, entries);
  }
}

/** @param entries {Array<{id: string, data: object}>} */
function makeQuerySnapshot(store, collectionName, entries) {
  return {
    docs: entries.map(({ id, data }) => makeDocSnapshot(store, collectionName, id, data)),
    empty: entries.length === 0,
    size: entries.length,
    forEach(fn) {
      this.docs.forEach(fn);
    },
  };
}

function makeDocSnapshot(store, collectionName, id, dataOrUndefined) {
  const exists = dataOrUndefined !== undefined;
  return {
    id,
    exists,
    data: () => (exists ? { ...dataOrUndefined } : undefined),
    ref: store.collection(collectionName).doc(id),
  };
}

class FakeDocRef {
  constructor(store, collectionName, id) {
    this._store = store;
    this.collectionName = collectionName;
    this.id = id;
    this.path = `${collectionName}/${id}`;
    this.firestore = store;
  }

  async get() {
    const raw = this._store._data[this.collectionName]?.[this.id];
    return makeDocSnapshot(this._store, this.collectionName, this.id, raw);
  }

  async set(data, options = {}) {
    this._store._ensureCollection(this.collectionName);
    const existing = this._store._data[this.collectionName][this.id];
    if (options.merge && existing) {
      this._store._data[this.collectionName][this.id] = applyMerge(existing, data);
    } else {
      this._store._data[this.collectionName][this.id] = applyMerge({}, data);
    }
  }

  async update(data) {
    this._store._ensureCollection(this.collectionName);
    const existing = this._store._data[this.collectionName][this.id];
    if (!existing) {
      throw new Error(`fakeFirestore: cannot update non-existent doc ${this.path}`);
    }
    this._store._data[this.collectionName][this.id] = applyMerge(existing, data);
  }

  async delete() {
    if (this._store._data[this.collectionName]) {
      delete this._store._data[this.collectionName][this.id];
    }
  }

  collection(subName) {
    // Subcollections aren't used by this schema; provided only so callers relying
    // on the general shape don't break. Namespaced by parent path to avoid clashes.
    return this._store.collection(`${this.path}/${subName}`);
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(store, name) {
    super(store, name);
    this.id = name;
    this.firestore = store;
  }

  doc(id) {
    const docId = id || nextId(this._collectionName);
    return new FakeDocRef(this._store, this._collectionName, docId);
  }

  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class FakeTransaction {
  constructor(store) {
    this._store = store;
    this._writes = [];
  }

  async get(ref) {
    return ref.get();
  }

  set(ref, data, options) {
    this._writes.push({ type: 'set', ref, data, options });
    return this;
  }

  update(ref, data) {
    this._writes.push({ type: 'update', ref, data });
    return this;
  }

  delete(ref) {
    this._writes.push({ type: 'delete', ref });
    return this;
  }

  async _commit() {
    for (const write of this._writes) {
      if (write.type === 'set') await write.ref.set(write.data, write.options);
      else if (write.type === 'update') await write.ref.update(write.data);
      else if (write.type === 'delete') await write.ref.delete();
    }
  }
}

class FakeBatch {
  constructor(store) {
    this._store = store;
    this._writes = [];
  }

  set(ref, data, options) {
    this._writes.push({ type: 'set', ref, data, options });
    return this;
  }

  update(ref, data) {
    this._writes.push({ type: 'update', ref, data });
    return this;
  }

  delete(ref) {
    this._writes.push({ type: 'delete', ref });
    return this;
  }

  async commit() {
    for (const write of this._writes) {
      if (write.type === 'set') await write.ref.set(write.data, write.options);
      else if (write.type === 'update') await write.ref.update(write.data);
      else if (write.type === 'delete') await write.ref.delete();
    }
  }
}

class FakeFirestore {
  constructor() {
    this._data = {};
  }

  _ensureCollection(name) {
    if (!this._data[name]) this._data[name] = {};
  }

  collection(name) {
    this._ensureCollection(name);
    return new FakeCollectionRef(this, name);
  }

  async runTransaction(updateFunction) {
    const tx = new FakeTransaction(this);
    const result = await updateFunction(tx);
    await tx._commit();
    return result;
  }

  batch() {
    return new FakeBatch(this);
  }

  /** Test-only escape hatch for asserting on raw stored state. */
  _dump(collectionName) {
    return JSON.parse(JSON.stringify(this._data[collectionName] || {}));
  }
}

/** @returns {FakeFirestore} a fresh, isolated fake Firestore instance. */
function createFakeFirestore() {
  return new FakeFirestore();
}

module.exports = { createFakeFirestore, FieldValue, FakeTimestamp };
