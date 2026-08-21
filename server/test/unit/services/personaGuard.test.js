const { isAdultPersona, assertAdultPersona } = require('../../../src/services/personaGuard');
const { PersonaGuardError } = require('../../../src/errors/AppError');

describe('services/personaGuard', () => {
  describe('isAdultPersona', () => {
    it('allows exactly ageRange === "adult"', () => {
      expect(isAdultPersona({ ageRange: 'adult' })).toBe(true);
    });

    it('rejects undefined persona', () => {
      expect(isAdultPersona(undefined)).toBe(false);
    });

    it('rejects null persona', () => {
      expect(isAdultPersona(null)).toBe(false);
    });

    it('rejects a persona with no ageRange', () => {
      expect(isAdultPersona({})).toBe(false);
    });

    it('rejects an empty-string ageRange', () => {
      expect(isAdultPersona({ ageRange: '' })).toBe(false);
    });

    it('rejects wrong-case variants', () => {
      expect(isAdultPersona({ ageRange: 'Adult' })).toBe(false);
      expect(isAdultPersona({ ageRange: 'ADULT' })).toBe(false);
    });

    it('rejects any other ageRange value, including "minor" or "teen"', () => {
      expect(isAdultPersona({ ageRange: 'minor' })).toBe(false);
      expect(isAdultPersona({ ageRange: 'teen' })).toBe(false);
      expect(isAdultPersona({ ageRange: 'unknown' })).toBe(false);
    });
  });

  describe('assertAdultPersona', () => {
    it('does not throw for an adult persona', () => {
      expect(() => assertAdultPersona({ ageRange: 'adult' })).not.toThrow();
    });

    it('throws PersonaGuardError (422) for anything else', () => {
      expect(() => assertAdultPersona({ ageRange: 'minor' })).toThrow(PersonaGuardError);
      try {
        assertAdultPersona(undefined);
        throw new Error('expected assertAdultPersona to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(PersonaGuardError);
        expect(err.statusCode).toBe(422);
      }
    });
  });
});
