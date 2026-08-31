/**
 * SQLite AI Repository Facade
 * 
 * Coordinates domain-specific AI sub-repositories:
 * - Admin AI:
 *   • provider: AdminAiProviderRepo (ai_provider_settings, ai_system_instructions)
 *   • memory: AdminAiMemoryRepo (ai_memory)
 *   • permissions: AdminAiPermissionsRepo (ai_permissions)
 *   • conversations: AdminAiConversationsRepo (ai_conversations, ai_messages)
 *   • tools: AdminAiToolsRepo (ai_tool_runs, ai_tasks)
 *   • confirmations: AdminAiConfirmationsRepo (ai_action_confirmations)
 * - Najm Customer AI:
 *   • najmSettings: NajmSettingsRepo (ai_najm_settings, ai_najm_instructions)
 *   • najmConversations: NajmConversationsRepo (ai_customer_conversations, ai_customer_messages)
 *   • najmRequests: NajmRequestsRepo (ai_customer_requests)
 *   • najmDrafts: NajmOrderDraftsRepo (ai_order_drafts)
 * - Shared AI:
 *   • audit: AiAuditRepo (ai_action_audits, ai_activity_logs)
 *   • analytics: AiAnalyticsRepo (ai_analytics_events)
 * 
 * Methods are synchronous (better-sqlite3).
 */
const PostgresBaseRepository = require('./postgres-base-repository');
const AdminAiProviderRepo = require('./ai/admin-ai-provider-repo');
const AdminAiMemoryRepo = require('./ai/admin-ai-memory-repo');
const AdminAiPermissionsRepo = require('./ai/admin-ai-permissions-repo');
const AdminAiConversationsRepo = require('./ai/admin-ai-conversations-repo');
const AdminAiToolsRepo = require('./ai/admin-ai-tools-repo');
const AdminAiConfirmationsRepo = require('./ai/admin-ai-confirmations-repo');
const NajmSettingsRepo = require('./ai/najm-settings-repo');
const NajmConversationsRepo = require('./ai/najm-conversations-repo');
const NajmRequestsRepo = require('./ai/najm-requests-repo');
const NajmOrderDraftsRepo = require('./ai/najm-order-drafts-repo');
const AiAuditRepo = require('./ai/ai-audit-repo');
const AiAnalyticsRepo = require('./ai/ai-analytics-repo');

class PostgresAiRepo extends PostgresBaseRepository {
  constructor(db) {
    super(db);

    // Sub-repositories grouped by domain
    this.provider = new AdminAiProviderRepo(this.db);
    this.memory = new AdminAiMemoryRepo(this.db);
    this.permissions = new AdminAiPermissionsRepo(this.db);
    this.conversations = new AdminAiConversationsRepo(this.db);
    this.tools = new AdminAiToolsRepo(this.db);
    this.confirmations = new AdminAiConfirmationsRepo(this.db);

    this.najmSettings = new NajmSettingsRepo(this.db);
    this.najmConversations = new NajmConversationsRepo(this.db);
    this.najmRequests = new NajmRequestsRepo(this.db);
    this.najmDrafts = new NajmOrderDraftsRepo(this.db);

    this.audit = new AiAuditRepo(this.db);
    this.analytics = new AiAnalyticsRepo(this.db);
  }

  // ----------------------------------------------------
  // Admin AI Provider Settings & Instructions
  // ----------------------------------------------------
  async getProviderSettings() {
    return this.provider.getProviderSettings();
  }

  async updateProviderSettings(data) {
    return this.provider.updateProviderSettings(data);
  }

  async getActiveSystemInstructions() {
    return this.provider.getActiveSystemInstructions();
  }

  async getInstructionHistory(limit = 20) {
    return this.provider.getInstructionHistory(limit);
  }

  async getMaxInstructionVersion() {
    return this.provider.getMaxInstructionVersion();
  }

  async deactivateAllInstructions() {
    return this.provider.deactivateAllInstructions();
  }

  async insertSystemInstruction(body, version, updatedBy) {
    return this.provider.insertSystemInstruction(body, version, updatedBy);
  }

  // ----------------------------------------------------
  // Admin AI Memory
  // ----------------------------------------------------
  async getKnowledge() {
    return this.memory.getKnowledge();
  }

  async deactivateKnowledge() {
    return this.memory.deactivateKnowledge();
  }

  async insertKnowledge(title, content, updatedBy) {
    return this.memory.insertKnowledge(title, content, updatedBy);
  }

  async getMemory(limit = 100) {
    return this.memory.getMemory(limit);
  }

  async insertMemoryItem(memoryType, title, content, updatedBy) {
    return this.memory.insertMemoryItem(memoryType, title, content, updatedBy);
  }

  async updateMemoryItem(id, memoryType, title, content, updatedBy) {
    return this.memory.updateMemoryItem(id, memoryType, title, content, updatedBy);
  }

  async deleteMemory(id) {
    return this.memory.deleteMemory(id);
  }

  async clearMemory() {
    return this.memory.clearMemory();
  }

  // ----------------------------------------------------
  // Admin AI Permissions
  // ----------------------------------------------------
  async getAiPermissions() {
    return this.permissions.getPermissions();
  }

  async hasAiPermission(permissionKey) {
    return this.permissions.hasPermission(permissionKey);
  }

  async updateAiPermission(permissionKey, isEnabled) {
    return this.permissions.updatePermission(permissionKey, isEnabled);
  }

  // ----------------------------------------------------
  // Admin AI Conversations & Messages
  // ----------------------------------------------------
  async listConversations(userId, search = '', limit = 60) {
    return this.conversations.listConversations(userId, search, limit);
  }

  async createConversation(title, userId) {
    return this.conversations.createConversation(title, userId);
  }

