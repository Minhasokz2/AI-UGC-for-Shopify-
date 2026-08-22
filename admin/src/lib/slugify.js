/**
 * Turn a human-entered label into a URL-safe id/slug, for the "new template"
 * / "new model" forms — the operator can still hand-edit the result before
 * saving (see TemplateEditor / ModelEditor).
 */
export function slugify(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
