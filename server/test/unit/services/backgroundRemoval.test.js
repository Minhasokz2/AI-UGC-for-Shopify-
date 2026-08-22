const { removeBackground, BACKGROUND_REMOVAL_MODELS } = require('../../../src/services/backgroundRemoval');

describe('services/backgroundRemoval', () => {
  it('is keyed by role and includes exactly the budget and premium background-removal roles', () => {
    expect(Object.keys(BACKGROUND_REMOVAL_MODELS).sort()).toEqual(['background_removal_budget', 'background_removal_premium']);
  });

  it('defaults to the budget tier and calls its real catalog endpoint', async () => {
    const subscribe = vi.fn().mockResolvedValue({ data: { image: { url: 'https://cdn/clean.png' } }, requestId: 'r1' });
    const client = { subscribe };

    const result = await removeBackground({ imageUrl: 'https://in.test/product.png', client });

    expect(subscribe).toHaveBeenCalledWith(
      BACKGROUND_REMOVAL_MODELS.background_removal_budget.endpoint,
      expect.objectContaining({ input: expect.objectContaining({ image_url: 'https://in.test/product.png' }) }),
    );
    expect(result).toEqual({ url: 'https://cdn/clean.png' });
  });

  it('uses the premium tier endpoint when tier: "premium" is requested', async () => {
    const subscribe = vi.fn().mockResolvedValue({ data: { image: { url: 'https://cdn/clean-premium.png' } }, requestId: 'r2' });
    const client = { subscribe };

    await removeBackground({ imageUrl: 'https://in.test/product.png', tier: 'premium', client });

    expect(subscribe).toHaveBeenCalledWith(BACKGROUND_REMOVAL_MODELS.background_removal_premium.endpoint, expect.anything());
  });

  it('throws for an unknown tier', async () => {
    await expect(removeBackground({ imageUrl: 'x', tier: 'ultra', client: { subscribe: vi.fn() } })).rejects.toThrow(
      /unknown tier/,
    );
  });
});
