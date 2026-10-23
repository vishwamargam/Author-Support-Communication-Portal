const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiProvider, toGeminiPrompt } = require('../src/ai/provider');
const { safeProviderError } = require('../src/services/AiSupportService');

const config = {
  provider: 'gemini', apiKey: 'test-key', model: 'test-model', timeoutMs: 12000,
  classificationMaxTokens: 250, draftMaxTokens: 450
};

test('Gemini adapter keeps trusted instructions separate from untrusted author content', async () => {
  let request;
  let clientOptions;
  const provider = createGeminiProvider(config, {
    clientFactory(options) {
      clientOptions = options;
      return { models: { generateContent: async (value) => { request = value; return { text: '{"ok":true}' }; } } };
    }
  });
  const prompt = [
    { role: 'system', content: 'system rules' },
    { role: 'developer', content: 'trusted policy' },
    { role: 'user', content: 'untrusted author text' }
  ];

  assert.equal(await provider.classify(prompt, { type: 'object' }), '{"ok":true}');
  assert.deepEqual(toGeminiPrompt(prompt), {
    systemInstruction: 'system rules\n\ntrusted policy',
    contents: 'untrusted author text'
  });
  assert.equal(request.config.systemInstruction, 'system rules\n\ntrusted policy');
  assert.equal(request.contents, 'untrusted author text');
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.deepEqual(request.config.responseJsonSchema, { type: 'object' });
  assert.equal(request.config.maxOutputTokens, config.classificationMaxTokens);
  assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
  assert.equal(clientOptions.apiKey, 'test-key');
  assert.equal(clientOptions.httpOptions.timeout, config.timeoutMs);
});

test('Gemini adapter uses separate draft token budget and rejects empty model output', async () => {
  let request;
  const provider = createGeminiProvider(config, {
    clientFactory: () => ({ models: { generateContent: async (value) => { request = value; return { text: '  ' }; } } })
  });

  await assert.rejects(provider.draft('draft request', {}), { code: 'MALFORMED_OUTPUT' });
  assert.equal(request.config.maxOutputTokens, config.draftMaxTokens);
});

test('disabled or incomplete Gemini configuration makes no provider client', () => {
  let constructed = false;
  const clientFactory = () => { constructed = true; throw new Error('should not construct'); };
  assert.equal(createGeminiProvider({ ...config, provider: 'disabled' }, { clientFactory }), null);
  assert.equal(createGeminiProvider({ ...config, apiKey: '' }, { clientFactory }), null);
  assert.equal(constructed, false);
});

test('provider failures are mapped to safe stable error codes', () => {
  assert.equal(safeProviderError({ name: 'TimeoutError' }), 'TIMEOUT');
  assert.equal(safeProviderError({ status: 400, message: 'API key not valid' }), 'INVALID_API_KEY');
  assert.equal(safeProviderError({ status: 429, message: 'rate limit' }), 'RATE_LIMITED');
  assert.equal(safeProviderError({ status: 429, message: 'RESOURCE_EXHAUSTED quota exceeded' }), 'QUOTA_EXHAUSTED');
  assert.equal(safeProviderError({ status: 503, message: 'service unavailable' }), 'PROVIDER_UNAVAILABLE');
  assert.equal(safeProviderError({ code: 'MALFORMED_OUTPUT' }), 'MALFORMED_OUTPUT');
  assert.equal(safeProviderError({ status: 500, message: 'private provider detail' }), 'PROVIDER_ERROR');
});
