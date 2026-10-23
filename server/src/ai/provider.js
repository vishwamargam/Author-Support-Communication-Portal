const { GoogleGenAI } = require('@google/genai');
const { getAiConfig } = require('../config/env');

function toGeminiPrompt(input) {
  if (!Array.isArray(input)) return { systemInstruction: undefined, contents: String(input ?? '') };
  const trustedInstructions = input
    .filter((message) => message.role === 'system' || message.role === 'developer')
    .map((message) => String(message.content ?? ''));
  const userContent = input
    .filter((message) => message.role === 'user')
    .map((message) => String(message.content ?? ''));

  return {
    systemInstruction: trustedInstructions.join('\n\n'),
    contents: userContent.join('\n\n')
  };
}

function createGeminiProvider(config = getAiConfig(), { clientFactory = (options) => new GoogleGenAI(options) } = {}) {
  if (config.provider !== 'gemini' || !config.apiKey || !config.model) return null;

  const client = clientFactory({
    apiKey: config.apiKey,
    httpOptions: { timeout: config.timeoutMs, retryOptions: { attempts: 1 } }
  });

  async function generate(input, schema, maxOutputTokens) {
    const prompt = toGeminiPrompt(input);
    const response = await client.models.generateContent({
      model: config.model,
      contents: prompt.contents,
      config: {
        systemInstruction: prompt.systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens,
        httpOptions: { timeout: config.timeoutMs, retryOptions: { attempts: 1 } }
      }
    });

    if (typeof response?.text !== 'string' || !response.text.trim()) {
      throw Object.assign(new Error('Gemini returned no structured content'), { code: 'MALFORMED_OUTPUT' });
    }
    return response.text;
  }

  return {
    name: 'gemini',
    model: config.model,
    classify(input, schema) {
      return generate(input, schema, config.classificationMaxTokens);
    },
    draft(input, schema) {
      return generate(input, schema, config.draftMaxTokens);
    }
  };
}

module.exports = { createGeminiProvider, toGeminiPrompt };
