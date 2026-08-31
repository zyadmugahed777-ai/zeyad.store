const { getRepositories } = require('../../repositories');

async function logAiActivity({
  userId,
  action,
  toolName = null,
  affectedType = null,
  affectedId = null,
  oldValue = null,
  newValue = null,
  result = 'success',
  confirmationStatus = 'not_required'
}) {
  return await getRepositories().ai.logAiActivity({
    userId,
    action,
    toolName,
    affectedType,
    affectedId,
    oldValue,
    newValue,
    result,
    confirmationStatus
  });
}

async function getAiActivity(limit = 100) {
  return await getRepositories().ai.getAiActivity(limit);
}

module.exports = { logAiActivity, getAiActivity };
