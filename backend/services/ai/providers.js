require('dotenv').config();
const crypto = require('crypto');
const { getProviderSettings } = require('./settings-store');

/**
 * HTTP header values must be ByteString (every code unit <= 255). A bearer
 * token is ASCII by definition (RFC 6750 b64token: ALPHA / DIGIT / "-._~+/=").
 *
 * Found live: the Admin AI's stored token was 137 characters -- the correct
 * 136-character token with a single Arabic "ؤ" (U+0624) stuck on the front,
 * a paste artefact from the RTL settings field. fetch() then died with
 *   "Cannot convert argument to a ByteString because the character at index 7
 *    has a value of 1572 which is greater than 255"
 * which names a byte offset in the assembled header and tells the operator
 * nothing about their token. The assistant silently fell back to canned
 * answers and reported providerUsed:false with no visible cause.
 *
 * Strip what can never legitimately belong in a token, and say so once, rather
 * than letting an invisible character disable the provider.
 */
let warnedAboutTokenChars = false;
function sanitizeApiToken(raw, label) {
  if (!raw) return raw;
  const cleaned = String(raw).trim().replace(/[^\x21-\x7E]/g, '');
  if (cleaned !== String(raw) && !warnedAboutTokenChars) {
    warnedAboutTokenChars = true;
    console.warn(
      '[AI provider] The stored ' + (label || 'API') + ' token contained ' +
      (String(raw).length - cleaned.length) + ' character(s) that cannot appear in an ' +
      'HTTP header (likely whitespace or a stray RTL paste artefact). They were ignored ' +
      'for this request. Re-save the token in the admin panel to clear it permanently.'
    );
  }
  return cleaned;
}

class AIProvider {
  constructor(settings) {
    this.settings = settings || {};
  }

  async complete() {
    throw new Error('Provider is not implemented.');
  }

  async test() {
    return { ok: true, message: 'Provider adapter loaded.' };
  }
}

class OpenAICompatibleProvider extends AIProvider {
  async complete({ system, messages = [], tools = null, image = null }) {
    if (!this.settings.apiToken && !this.settings.allowAnonymous) {
      throw new Error('API token is not configured.');
    }
    let defaultBase = 'https://api.openai.com/v1';
    if (this.settings.provider === 'openrouter') {
      defaultBase = 'https://openrouter.ai/api/v1';
    }
    const baseUrl = (this.settings.apiBaseUrl || defaultBase).replace(/\/$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.settings.requestTimeout || 30) * 1000);

