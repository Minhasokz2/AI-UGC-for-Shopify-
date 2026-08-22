const { generateVideo } = require('../../../src/services/wavespeed');

describe('services/wavespeed', () => {
  const model = { id: 'test-video', endpoint: 'wavespeed-ai/test/image-to-video', imageParam: 'image_url' };

  it('calls client.run with the model endpoint and an input built from imageParam + prompt, returning the first output', async () => {
    const run = vi.fn().mockResolvedValue({ outputs: ['https://cdn/video1.mp4', 'https://cdn/video2.mp4'] });
    const client = { run };

    const result = await generateVideo({ model, imageUrl: 'https://in.test/product.png', prompt: 'zoom in slowly', client });

    expect(run).toHaveBeenCalledWith('wavespeed-ai/test/image-to-video', {
      image_url: 'https://in.test/product.png',
      prompt: 'zoom in slowly',
    });
    expect(result).toEqual({ url: 'https://cdn/video1.mp4' });
  });

  it('throws for a model with a non-string imageParam', async () => {
    const dualModel = { id: 'bad', endpoint: 'x', imageParam: { person: 'a', garment: 'b' } };
    await expect(generateVideo({ model: dualModel, imageUrl: 'x', client: { run: vi.fn() } })).rejects.toThrow(
      /non-string imageParam/,
    );
  });

  it('throws when the client returns no outputs', async () => {
    const client = { run: vi.fn().mockResolvedValue({ outputs: [] }) };
    await expect(generateVideo({ model, imageUrl: 'x', client })).rejects.toThrow(/no output URL/);
  });

  it('throws when the client returns a malformed result with no outputs array at all', async () => {
    const client = { run: vi.fn().mockResolvedValue({}) };
    await expect(generateVideo({ model, imageUrl: 'x', client })).rejects.toThrow(/no output URL/);
  });
});
