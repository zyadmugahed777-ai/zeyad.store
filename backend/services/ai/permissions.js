const { getRepositories } = require('../../repositories');

async function getAiPermissions() {
  return await getRepositories().ai.getAiPermissions();
}

async function hasAiPermission(permissionKey) {
  return await getRepositories().ai.hasAiPermission(permissionKey);
}

async function saveAiPermissions(input) {
  const repos = getRepositories();
  const permissions = (await repos.ai.getAiPermissions()) || [];

  await repos.tx.run(async (client) => {
    const txRepos = getRepositories(null, client);
    for (const permission of permissions) {
      await txRepos.ai.updateAiPermission(permission.permission_key, input.includes(permission.permission_key));
    }
  });

  return await getAiPermissions();
}

async function writesEnabled() {
  return await hasAiPermission('execute_ai_actions');
}

module.exports = { getAiPermissions, hasAiPermission, saveAiPermissions, writesEnabled };