    try {
      const formattedMessages = [];
      if (system) {
        formattedMessages.push({ role: 'system', content: system });
      }

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        // Pass tool response message directly
        if (msg.role === 'tool') {
          formattedMessages.push({
            role: 'tool',
            tool_call_id: msg.tool_call_id,
            name: msg.name,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          });
          continue;
        }

        // Pass assistant message with tool_calls directly
        if (msg.role === 'assistant' && msg.tool_calls) {
          formattedMessages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.tool_calls
          });
          continue;
        }

        // Handle multimodal image on latest user message
        if (i === messages.length - 1 && image && (msg.role === 'user' || !msg.role)) {
          const content = [
            { type: 'text', text: msg.content || 'حلل هذه الصورة واقترح منتجات مناسبة من متجر زياد.' },
            {
              type: 'image_url',
              image_url: {
                url: image.dataUrl || (image.base64 ? `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}` : image.url)
              }
            }
          ];
          formattedMessages.push({ role: 'user', content });
        } else {
          formattedMessages.push({
            role: msg.role || 'user',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          });
        }
      }

      const bodyPayload = {
        model: this.settings.model || 'gpt-4o-mini',
        messages: formattedMessages,
        temperature: Number(this.settings.temperature ?? 0.3),
        max_tokens: Number(this.settings.maxTokens ?? 2048),
        stream: false
      };

      const toolsEnabled = this.settings.enableTools !== undefined
        ? Boolean(this.settings.enableTools)
        : (this.settings.enableToolCalling ?? true);

      if (tools && Array.isArray(tools) && tools.length > 0 && toolsEnabled) {
        bodyPayload.tools = tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        }));
      }

      const headers = {
        'content-type': 'application/json'
      };
      if (this.settings.apiToken) {
        headers['authorization'] = `Bearer ${sanitizeApiToken(this.settings.apiToken, 'provider')}`;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error?.message || `Provider request failed with status ${response.status}: ${response.statusText}`);
      }

      const choice = data.choices?.[0]?.message || {};
      const toolCalls = choice.tool_calls || [];
      const parsedToolCalls = toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: safeJsonParse(tc.function?.arguments, {})
      }));

      return {
        text: choice.content || '',
        toolCalls: parsedToolCalls,
        rawChoice: choice,
        raw: data
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async test() {
    const startTime = Date.now();
    let defaultBase = 'https://api.openai.com/v1';
    if (this.settings.provider === 'openrouter') {
      defaultBase = 'https://openrouter.ai/api/v1';
    }
    const baseUrl = (this.settings.apiBaseUrl || defaultBase).replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${sanitizeApiToken(this.settings.apiToken, 'provider')}`
        },
        body: JSON.stringify({
          model: this.settings.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const latencyMs = Date.now() - startTime;
      return { ok: true, latencyMs, message: `تم الاتصال بنجاح بالنموذج (${latencyMs}ms)` };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class AnthropicCompatibleProvider extends AIProvider {
  async complete({ system, messages = [], tools = null, image = null }) {
    if (!this.settings.apiToken) throw new Error('API token is not configured.');
    const baseUrl = (this.settings.apiBaseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.settings.requestTimeout || 30) * 1000);

    try {
      const formattedMessages = [];
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (i === messages.length - 1 && image && (msg.role === 'user' || !msg.role)) {
          const content = [];
          if (image.base64) {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mimeType || 'image/jpeg',
                data: image.base64
              }
            });
          }
          content.push({ type: 'text', text: msg.content || 'حلل هذه الصورة واقترح منتجات مناسبة من متجر زياد.' });
          formattedMessages.push({ role: 'user', content });
        } else {
          formattedMessages.push({
            role: msg.role === 'system' ? 'user' : (msg.role || 'user'),
            content: msg.content
          });
        }
      }

      const bodyPayload = {
        model: this.settings.model || 'claude-3-5-sonnet-20241022',
        system,
        messages: formattedMessages.length ? formattedMessages : [{ role: 'user', content: 'مرحبا' }],
        temperature: Number(this.settings.temperature ?? 0.3),
        max_tokens: Number(this.settings.maxTokens ?? 2048)
      };

      const toolsEnabled = this.settings.enableTools !== undefined
        ? Boolean(this.settings.enableTools)
        : (this.settings.enableToolCalling ?? true);

      if (tools && Array.isArray(tools) && tools.length > 0 && toolsEnabled) {
        bodyPayload.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters
        }));
      }

      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': sanitizeApiToken(this.settings.apiToken, 'provider'),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Anthropic request failed with status ${response.status}`);

      const contentBlocks = data.content || [];
      const text = contentBlocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const toolUseBlocks = contentBlocks.filter((b) => b.type === 'tool_use');
      const toolCalls = toolUseBlocks.map((t) => ({
        id: t.id,
        name: t.name,
        arguments: t.input || {}
      }));

      return { text, toolCalls, raw: data };
    } finally {
      clearTimeout(timeout);
    }
  }

  async test() {
    const startTime = Date.now();
    await this.complete({
      system: 'Reply with OK only.',
      messages: [{ role: 'user', content: 'OK?' }]
    });
    const latencyMs = Date.now() - startTime;
    return { ok: true, latencyMs, message: `تم الاتصال بمزود Anthropic Claude بنجاح (${latencyMs}ms)` };
  }
}

class GeminiProvider extends AIProvider {
  async complete({ system, messages = [], image = null }) {
    if (!this.settings.apiToken) throw new Error('API token is not configured.');
    const baseUrl = (this.settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = this.settings.model || 'gemini-1.5-flash';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.settings.requestTimeout || 30) * 1000);

