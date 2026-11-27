async function hashAdminPassword(salt, password) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from(atob(salt), char => char.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 120000, hash: 'SHA-256' }, material, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function unlockAdminPanel() {
  const credentialKey = 'epic_poll_admin_credential';
  const sessionKey = 'epic_poll_admin_unlocked';
  const screen = document.getElementById('admin-auth-screen');
  const app = document.getElementById('admin-app');
  if (sessionStorage.getItem(sessionKey) === '1') {
    screen.classList.add('hidden');
    app.hidden = false;
    return true;
  }

  const form = document.getElementById('admin-auth-form');
  const password = document.getElementById('admin-auth-password');
  const confirmWrap = document.getElementById('admin-auth-confirm-wrap');
  const confirm = document.getElementById('admin-auth-confirm');
  const submit = document.getElementById('admin-auth-submit');
  const error = document.getElementById('admin-auth-error');
  const firstUse = !localStorage.getItem(credentialKey);
  document.getElementById('admin-auth-mode').textContent = firstUse ? 'First-time setup' : 'Admin sign in';
  document.getElementById('admin-auth-title').textContent = firstUse ? 'Set an admin password' : 'Unlock admin panel';
  document.getElementById('admin-auth-description').textContent = firstUse
    ? 'Choose a password with at least 8 characters. It will be saved in this browser.'
    : 'Enter your admin password to continue.';
  password.autocomplete = firstUse ? 'new-password' : 'current-password';
  if (firstUse) {
    confirmWrap.classList.remove('hidden');
    confirm.required = true;
    submit.textContent = 'Set password';
  }

  return new Promise(resolve => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      try {
        if (!crypto?.subtle) throw new Error('Open the admin page on localhost or HTTPS to enable password protection.');
        const value = password.value;
        if (firstUse) {
          if (value.length < 8) throw new Error('Use at least 8 characters.');
          if (value !== confirm.value) throw new Error('The passwords do not match.');
          const saltBytes = crypto.getRandomValues(new Uint8Array(16));
          const salt = btoa(String.fromCharCode(...saltBytes));
          const hash = await hashAdminPassword(salt, value);
          localStorage.setItem(credentialKey, JSON.stringify({ salt, hash }));
        } else {
          const credential = JSON.parse(localStorage.getItem(credentialKey) || '{}');
          if (await hashAdminPassword(credential.salt, value) !== credential.hash) throw new Error('Incorrect password. Try again.');
        }
        sessionStorage.setItem(sessionKey, '1');
        screen.classList.add('hidden');
        app.hidden = false;
        resolve(true);
      } catch (failure) {
        error.textContent = failure.message || 'Could not verify the password.';
        password.value = '';
        password.focus();
      } finally {
        submit.disabled = false;
      }
    });
  });
}

