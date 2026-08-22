# Required Firestore composite indexes

Firestore auto-creates a single-field index for every field, but any query
that combines an equality/`in`/`array-contains` filter on one field with an
`orderBy` (or a second filter) on a *different* field needs an explicit
composite index. This app has no `firestore.indexes.json` deploy step wired
up (Render's free tier has no Firebase CLI step in `build.sh`) — create these
by hand in the Firebase console (Firestore → Indexes → Composite), or run
each query once against a real project and click the "create index" link
Firestore prints in the error it throws for a missing index.

Below is every composite index this codebase's actual queries need, derived
directly from `src/repos/*.js` — not guessed. Re-derive this list from the
repos rather than trusting it blindly if the queries change.

## `jobs` collection

| Fields (in order) | Backs |
|---|---|
| `shopDomain` (==), `createdAt` (desc) | `jobsRepo.queryJobs` with no extra filter requested |
| `shopDomain` (==), `status` (==), `createdAt` (desc) | `jobsRepo.queryJobs` filtered by status |
| `shopDomain` (==), `batchId` (==), `createdAt` (desc) | `jobsRepo.queryJobs` filtered by batchId |
| `shopDomain` (==), `contentType` (==), `createdAt` (desc) | `jobsRepo.queryJobs` filtered by contentType |
| `status` (in), `createdAt` (asc) | `jobsRepo.queryResumableJobs` (boot-time resume) |
| `shopDomain` (==), `status` (in) | `jobsRepo.countActiveJobsForShop` (the 20-concurrent-job-per-shop admission check in `routes/api/jobs.js`/`batches.js`) |

`queryJobs`'s `orderByField`/`direction` params default to `createdAt`/`desc`
but are technically caller-overridable — if a caller ever passes a different
`orderByField`, a matching index for that field would be needed too. No
current caller does.

## `conversion_jobs` collection (Image Optimizer)

| Fields (in order) | Backs |
|---|---|
| `shopDomain` (==), `createdAt` (desc) | `conversionJobsRepo.queryByShop` with no status filter |
| `shopDomain` (==), `status` (==), `createdAt` (desc) | `conversionJobsRepo.queryByShop` filtered by status |
| `status` (in), `createdAt` (asc) | `conversionJobsRepo.queryResumableJobs` (boot-time resume) |

## `products` collection

| Fields (in order) | Backs |
|---|---|
| `shopDomain` (==), `title` (asc) | `productsRepo.queryByShop` (the in-memory `search` filter is applied AFTER this query, over a wider candidate window — see that file's header comment) |

## `shops` collection

| Fields (in order) | Backs |
|---|---|
| `uninstalledAt` (==, filtering for `null`), `shopDomain` (asc) | `shopsRepo.listInstalledShops` (paginated sweep target for billingReconciliation/nurtureEmailService) |

## `transactions` collection

| Fields (in order) | Backs |
|---|---|
| `shopDomain` (==), `createdAt` (desc) | `transactionsRepo.queryByShop` (credit ledger history) |

## Not composite — single-field, auto-indexed, no action needed

`allowedModelsRepo.listModels`'s `eligibleFlows` (array-contains) or
`category` (==) queries, `templatesRepo.listTemplates`'s `category` (==),
`referralsRepo`'s `referredShopDomain`/`referrerShopDomain` (==) queries,
`shopsRepo.findByReferralCode`'s `referralCode` (==), and
`FirestoreSessionStorage.findSessionsByShop`'s `shop` (==) query are all a
single filter with no additional `orderBy` on a different field — Firestore
serves these from its automatic per-field indexes.

## Verifying this list is current

```
grep -n "\.where(" src/repos/*.js
```

Any `.where(...).where(...)` chain, or a `.where(...)` followed by
`.orderBy(...)` on a field other than the one filtered, needs an entry
above. A test against the real (non-fake) Firestore emulator or a live
project is the authoritative way to catch a missing index — the fake
Firestore used in this repo's unit tests (`test/helpers/fakeFirestore.js`)
does not enforce index requirements at all, so a query working in tests is
NOT proof it will work against real Firestore without the index existing.
