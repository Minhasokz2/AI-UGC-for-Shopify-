import { Checkbox } from '@shopify/polaris';

/**
 * UI-side defense-in-depth for the persona age gate. The REAL enforcement
 * is server-side (422 PERSONA_NOT_ADULT) — this checkbox must exist,
 * default un-checked, and gate the Generate button; the job body's
 * personaAttributes.ageRange must be 'adult' only when checked.
 */
export function AgeConfirmationCheckbox({ checked, onChange }) {
  return (
    <Checkbox
      label="I confirm this depicts an adult (18+)"
      checked={checked}
      onChange={onChange}
    />
  );
}