function initializeAdminPanel() {
(() => {
  const STORAGE_PREFIX = 'pollwave_session_';
  const el = id => document.getElementById(id);
  let sessionCode = '';
  let selectedPollId = '';
  let refreshTimer;

  function readSession(code) {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + code)); } catch { return null; }
  }
  function writeSession(data) {
    data.lastUpdated = Date.now();
    localStorage.setItem(STORAGE_PREFIX + sessionCode, JSON.stringify(data));
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function notify(message) {
    const node = el('admin-toast');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => node.classList.remove('visible'), 2400);
  }
  function listSessions() {
    const select = el('admin-session-select');
    const previous = select.value;
    const sessions = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data?.session?.code) sessions.push({ code: data.session.code, title: data.session.title || 'Untitled session' });
      } catch { /* Ignore invalid entries. */ }
    }
    sessions.sort((a, b) => a.title.localeCompare(b.title));
    select.innerHTML = '<option value="">Select a saved session</option>' + sessions.map(item => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.title)}</option>`).join('');
    if (sessions.some(item => item.code === previous)) select.value = previous;
    el('admin-empty').classList.toggle('hidden', sessions.length > 0 || Boolean(sessionCode));
  }
  function openSession(code) {
    code = String(code || '').trim().toUpperCase();
    const data = readSession(code);
    if (!data?.session) { notify('That saved session is no longer available.'); return; }
    sessionCode = code;
    selectedPollId = '';
    el('admin-session-select').value = code;
    el('admin-workspace').classList.remove('hidden');
    el('admin-empty').classList.add('hidden');
    render(data);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      const latest = readSession(sessionCode);
      if (latest) render(latest);
      else closeSession();
    }, 1400);
  }
  function closeSession() {
    sessionCode = '';
    clearInterval(refreshTimer);
    el('admin-workspace').classList.add('hidden');
    listSessions();
  }
  function render(data) {
    const polls = data.polls || [];
    if (!polls.some(poll => poll.id === selectedPollId)) selectedPollId = polls[0]?.id || '';
    el('admin-session-name').textContent = data.session.title || 'Untitled session';
    const live = polls.find(poll => poll.id === data.activePollId);
    el('admin-status-text').textContent = live ? `Live: ${live.question}` : 'No poll live';
    el('admin-status-dot').classList.toggle('is-live', Boolean(live));
    renderPollList(polls, data.activePollId);
    renderResults(polls.find(poll => poll.id === selectedPollId));
  }
  function renderPollList(polls, activeId) {
    const list = el('admin-poll-list');
    if (!polls.length) { list.innerHTML = '<div class="admin-empty">No activities yet. Add a poll to begin.</div>'; return; }
    list.innerHTML = polls.map(poll => {
      const total = poll.type === 'mc' ? (poll.votes || []).reduce((sum, count) => sum + count, 0) : (poll.responses || []).length;
      return `<article class="admin-poll-row ${poll.id === selectedPollId ? 'selected' : ''}">
        <button class="admin-poll-select" data-select="${escapeHtml(poll.id)}"><strong>${escapeHtml(poll.question)}</strong><span>${poll.type === 'mc' ? 'Multiple choice' : poll.type === 'oe' ? 'Open ended' : 'Word cloud'} · ${total} responses</span></button>
        <button class="btn ${activeId === poll.id ? 'btn-danger' : 'btn-success'} btn-sm" data-toggle="${escapeHtml(poll.id)}">${activeId === poll.id ? '■ End' : '▶ Launch'}</button>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => { selectedPollId = button.dataset.select; render(readSession(sessionCode)); }));
    list.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
      const data = readSession(sessionCode);
      if (!data) return;
      data.activePollId = data.activePollId === button.dataset.toggle ? null : button.dataset.toggle;
      writeSession(data);
      render(data);
      notify(data.activePollId ? 'Poll is live for participants.' : 'Poll ended.');
    }));
  }
  function renderResults(poll) {
    const output = el('admin-results');
    if (!poll) {
      el('admin-results-title').textContent = 'Select an activity';
      el('admin-response-total').textContent = '';
      output.innerHTML = '<div class="admin-empty">Choose a poll to view its current results.</div>';
      return;
    }
    el('admin-results-title').textContent = poll.question;
    if (poll.type === 'mc') {
      const votes = poll.votes || [];
      const total = votes.reduce((sum, count) => sum + count, 0);
      el('admin-response-total').textContent = `${total} votes`;
      output.innerHTML = (poll.options || []).map((option, index) => {
        const count = votes[index] || 0;
        const percent = total ? Math.round(count / total * 100) : 0;
        return `<div class="admin-result-row"><div><span>${escapeHtml(option)}</span><span>${count} · ${percent}%</span></div><div class="admin-result-track"><i style="width:${percent}%"></i></div></div>`;
      }).join('') || '<div class="admin-empty">No answer options.</div>';
    } else {
      const responses = poll.responses || [];
      el('admin-response-total').textContent = `${responses.length} responses`;
      output.innerHTML = responses.length ? `<div class="admin-response-list">${responses.map(response => `<div class="admin-response"><p>${escapeHtml(response.text)}</p><small>${escapeHtml(response.name || 'Anonymous')}</small></div>`).join('')}</div>` : '<div class="admin-empty">No responses yet.</div>';
    }
  }
  function exportResults() {
    const data = readSession(sessionCode);
    if (!data) return;
    const rows = [['Session', data.session.title], [], ['Activity', 'Type', 'Result', 'Count']];
    (data.polls || []).forEach(poll => {
      const type = poll.type === 'mc' ? 'Multiple choice' : poll.type === 'oe' ? 'Open ended' : 'Word cloud';
      if (poll.type === 'mc') (poll.options || []).forEach((option, index) => rows.push([poll.question, type, option, (poll.votes || [])[index] || 0]));
      else (poll.responses || []).forEach(response => rows.push([poll.question, type, response.text, 1]));
    });
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `epic-poll-${data.session.code}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  el('admin-session-select').addEventListener('change', event => { if (event.target.value) openSession(event.target.value); });
  el('admin-export-btn').addEventListener('click', exportResults);
  el('admin-signout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('epic_poll_admin_unlocked');
    window.location.reload();
  });
  el('admin-add-btn').addEventListener('click', () => el('admin-add-form').classList.toggle('hidden'));
  el('admin-cancel-add').addEventListener('click', () => el('admin-add-form').classList.add('hidden'));
  el('admin-add-form').addEventListener('submit', event => {
    event.preventDefault();
    const question = el('admin-question').value.trim();
    const options = el('admin-options').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!question || options.length < 2) { notify('Add a question and at least two options.'); return; }
    const data = readSession(sessionCode);
    if (!data) return;
    const poll = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), type: 'mc', question, options, votes: new Array(options.length).fill(0), responses: [] };
    data.polls = data.polls || [];
    data.polls.push(poll);
    writeSession(data);
    selectedPollId = poll.id;
    el('admin-add-form').reset();
    el('admin-add-form').classList.add('hidden');
    render(data);
    notify('Poll added.');
  });
  window.addEventListener('storage', event => {
    listSessions();
    if (sessionCode && event.key === STORAGE_PREFIX + sessionCode) { const data = readSession(sessionCode); if (data) render(data); }
  });
  listSessions();
  setInterval(listSessions, 1800);
})();
}

unlockAdminPanel().then(unlocked => { if (unlocked) initializeAdminPanel(); });
