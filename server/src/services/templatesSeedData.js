// Starter admin-curated template catalog for the Templates Gallery. Unlike
// allowedModelsSeedData.js (the actual model definitions), templates are
// meant to be edited/expanded freely from the admin panel — this is just a
// reasonable out-of-the-box set so a fresh install isn't an empty gallery.
// Each template's `creditCost` intentionally matches its `modelRole`'s
// underlying model cost at seed time; the two are independent fields
// afterward (an admin can retune a template's price without touching the
// model catalog) — see credits.js's recomputeCost, which always reads
// whichever of the two the job actually used.

const TEMPLATES = [
  {
    slug: 'studio-white-background',
    label: 'Studio White Background',
    category: 'scene',
    modelRole: 'default_scene',
    prompt: 'Place the product on a clean, seamless white studio background with soft, even lighting and a subtle shadow.',
    creditCost: 1,
  },
  {
    slug: 'lifestyle-marble-counter',
    label: 'Lifestyle — Marble Counter',
    category: 'scene',
    modelRole: 'photorealistic_color_safe',
    prompt: 'Place the product on a bright marble kitchen counter with natural morning light, color-accurate to the original product.',
    creditCost: 2,
  },
  {
    slug: 'ugc-model-holding-product',
    label: 'UGC — Model Holding Product',
    category: 'ugc',
    modelRole: 'image_editing_ugc',
    prompt: 'Show a person naturally holding and using the product in a casual, everyday setting, smiling at the camera.',
    creditCost: 2,
  },
  {
    slug: 'video-360-turntable',
    label: 'Video — 360° Turntable',
    category: 'video',
    modelRole: 'video_fast',
    prompt: 'Slowly rotate the product 360 degrees on a clean studio turntable with soft, even lighting.',
    creditCost: 8,
  },
  {
    slug: 'video-lifestyle-motion',
    label: 'Video — Lifestyle Motion',
    category: 'video',
    modelRole: 'video_standard',
    prompt: 'Show the product in gentle, natural motion in a lifestyle setting that highlights its use.',
    creditCost: 12,
  },
];

/**
 * Insert-if-missing seed, matching allowedModelsSeedData.js's semantics —
 * never overwrites an existing admin-edited template.
 * @param {{ db: object }} opts
 */
async function seedTemplates({ db }) {
  const col = db.collection('templates');
  let created = 0;
  let skipped = 0;
  for (const template of TEMPLATES) {
    const { slug, ...fields } = template;
    const ref = col.doc(slug);
    // eslint-disable-next-line no-await-in-loop
    const snap = await ref.get();
    if (snap.exists) {
      skipped += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await ref.set(fields);
    created += 1;
  }
  return { created, skipped, total: TEMPLATES.length };
}

module.exports = { TEMPLATES, seedTemplates };
