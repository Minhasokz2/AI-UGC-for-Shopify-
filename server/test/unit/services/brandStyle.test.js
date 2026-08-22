const {
  extractBrandStyle,
  parseBrandStyleResponse,
  getOpenAIClient,
  getAnthropicClient,
} = require('../../../src/services/brandStyle');
const { ProviderApiError } = require('../../../src/errors/AppError');
const { env } = require('../../../src/config/env');

describe('services/brandStyle', () => {
  describe('parseBrandStyleResponse', () => {
    it('parses a plain JSON response', () => {
      const result = parseBrandStyleResponse('{"colors": ["#FFFFFF", "#000000"], "tone": "minimalist"}');
      expect(result).toEqual({ colors: ['#FFFFFF', '#000000'], tone: 'minimalist' });
    });

    it('strips a ```json fenced code block before parsing', () => {
      const text = '```json\n{"colors": ["#ABCDEF"], "tone": "earthy"}\n```';
      expect(parseBrandStyleResponse(text)).toEqual({ colors: ['#ABCDEF'], tone: 'earthy' });
    });

    it('strips a bare ``` fenced block (no language tag) before parsing', () => {
      const text = '```\n{"colors": ["#111111"], "tone": "bold"}\n```';
      expect(parseBrandStyleResponse(text)).toEqual({ colors: ['#111111'], tone: 'bold' });
    });

    it('throws ProviderApiError for text that is not valid JSON', () => {
      expect(() => parseBrandStyleResponse('here is your answer: {colors...')).toThrow(ProviderApiError);
    });

    it('throws ProviderApiError when the parsed JSON does not match the {colors, tone} shape', () => {
      expect(() => parseBrandStyleResponse('{"tone": "bold"}')).toThrow(ProviderApiError); // missing colors
      expect(() => parseBrandStyleResponse('{"colors": ["#fff"], "tone": 5}')).toThrow(ProviderApiError); // tone not a string
      expect(() => parseBrandStyleResponse('null')).toThrow(ProviderApiError);
    });
  });

  describe('extractBrandStyle', () => {
    it('provider "openai": sends a vision message with text + image_url parts and parses the response', async () => {
      const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"colors": ["#123456"], "tone": "playful"}' } }],
      });
      const client = { chat: { completions: { create } } };

      const result = await extractBrandStyle({
        imageUrls: ['https://cdn/logo.png', 'https://cdn/packaging.png'],
        provider: 'openai',
        client,
      });

      expect(create).toHaveBeenCalledTimes(1);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
          { type: 'image_url', image_url: { url: 'https://cdn/logo.png' } },
          { type: 'image_url', image_url: { url: 'https://cdn/packaging.png' } },
        ]),
      );
      expect(result).toEqual({ colors: ['#123456'], tone: 'playful' });
    });

    it('provider "openai": throws ProviderApiError when the response has no content', async () => {
      const client = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: {} }] }) } } };
      await expect(extractBrandStyle({ imageUrls: ['https://cdn/a.png'], provider: 'openai', client })).rejects.toBeInstanceOf(
        ProviderApiError,
      );
    });

    it('provider "anthropic": sends image + text content blocks and parses the response', async () => {
      const create = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"colors": ["#abcdef"], "tone": "rustic"}' }],
      });
      const client = { messages: { create } };

      const result = await extractBrandStyle({ imageUrls: ['https://cdn/logo.png'], provider: 'anthropic', client });

      expect(create).toHaveBeenCalledTimes(1);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual(
        expect.arrayContaining([
          { type: 'image', source: { type: 'url', url: 'https://cdn/logo.png' } },
          expect.objectContaining({ type: 'text' }),
        ]),
      );
      expect(result).toEqual({ colors: ['#abcdef'], tone: 'rustic' });
    });

    it('provider "anthropic": throws ProviderApiError when the response has no text block', async () => {
      const client = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'image' }] }) } };
      await expect(
        extractBrandStyle({ imageUrls: ['https://cdn/a.png'], provider: 'anthropic', client }),
      ).rejects.toBeInstanceOf(ProviderApiError);
    });

    it('throws for an unsupported provider', async () => {
      await expect(extractBrandStyle({ imageUrls: [], provider: 'gemini', client: {} })).rejects.toThrow(
        /unsupported provider/,
      );
    });

    it('getOpenAIClient() throws a ProviderApiError when OPENAI_API_KEY is not set', () => {
      const original = env.OPENAI_API_KEY;
      env.OPENAI_API_KEY = undefined;
      try {
        expect(() => getOpenAIClient()).toThrow(ProviderApiError);
        expect(() => getOpenAIClient()).toThrow(/not configured/);
      } finally {
        env.OPENAI_API_KEY = original;
      }
    });

    it('getAnthropicClient() throws a ProviderApiError when ANTHROPIC_API_KEY is not set', () => {
      const original = env.ANTHROPIC_API_KEY;
      env.ANTHROPIC_API_KEY = undefined;
      try {
        expect(() => getAnthropicClient()).toThrow(ProviderApiError);
        expect(() => getAnthropicClient()).toThrow(/not configured/);
      } finally {
        env.ANTHROPIC_API_KEY = original;
      }
    });
  });
});