    try {
      const contents = [];
      const parts = [{ text: `SYSTEM INSTRUCTIONS:\n${system}\n\n` }];

      if (image && image.base64) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType || 'image/jpeg',
            data: image.base64
          }
        });
      }

      messages.forEach((msg) => {
        parts.push({ text: `${msg.role === 'user' ? 'Customer' : 'Najm'}: ${msg.content}` });
      });

      contents.push({ role: 'user', parts });

      const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.settings.apiToken },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: Number(this.settings.temperature ?? 0.3),
            maxOutputTokens: Number(this.settings.maxTokens ?? 2048)
          }
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Gemini request failed with status ${response.status}`);

      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return { text, toolCalls: [], raw: data };
    } finally {
      clearTimeout(timeout);
    }
  }

  async test() {
    const startTime = Date.now();
    await this.complete({
      system: 'Reply with OK only.',
      messages: [{ role: 'user', content: 'OK?' }]
    });
    const latencyMs = Date.now() - startTime;
    return { ok: true, latencyMs, message: `تم الاتصال بمزود Google Gemini بنجاح (${latencyMs}ms)` };
  }
}

class BedrockProvider extends AIProvider {
  constructor(settings) {
    super(settings);
    // If apiBaseUrl or apiToken is present, Bedrock is configured via an OpenAI-compatible Gateway / Mantle endpoint
    if (this.settings.apiBaseUrl || this.settings.apiToken) {
      this.openAiAdapter = new OpenAICompatibleProvider(this.settings);
    }
  }

  async complete(params) {
    if (this.openAiAdapter) {
      return this.openAiAdapter.complete(params);
    }

    // Native AWS Bedrock invocation via SigV4 / SDK
    const prompt = [params.system, ...params.messages.map((m) => `${m.role}: ${m.content}`)].join('\n\n');
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: this.settings.maxTokens ?? 2048,
      temperature: this.settings.temperature ?? 0.3,
      system: params.system,
      messages: [{ role: 'user', content: prompt }]
    });

    let data;
    try {
      let BedrockRuntimeClient;
      let InvokeModelCommand;
      ({ BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime'));
      const client = new BedrockRuntimeClient({ region: this.settings.region || 'us-east-1' });
      const command = new InvokeModelCommand({
        modelId: this.settings.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body
      });
      const response = await client.send(command);
      data = JSON.parse(Buffer.from(response.body).toString('utf8'));
    } catch (sdkError) {
      data = await invokeBedrockWithSigV4({
        region: this.settings.region || 'us-east-1',
        modelId: this.settings.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        body,
        timeoutSeconds: this.settings.requestTimeout
      });
    }

    const text = (data.content || []).map((part) => part.text || '').join('');
    return { text, toolCalls: [], raw: data };
  }

  async test() {
    if (this.openAiAdapter) {
      return this.openAiAdapter.test();
    }
    const startTime = Date.now();
    await this.complete({
      system: 'Reply with OK only.',
      messages: [{ role: 'user', content: 'OK?' }]
    });
    const latencyMs = Date.now() - startTime;
    return {
      ok: true,
      latencyMs,
      message: `تم الاتصال بمزود Amazon Bedrock بنجاح (${latencyMs}ms)`
    };
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function awsDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(secret, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

async function invokeBedrockWithSigV4({ region, modelId, body, timeoutSeconds }) {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKey || !secretKey) {
    throw new Error('Amazon Bedrock requires AWS credentials from the server environment or the AWS SDK credential chain.');
  }

  const service = 'bedrock';
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const canonicalUri = `/model/${encodeURIComponent(modelId)}/invoke`;
  const endpoint = `https://${host}${canonicalUri}`;
  const { amzDate, dateStamp } = awsDate();
  const payloadHash = hash(body);
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((key) => `${key}:${headers[key]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalRequest = ['POST', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hash(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(secretKey, dateStamp, region, service), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutSeconds || 30) * 1000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, authorization },
      body,
      signal: controller.signal
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.message || data.error?.message || 'Bedrock request failed.');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(str, fallback = {}) {
  if (typeof str !== 'string') return str || fallback;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

function createProvider(settings) {
  // This used to lazily self-load via `settings = getProviderSettings(true)`,
  // but that function is async: the assignment produced a Promise, so
  // `settings.provider` below was undefined and the call fell through to
  // BedrockProvider holding a Promise as its configuration. The failure was
  // silent -- you got a provider object that could never work, regardless of
  // which provider the store had actually configured. (Wave 9 recorded this
  // Bedrock fallthrough as unreachable; it was reachable through exactly here.)
  //
  // createProvider is synchronous and every real caller already resolves its
  // settings first, so the honest contract is to require them.
  if (!settings || typeof settings !== 'object' || typeof settings.then === 'function') {
    throw new Error('createProvider() requires resolved provider settings; await getProviderSettings() first.');
  }
  switch (settings.provider) {
    case 'openai-compatible':
    case 'custom-openai':
    case 'openrouter':
      return new OpenAICompatibleProvider(settings);
    case 'anthropic-compatible':
      return new AnthropicCompatibleProvider(settings);
    case 'gemini':
      return new GeminiProvider(settings);
    case 'bedrock':
    default:
      return new BedrockProvider(settings);
  }
}

async function testProvider(settings) {
  // `settings || getProviderSettings(true)` handed createProvider a Promise
  // whenever no settings were passed -- which is the only way the admin
  // panel's "test connection" button calls it (routes/api/admin-ai.js).
  // So the diagnostic always tested a misconfigured Bedrock provider instead
  // of the provider the store is actually set up with.
  const resolved = settings || (await getProviderSettings(true));
  const provider = createProvider(resolved);
  return provider.test();
}

module.exports = {
  AIProvider,
  BedrockProvider,
  OpenAICompatibleProvider,
  AnthropicCompatibleProvider,
  GeminiProvider,
  createProvider,
  testProvider
};
