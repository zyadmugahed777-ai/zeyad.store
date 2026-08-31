const { getRepositories } = require('../../repositories');

async function logActionAudit({
  sessionId = null,
  userId = null,
  action,
  targetType = null,
  targetId = null,
  payload = {},
  result = 'success',
  provider = null,
  model = null,
  ipAddress = null
}) {
  try {
    await getRepositories().ai.logActionAudit({
      sessionId,
      userId,
      action,
      targetType,
      targetId,
      payload,
      result,
      provider,
      model,
      ipAddress
    });
  } catch (err) {
    console.error('Failed to log action audit:', err.message);
  }
}

async function getRecentAudits(limit = 100, action = null) {
  return await getRepositories().ai.getRecentAudits(limit, action);
}

module.exports = { logActionAudit, getRecentAudits };