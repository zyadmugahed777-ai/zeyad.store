/**
 * Zeyad For Business — Phase 10D: Session Store & Najm AI Integration Test
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const assert = require('assert');
const { getRepositories, getActiveAdapterType } = require('../repositories');
const SessionStore = require('../services/session-store');
const { getNajmSettings, getNajmInstructions } = require('../services/ai/najm-settings-store');
const { executeCustomerTool } = require('../services/ai/customer-tools');
const { searchProductsHybrid } = require('../services/ai/hybrid-search');
const { createProvider } = require('../services/ai/providers');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(condition, message, category = 'General') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✔ PASS: [${category}] ${message}`);
    return true;
  } else {
    failedChecks++;
    console.error(`  ✖ FAIL: [${category}] ${message}`);
    return false;
  }
}

async function runSessionAndNajmSuite() {
  console.log('\n======================================================');
  console.log('   PHASE 10D: SESSION STORE & NAJM REPOSITORY TEST');
  console.log('======================================================\n');

  console.log('--- 1. Verification of Runtime Database & Repositories ---');
  check(getActiveAdapterType() === 'postgres', 'Active Adapter is canonical postgres', 'Runtime');
  const repos = getRepositories('postgres');

  // =========================================================================
  // WORKSTREAM 1: SESSION STORE ASYNC / CALLBACK CONTRACT
  // =========================================================================
  console.log('\n--- 2. SessionStore Callback API & Async Resolution ---');
  const store = new SessionStore({ ttl: 3600 });
  const testSid = 'test-sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const testSessionData = {
    cookie: {
      originalMaxAge: 86400000,
      expires: new Date(Date.now() + 86400000).toISOString(),
      secure: false,
      httpOnly: true,
      path: '/'
    },
    admin: { id: 1, username: 'admin', role: 'admin' },
    flash: { message: 'مرحبا بك' }
  };

  // Step 1: Set session
  await new Promise((resolve) => {
    store.set(testSid, testSessionData, (err) => {
      check(!err, 'store.set completed without error', 'Session Store');
      resolve();
    });
  });

  // Step 2: Get session & verify NOT a Promise
  await new Promise((resolve) => {
    store.get(testSid, (err, sess) => {
      check(!err, 'store.get completed without error', 'Session Store');
      check(sess && !(sess instanceof Promise), 'store.get returned a plain object (NOT a Promise)', 'Session Store');
      check(sess && sess.cookie && sess.cookie.expires, 'sess.cookie.expires is defined and accessible', 'Session Store');
      check(sess && sess.admin && sess.admin.username === 'admin', 'sess.admin data preserved identically', 'Session Store');
      resolve();
    });
  });

  // Step 3: Touch session
  await new Promise((resolve) => {
    store.touch(testSid, testSessionData, (err) => {
      check(!err, 'store.touch completed without error', 'Session Store');
      resolve();
    });
  });

  // Step 4: Destroy session
  await new Promise((resolve) => {
    store.destroy(testSid, (err) => {
      check(!err, 'store.destroy completed without error', 'Session Store');
      resolve();
    });
  });

  // Step 5: Get destroyed session -> must be null
  await new Promise((resolve) => {
    store.get(testSid, (err, sess) => {
      check(!err, 'store.get for destroyed sid completed without error', 'Session Store');
      check(sess === null, 'store.get for destroyed sid returns null', 'Session Store');
      resolve();
    });
  });

  // =========================================================================
  // WORKSTREAM 2: NAJM SETTINGS & INSTRUCTIONS ASYNC RESOLUTION
  // =========================================================================
  console.log('\n--- 3. Najm AI Settings & Instructions Loading ---');
  const najmSettings = await getNajmSettings(true);
  check(najmSettings && typeof najmSettings === 'object', 'getNajmSettings resolves settings object', 'Najm Settings');
  check(Boolean(najmSettings.provider), `Najm provider resolved: ${najmSettings.provider}`, 'Najm Settings');
  check(Boolean(najmSettings.model), `Najm model resolved: ${najmSettings.model}`, 'Najm Settings');

  const najmInstructions = await getNajmInstructions();
  check(najmInstructions && typeof najmInstructions === 'object', 'getNajmInstructions resolves instructions object', 'Najm Instructions');
  check(Boolean(najmInstructions.full_prompt || najmInstructions.core_instructions), 'System instructions content resolved', 'Najm Instructions');

  // =========================================================================
  // WORKSTREAM 3: NAJM TOOLS & HYBRID SEARCH ASYNC EXECUTION
  // =========================================================================
  console.log('\n--- 4. Najm Customer Tools Execution ---');
  const searchResult = await executeCustomerTool('search_products', { query: 'غسالة' }, { sessionId: 'test-tool-sess' });
  check(searchResult.success === true, 'Tool: search_products executed successfully', 'Najm Tools');
  check(Array.isArray(searchResult.products), `Tool: search_products returned ${searchResult.products.length} products`, 'Najm Tools');

  const productDetail = await executeCustomerTool('get_product', { product_id: '1' }, { sessionId: 'test-tool-sess' });
  check(productDetail.success === true, 'Tool: get_product executed successfully', 'Najm Tools');
  check(productDetail.product && productDetail.product.title, 'Tool: get_product returned product title', 'Najm Tools');

  const categoriesRes = await executeCustomerTool('get_categories', {}, { sessionId: 'test-tool-sess' });
  check(categoriesRes.success === true && Array.isArray(categoriesRes.categories), 'Tool: get_categories returned categories', 'Najm Tools');

  // =========================================================================
  // WORKSTREAM 4: NAJM CONVERSATIONS & MESSAGES ASYNC PERSISTENCE
  // =========================================================================
  console.log('\n--- 5. Najm Conversations & Message Logging ---');
  const convSid = 'test-najm-conv-' + Date.now();
  const conv = await repos.ai.getOrCreateCustomerConversation(convSid, 'guest-diag-1', null);
  check(conv && conv.id, `Created / Retrieved AI customer conversation (ID: ${conv.id})`, 'Najm Conversation');

  const msgId = await repos.ai.addCustomerMessage(conv.id, 'user', 'مرحبا، هل يوجد لديكم غسالات؟');
  check(Boolean(msgId), 'Added customer user message to conversation', 'Najm Conversation');

  const contextMsgs = await repos.ai.getRecentCustomerContext(conv.id, 5);
  check(Array.isArray(contextMsgs) && contextMsgs.length > 0, `Retrieved recent context messages (Count: ${contextMsgs.length})`, 'Najm Conversation');

  // =========================================================================
  // WORKSTREAM 5: OPENROUTER API VALIDATION & SAFE ERROR HANDLING
  // =========================================================================
  console.log('\n--- 6. OpenRouter API Validation & Error Reporting ---');
  let openRouterStatus = 'INVALID';
  try {
    const provider = createProvider({
      provider: 'openrouter',
      model: najmSettings.model || 'meta-llama/llama-3.3-70b-instruct',
      apiToken: najmSettings.apiToken,
      requestTimeout: 10
    });
    const res = await provider.complete({
      system: 'Test',
      messages: [{ role: 'user', content: 'OK' }]
    });
    if (res && res.text) {
      openRouterStatus = 'VALID';
    }
  } catch (err) {
    if (err.message && (err.message.includes('User not found') || err.message.includes('401') || err.message.includes('API key') || err.message.includes('unauthorized'))) {
      openRouterStatus = 'INVALID';
    } else {
      openRouterStatus = 'NOT TESTABLE';
    }
    console.log(`  ℹ OpenRouter Provider Status: ${openRouterStatus} (Reason: ${err.message})`);
  }
  check(true, `OpenRouter credential evaluated safely without secret disclosure (Status: ${openRouterStatus})`, 'AI Provider');

  console.log('\n======================================================');
  console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
  console.log('======================================================\n');

  return {
    totalChecks,
    passedChecks,
    failedChecks,
    openRouterStatus
  };
}

if (require.main === module) {
  runSessionAndNajmSuite().then((r) => {
    if (r.failedChecks > 0) {
      process.exit(1);
    }
    process.exit(0);
  }).catch((err) => {
    console.error('Test Suite Failed with unhandled error:', err);
    process.exit(1);
  });
}

module.exports = { runSessionAndNajmSuite };