  async getConversationById(id) {
    return this.conversations.getConversationById(id);
  }

  async getConversationMessages(conversationId) {
    return this.conversations.getMessages(conversationId);
  }

  async renameConversation(id, title, userId) {
    return this.conversations.renameConversation(id, title, userId);
  }

  async deleteConversation(id, userId) {
    return this.conversations.deleteConversation(id, userId);
  }

  async clearConversationMessages(id) {
    return this.conversations.clearMessages(id);
  }

  async addMessage(conversationId, role, content, metadata = null) {
    return this.conversations.addMessage(conversationId, role, content, metadata);
  }

  async touchConversation(id) {
    return this.conversations.touch(id);
  }

  // ----------------------------------------------------
  // Admin AI Tools, Confirmations & Tasks
  // ----------------------------------------------------
  async logToolRun(data) {
    return this.tools.logToolRun(data);
  }

  async getToolRuns(limit = 100) {
    return this.tools.getToolRuns(limit);
  }

  async createOperationalTasks(tasks) {
    return this.tools.createTasks(tasks);
  }

  async getTasks() {
    return this.tools.getTasks();
  }

  async updateTaskStatus(taskId, status) {
    return this.tools.updateTaskStatus(taskId, status);
  }

  async createConfirmation(conversationId, userId, toolName, payload) {
    return this.confirmations.createConfirmation(conversationId, userId, toolName, payload);
  }

  async getPendingConfirmation(confirmationId) {
    return this.confirmations.getPendingConfirmation(confirmationId);
  }

  async getConfirmationById(confirmationId) {
    return this.confirmations.getConfirmationById(confirmationId);
  }

  async confirmAction(confirmationId) {
    return this.confirmations.confirmAction(confirmationId);
  }

  async rejectConfirmation(confirmationId) {
    return this.confirmations.rejectConfirmation(confirmationId);
  }

  // ----------------------------------------------------
  // Najm Customer AI Settings & Instructions
  // ----------------------------------------------------
  async getNajmSettings() {
    return this.najmSettings.getSettings();
  }

  async saveNajmSettings(data) {
    return this.najmSettings.saveSettings(data);
  }

  async getActiveNajmInstructions() {
    return this.najmSettings.getActiveInstructions();
  }

  async getMaxNajmInstructionVersion() {
    return this.najmSettings.getMaxInstructionVersion();
  }

  async deactivateAllNajmInstructions() {
    return this.najmSettings.deactivateAllInstructions();
  }

  async insertNajmInstructions(sections, fullPrompt, version, adminId) {
    return this.najmSettings.insertInstructions(sections, fullPrompt, version, adminId);
  }

  // ----------------------------------------------------
  // Najm Customer Conversations & Messages
  // ----------------------------------------------------
  async getOrCreateCustomerConversation(sessionId, guestId = null, userId = null) {
    return this.najmConversations.getOrCreateConversation(sessionId, guestId, userId);
  }

  async getCustomerConversationById(id) {
    return this.najmConversations.getConversationById(id);
  }

  async listCustomerConversations(limit = 50) {
    return this.najmConversations.listConversations(limit);
  }

  async getCustomerConversationMessages(conversationId, limit = 50) {
    return this.najmConversations.getMessages(conversationId, limit);
  }

  async getRecentCustomerContext(conversationId, limit = 6) {
    return this.najmConversations.getRecentContextMessages(conversationId, limit);
  }

  async addCustomerMessage(conversationId, sender, content, imageUrl = null, payload = null) {
    return this.najmConversations.addMessage(conversationId, sender, content, imageUrl, payload);
  }

  async updateCustomerConversationState(conversationId, title, state = {}, incrementCount = 2) {
    return this.najmConversations.updateState(conversationId, title, state, incrementCount);
  }

  // ----------------------------------------------------
  // Najm Customer Requests & Order Drafts
  // ----------------------------------------------------
  async createAiCustomerRequest(data) {
    return this.najmRequests.createRequest(data);
  }

  async listAiCustomerRequests(filter) {
    return this.najmRequests.listRequests(filter);
  }

  async getAiCustomerRequestById(idOrRequestId) {
    return this.najmRequests.getRequestById(idOrRequestId);
  }

  async updateAiCustomerRequestStatus(idOrRequestId, status, adminNotes = null) {
    return this.najmRequests.updateStatus(idOrRequestId, status, adminNotes);
  }

  async createOrderDraft(data) {
    return this.najmDrafts.createDraft(data);
  }

  async getOrderDraftByToken(draftToken) {
    return this.najmDrafts.getDraftByToken(draftToken);
  }

  async getUnconfirmedOrderDraftByToken(draftToken, sessionId = null) {
    return this.najmDrafts.getUnconfirmedDraftByToken(draftToken, sessionId);
  }

  async confirmOrderDraft(draftId) {
    return this.najmDrafts.confirmDraft(draftId);
  }

  // ----------------------------------------------------
  // Shared AI Audits & Analytics
  // ----------------------------------------------------
  async logActionAudit(data) {
    return this.audit.logActionAudit(data);
  }

  async getRecentAudits(limit = 100, action = null) {
    return this.audit.getRecentAudits(limit, action);
  }

  async logAiActivity(data) {
    return this.audit.logActivity(data);
  }

  async getAiActivity(limit = 100) {
    return this.audit.getActivity(limit);
  }

  async logAnalyticsEvent(eventType, sessionId = null, metadata = null) {
    return this.analytics.logEvent(eventType, sessionId, metadata);
  }

  async getAnalyticsEventStats(period = '30d') {
    return this.analytics.getEventStats(period);
  }
}

module.exports = PostgresAiRepo;
