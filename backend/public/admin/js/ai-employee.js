(function () {
  const boot = window.ZFB_AI_BOOT || {};
  const csrf = boot.csrf || window.ZFB_ADMIN_CSRF || '';
  let currentConversationId = null;
  let abortController = null;
  let lastPrompt = '';
  let lastAssistantText = '';
  let pendingConfirmationId = null;

  function api(path, options = {}) {
    return fetch(`/api/admin/ai${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        ...(options.headers || {})
      }
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'Request failed');
      return data;
    });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function markdown(text) {
    const blocks = [];
    let escaped = escapeHtml(text).replace(/```([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre><code>${code}</code></pre>`);
      return `@@CODE${blocks.length - 1}@@`;
    });
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const lines = escaped.split('\n');
    const html = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().startsWith('|') && lines[index + 1] && lines[index + 1].includes('---')) {
        const rows = [];
        while (lines[index] && lines[index].trim().startsWith('|')) {
          if (!lines[index].includes('---')) {
            rows.push(lines[index].split('|').slice(1, -1).map((cell) => cell.trim()));
          }
          index += 1;
        }
        index -= 1;
        html.push(`<table>${rows.map((row, rowIndex) => `<tr>${row.map((cell) => rowIndex === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`);
      } else if (/^\d+\.\s/.test(line.trim())) {
        html.push(`<p>${line}</p>`);
      } else if (line.trim()) {
        html.push(`<p>${line}</p>`);
      }
    }
    return html.join('').replace(/@@CODE(\d+)@@/g, (_, index) => blocks[Number(index)]);
  }

  function addMessage(role, content) {
    const messages = document.getElementById('aiMessages');
    if (!messages) return null;
    const node = document.createElement('div');
    node.className = `ai-message ${role}`;
    node.innerHTML = `<div class="ai-avatar">${role === 'user' ? 'أنت' : 'AI'}</div><div class="ai-bubble">${role === 'assistant' ? markdown(content) : escapeHtml(content)}</div>`;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node.querySelector('.ai-bubble');
  }

  async function sendPrompt(prompt) {
    if (!prompt.trim()) return;
    lastPrompt = prompt.trim();
    addMessage('user', lastPrompt);
    const bubble = addMessage('assistant', 'AI is thinking...');
    abortController = new AbortController();

    try {
      const response = await fetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ conversationId: currentConversationId, message: lastPrompt }),
        signal: abortController.signal
      });
      if (!response.ok) throw new Error(await response.text());
      currentConversationId = response.headers.get('x-ai-conversation-id') || currentConversationId;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      bubble.innerHTML = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        bubble.innerHTML = markdown(text);
        bubble.parentElement.parentElement.scrollTop = bubble.parentElement.parentElement.scrollHeight;
      }
      lastAssistantText = text;
      refreshConversations();
    } catch (error) {
      if (error.name !== 'AbortError') bubble.textContent = `تعذر تنفيذ الطلب: ${error.message}`;
    } finally {
      abortController = null;
    }
  }

  async function refreshConversations(query = '') {
    const list = document.getElementById('aiConversationList');
    if (!list) return;
    const data = await api(`/conversations?q=${encodeURIComponent(query)}`);
    list.innerHTML = data.conversations.map((conversation) => (
      `<button data-conversation-id="${conversation.id}">${escapeHtml(conversation.title)}<small>${escapeHtml(conversation.updated_at)}</small></button>`
    )).join('');
  }

  function wireChat() {
    const form = document.getElementById('aiComposer');
    const prompt = document.getElementById('aiPrompt');
    if (!form || !prompt) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = prompt.value;
      prompt.value = '';
      sendPrompt(value);
    });
    document.querySelectorAll('[data-ai-suggestion]').forEach((button) => {
      button.addEventListener('click', () => sendPrompt(button.dataset.aiSuggestion));
    });
    document.getElementById('aiStop')?.addEventListener('click', () => abortController?.abort());
    document.getElementById('aiRetry')?.addEventListener('click', () => sendPrompt(lastPrompt));
    document.getElementById('aiRegenerate')?.addEventListener('click', () => sendPrompt(lastPrompt));
    document.getElementById('aiCopyLast')?.addEventListener('click', () => navigator.clipboard?.writeText(lastAssistantText || ''));
    document.getElementById('aiNewConversation')?.addEventListener('click', async () => {
      const data = await api('/conversations', { method: 'POST', body: JSON.stringify({ title: 'محادثة جديدة' }) });
      currentConversationId = data.conversation.id;
      document.getElementById('aiMessages').innerHTML = '';
      addMessage('assistant', 'تم فتح محادثة جديدة.');
      refreshConversations();
    });
    document.getElementById('aiConversationSearch')?.addEventListener('input', (event) => refreshConversations(event.target.value));
    document.getElementById('aiConversationList')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-conversation-id]');
      if (!button) return;
      currentConversationId = button.dataset.conversationId;
      const data = await api(`/conversations/${currentConversationId}`);
      const messages = document.getElementById('aiMessages');
      messages.innerHTML = '';
      data.conversation.messages.forEach((message) => addMessage(message.role, message.content));
    });
    document.querySelectorAll('[data-ask-ai]').forEach((button) => {
      button.addEventListener('click', () => {
        location.href = '/admin/ai-employee';
        sessionStorage.setItem('zfb_ai_pending_prompt', button.dataset.askAi);
      });
    });
    const pendingPrompt = sessionStorage.getItem('zfb_ai_pending_prompt');
    if (pendingPrompt) {
      sessionStorage.removeItem('zfb_ai_pending_prompt');
      sendPrompt(pendingPrompt);
    }
  }

  function wireSettings() {
    const settingsForm = document.getElementById('aiSettingsForm');
    const result = document.getElementById('aiSettingsResult');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(settingsForm);
        const payload = Object.fromEntries(formData.entries());
        payload.enableStreaming = formData.has('enableStreaming');
        payload.enableToolCalling = formData.has('enableToolCalling');
        await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
        result.textContent = 'تم حفظ إعدادات المزود.';
      });
    }
    document.getElementById('aiTestProvider')?.addEventListener('click', async () => {
      try {
        const data = await api('/test-provider', { method: 'POST', body: '{}' });
        result.textContent = data.result.message;
      } catch (error) {
        result.textContent = error.message;
      }
    });
    document.getElementById('aiToggleToken')?.addEventListener('click', () => {
      const input = settingsForm.querySelector('[name="apiToken"]');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    const instructions = document.getElementById('aiInstructionsForm');
    if (instructions) {
      instructions.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = new FormData(instructions).get('body');
        await api('/system-instructions', { method: 'PUT', body: JSON.stringify({ body }) });
      });
    }
    document.getElementById('aiResetInstructions')?.addEventListener('click', async () => {
      const data = await api('/system-instructions/reset', { method: 'POST', body: '{}' });
      instructions.querySelector('[name="body"]').value = data.systemInstructions.body;
    });
  }

  function wireTasks() {
    document.getElementById('aiTaskList')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-task-status]');
      if (!button) return;
      const article = button.closest('[data-task-id]');
      await api(`/tasks/${article.dataset.taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: button.dataset.taskStatus })
      });
      article.className = button.dataset.taskStatus;
    });
  }

  function wireKnowledge() {
    const knowledgeForm = document.getElementById('aiKnowledgeForm');
    if (knowledgeForm) {
      knowledgeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const items = Array.from(knowledgeForm.querySelectorAll('textarea')).map((textarea) => ({
          title: textarea.dataset.title,
          content: textarea.value
        })).filter((item) => item.content.trim());
        await api('/knowledge', { method: 'PUT', body: JSON.stringify({ items }) });
      });
    }

    const memoryForm = document.getElementById('aiMemoryForm');
    if (memoryForm) {
      memoryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(memoryForm).entries());
        await api('/memory', { method: 'POST', body: JSON.stringify(payload) });
        location.reload();
      });
    }
    document.getElementById('aiClearMemory')?.addEventListener('click', async () => {
      if (!confirm('هل تريد حذف كل ذاكرة الذكاء الاصطناعي؟')) return;
      await api('/memory', { method: 'DELETE' });
      location.reload();
    });
    document.getElementById('aiMemoryList')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-delete-memory]');
      if (!button) return;
      await api(`/memory/${button.dataset.deleteMemory}`, { method: 'DELETE' });
      button.closest('div').remove();
    });
  }

  function wirePermissions() {
    const form = document.getElementById('aiPermissionsForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const enabled = Array.from(form.querySelectorAll('input:checked')).map((input) => input.value);
      await api('/permissions', { method: 'PUT', body: JSON.stringify({ enabled }) });
    });
  }

  function showConfirmation(payload) {
    const modal = document.getElementById('aiConfirmModal');
    const details = document.getElementById('aiConfirmDetails');
    pendingConfirmationId = payload.confirmationId;
    details.innerHTML = ['action', 'affectedType', 'affectedId', 'oldValue', 'newValue', 'consequences'].map((key) => (
      `<dt>${key}</dt><dd>${escapeHtml(typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : payload[key])}</dd>`
    )).join('');
    modal.hidden = false;
  }

  function wireConfirmation() {
    document.getElementById('aiConfirmCancel')?.addEventListener('click', () => {
      document.getElementById('aiConfirmModal').hidden = true;
    });
    document.getElementById('aiConfirmRun')?.addEventListener('click', async () => {
      if (!pendingConfirmationId) return;
      await api(`/confirm-action/${pendingConfirmationId}`, { method: 'POST', body: '{}' });
      document.getElementById('aiConfirmModal').hidden = true;
      pendingConfirmationId = null;
    });
    window.ZFB_AI_CONFIRM_ACTION = showConfirmation;
  }

  function drawCharts() {
    if (!window.Chart) return;
    const mini = document.getElementById('aiMiniChart');
    const sales = document.getElementById('aiSalesChart');
    const config = {
      type: 'line',
      data: {
        labels: boot.salesLabels || [],
        datasets: [{
          label: 'Revenue',
          data: boot.salesValues || [],
          borderColor: '#d6a84f',
          backgroundColor: 'rgba(16, 185, 129, 0.18)',
          tension: 0.34,
          fill: true
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#9fb4b0' } }, y: { ticks: { color: '#9fb4b0' } } } }
    };
    if (mini) new Chart(mini, config);
    if (sales) new Chart(sales, config);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireChat();
    wireSettings();
    wireTasks();
    wireKnowledge();
    wirePermissions();
    wireConfirmation();
    drawCharts();
  });
}());
