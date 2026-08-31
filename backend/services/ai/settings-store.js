const { getRepositories } = require('../../repositories');
const { encryptSecret, decryptSecret, maskSecret, tokenHint } = require('./crypto');
const { DEFAULT_SYSTEM_INSTRUCTIONS, PROVIDERS } = require('./defaults');

function normalizeSettings(row, includeSecret = false) {
  if (!row) {
    return {
      provider: 'bedrock',
      model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      apiBaseUrl: '',
      apiToken: '',
      maskedToken: '',
      region: 'us-east-1',
      temperature: 0.2,
      maxTokens: 4096,
      requestTimeout: 30,
      enableStreaming: false,
      enableToolCalling: false,
      enableVision: true,
      systemPromptOverride: ''
    };
  }
  const token = includeSecret ? decryptSecret(row.encrypted_api_token) : '';
  return {
    provider: row.provider,
    model: row.model,
    apiBaseUrl: row.api_base_url || '',
    apiToken: token,
    maskedToken: row.token_hint ? maskSecret('', row.token_hint) : '',
    region: row.region || 'us-east-1',
    temperature: Number(row.temperature ?? 0.2),
    maxTokens: Number(row.max_tokens ?? 4096),
    requestTimeout: Number(row.request_timeout ?? 30),
    enableStreaming: Boolean(row.enable_streaming),
    enableToolCalling: Boolean(row.enable_tool_calling),
    enableVision: row.enable_vision !== undefined ? Boolean(row.enable_vision) : true,
    systemPromptOverride: row.system_prompt_override || ''
  };
}

async function getProviderSettings(includeSecret = false) {
  const row = await getRepositories().ai.getProviderSettings();
  return normalizeSettings(row, includeSecret);
}

async function saveProviderSettings(input, adminId) {
  const repos = getRepositories();
  const current = (await repos.ai.getProviderSettings()) || {};
  const providerIds = PROVIDERS.map((provider) => provider.id);
  const provider = providerIds.includes(input.provider) ? input.provider : current.provider;
  const encryptedToken = input.apiToken && !input.apiToken.includes('••')
    ? encryptSecret(input.apiToken)
    : current.encrypted_api_token;
  const hint = input.apiToken && !input.apiToken.includes('••')
    ? tokenHint(input.apiToken)
    : current.token_hint;

  await repos.ai.updateProviderSettings({
    provider,
    model: String(input.model || current.model || ''),
    api_base_url: String(input.apiBaseUrl || ''),
    encrypted_api_token: encryptedToken,
    token_hint: hint,
    region: String(input.region || 'us-east-1'),
    temperature: Number(input.temperature ?? current.temperature ?? 0.2),
    max_tokens: Number(input.maxTokens ?? current.max_tokens ?? 4096),
    request_timeout: Number(input.requestTimeout ?? current.request_timeout ?? 30),
    enable_streaming: input.enableStreaming ? 1 : 0,
    enable_tool_calling: input.enableToolCalling ? 1 : 0,
    enable_vision: input.enableVision !== undefined ? (input.enableVision ? 1 : 0) : (current.enable_vision ?? 1),
    system_prompt_override: input.systemPromptOverride !== undefined ? String(input.systemPromptOverride || '') : (current.system_prompt_override || ''),
    updated_by: adminId || null
  });

  return await getProviderSettings(false);
}

async function getSystemInstructions() {
  const row = await getRepositories().ai.getActiveSystemInstructions();
  return row || { body: DEFAULT_SYSTEM_INSTRUCTIONS, version: 1 };
}

async function saveSystemInstructions(body, adminId) {
  const repos = getRepositories();
  const maxVer = await repos.ai.getMaxInstructionVersion();
  const version = (maxVer || 0) + 1;
  await repos.tx.run(async (client) => {
    const txRepos = getRepositories(null, client);
    await txRepos.ai.deactivateAllInstructions();
    await txRepos.ai.insertSystemInstruction(String(body || DEFAULT_SYSTEM_INSTRUCTIONS), version, adminId || null);
  });
  return await getSystemInstructions();
}

async function resetSystemInstructions(adminId) {
  return await saveSystemInstructions(DEFAULT_SYSTEM_INSTRUCTIONS, adminId);
}

async function getInstructionHistory() {
  return await getRepositories().ai.getInstructionHistory(20);
}

async function getKnowledge() {
  return await getRepositories().ai.getKnowledge();
}

async function saveKnowledge(items, adminId) {
  const repos = getRepositories();
  await repos.tx.run(async (client) => {
    const txRepos = getRepositories(null, client);
    await txRepos.ai.deactivateKnowledge();
    for (const item of (items || [])) {
      if (item.title && item.content) {
        await txRepos.ai.insertKnowledge(item.title, item.content, adminId || null);
      }
    }
  });
  return await getKnowledge();
}

async function getMemory() {
  return await getRepositories().ai.getMemory(100);
}

async function saveMemoryItem(input, adminId) {
  const repos = getRepositories();
  if (input.id) {
    await repos.ai.updateMemoryItem(input.id, input.memory_type || 'business_rule', input.title || '', input.content || '', adminId || null);
  } else {
    await repos.ai.insertMemoryItem(input.memory_type || 'business_rule', input.title || '', input.content || '', adminId || null);
  }
  return await getMemory();
}

async function deleteMemory(id) {
  await getRepositories().ai.deleteMemory(id);
}

async function clearMemory() {
  await getRepositories().ai.clearMemory();
}

module.exports = {
  getProviderSettings,
  saveProviderSettings,
  getSystemInstructions,
  saveSystemInstructions,
  resetSystemInstructions,
  getInstructionHistory,
  getKnowledge,
  saveKnowledge,
  getMemory,
  saveMemoryItem,
  deleteMemory,
  clearMemory
};
