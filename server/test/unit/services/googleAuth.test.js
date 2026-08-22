const { getAuthUrl, exchangeCodeForProfile } = require('../../../src/services/googleAuth');

describe('services/googleAuth', () => {
  describe('getAuthUrl', () => {
    it('requests openid/email/profile scopes and passes the state through', () => {
      const generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...');
      const client = { generateAuthUrl };

      const url = getAuthUrl('opaque-state-123', { client });

      expect(generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        state: 'opaque-state-123',
      });
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?...');
    });
  });

  describe('exchangeCodeForProfile', () => {
    it('exchanges the code, verifies the id token, and returns a normalized profile', async () => {
      const getToken = vi.fn().mockResolvedValue({ tokens: { id_token: 'id-token-abc' } });
      const getPayload = vi.fn().mockReturnValue({ email: 'merchant@example.com', email_verified: true, sub: 'google-sub-1' });
      const verifyIdToken = vi.fn().mockResolvedValue({ getPayload });
      const client = { getToken, verifyIdToken };

      const profile = await exchangeCodeForProfile('auth-code-xyz', { client });

      expect(getToken).toHaveBeenCalledWith('auth-code-xyz');
      expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'id-token-abc', audience: expect.any(String) });
      expect(profile).toEqual({ email: 'merchant@example.com', emailVerified: true, sub: 'google-sub-1' });
    });

    it('normalizes a falsy email_verified to false', async () => {
      const client = {
        getToken: vi.fn().mockResolvedValue({ tokens: { id_token: 'id-token-abc' } }),
        verifyIdToken: vi.fn().mockResolvedValue({ getPayload: () => ({ email: 'a@b.com', sub: 's1' }) }),
      };

      const profile = await exchangeCodeForProfile('code', { client });

      expect(profile.emailVerified).toBe(false);
    });

    it('throws when Google returns no id_token', async () => {
      const client = { getToken: vi.fn().mockResolvedValue({ tokens: {} }), verifyIdToken: vi.fn() };
      await expect(exchangeCodeForProfile('code', { client })).rejects.toThrow(/no id_token/);
    });

    it('throws when the id token payload cannot be decoded', async () => {
      const client = {
        getToken: vi.fn().mockResolvedValue({ tokens: { id_token: 'id-token-abc' } }),
        verifyIdToken: vi.fn().mockResolvedValue({ getPayload: () => undefined }),
      };
      await expect(exchangeCodeForProfile('code', { client })).rejects.toThrow(/could not decode/);
    });
  });
});
