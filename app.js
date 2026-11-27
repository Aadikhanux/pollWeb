/**
 * PollWave — Live Polling App
 * SPA Logic: Session management, Presenter & Participant views,
 * Real-time simulation via localStorage + storage events.
 */

// ============================================================
// STATE
// ============================================================
const STATE = {
  currentView: 'landing',       // 'landing' | 'presenter' | 'participant'
  session: null,                // { id, code, title, presenterName, createdAt }
  polls: [],                    // Array of poll objects
  selectedPollId: null,         // Currently selected in sidebar
  activePollId: null,           // Currently active (live) poll
  participantName: '',          // Participant's chosen name
  participantId: null,          // Random ID for this participant session
  votedPolls: {},               // { pollId: optionIndex | 'submitted' }
  upvotedQuestions: new Set(),  // Set of Q&A item IDs upvoted
  qaItems: [],                  // { id, text, upvotes, time, name }
  participantCount: 0,
  syncInterval: null,
};

// ============================================================
// UTILS
// ============================================================
function genId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  return Math.floor(diff / 3600000) + 'h ago';
}

// ============================================================
// TOAST
// ============================================================
function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId + '-view');
  if (target) target.classList.add('active');
  STATE.currentView = viewId;
}

// ============================================================
// LOCAL STORAGE SYNC
// ============================================================
function saveSession() {
  if (!STATE.session) return;
  const data = {
    session: STATE.session,
    polls: STATE.polls,
    activePollId: STATE.activePollId,
    qaItems: STATE.qaItems,
    participantCount: STATE.participantCount,
    lastUpdated: Date.now(),
  };
  localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify(data));
}

function loadSession(code) {
  const raw = localStorage.getItem('pollwave_session_' + code);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function findLatestLivePoll() {
  let latest = null;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith('pollwave_session_')) continue;
    const data = loadSession(key.slice('pollwave_session_'.length));
    if (!data?.activePollId) continue;
    const poll = (data.polls || []).find(item => item.id === data.activePollId);
    if (!poll) continue;
    const timestamp = poll.createdAt || data.session?.createdAt || 0;
    if (!latest || timestamp > latest.timestamp) latest = { code: data.session.code, title: data.session.title || 'Live session', poll, timestamp };
  }
  return latest;
}

function renderLatestPublicPoll() {
  const button = document.getElementById('public-poll-join-btn');
  if (!button) return;
  const latest = findLatestLivePoll();
  if (!latest) {
    document.getElementById('public-poll-question').textContent = 'No live poll right now';
    document.getElementById('public-poll-session').textContent = 'Check back when a new poll goes live.';
    button.textContent = 'No poll available';
    button.disabled = true;
    button.removeAttribute('data-session-code');
    return;
  }
  document.getElementById('public-poll-question').textContent = latest.poll.question;
  document.getElementById('public-poll-session').textContent = latest.title;
  button.textContent = 'Answer this poll';
  button.disabled = false;
  button.dataset.sessionCode = latest.code;
}

function startSyncLoop(role) {
  if (STATE.syncInterval) clearInterval(STATE.syncInterval);
  STATE.syncInterval = setInterval(() => {
    if (role === 'presenter') {
      // Read other tabs' changes before writing, so the separate admin page can control this session.
      refreshPresenterUI();
      saveSession();
    } else {
      // Participant reads state from storage
      syncParticipant();
    }
  }, 1500);
}

function stopSync() {
  if (STATE.syncInterval) clearInterval(STATE.syncInterval);
}

// ============================================================
// PRESENTER — SESSION CREATION
// ============================================================
function createSession(title, presenterName) {
  const code = genCode();
  STATE.session = {
    id: genId(),
    code,
    title: title || 'My Session',
    presenterName: presenterName || 'Presenter',
    createdAt: Date.now(),
  };
  STATE.polls = [];
  STATE.activePollId = null;
  STATE.qaItems = [];
  STATE.participantCount = 0;
  saveSession();
  enterPresenterView();
}

function enterPresenterView() {
  showView('presenter');
  document.getElementById('p-session-title').textContent = STATE.session.title || 'Admin Panel';

  renderSidebar();
  renderMainPanel();
  updatePresenterStats();

  // Show Q&A button
  document.getElementById('p-qa-toggle-btn').classList.remove('hidden');

  startSyncLoop('presenter');
}

// ============================================================
// PRESENTER — SIDEBAR
// ============================================================
function renderSidebar() {
  const list = document.getElementById('p-polls-list');
  const countEl = document.getElementById('p-polls-count');
  countEl.textContent = STATE.polls.length;

  if (STATE.polls.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No activities yet</div>';
    return;
  }

  list.innerHTML = '';
  STATE.polls.forEach(poll => {
    const item = document.createElement('div');
    item.className = 'poll-item' +
      (STATE.selectedPollId === poll.id ? ' selected' : '') +
      (STATE.activePollId === poll.id ? ' active-poll' : '');
    const typeLabels = { mc: '📊', oe: '💬', wc: '☁️' };
    const totalVotes = poll.type === 'mc' ? (poll.votes || []).reduce((a, b) => a + b, 0) : (poll.responses || []).length;
    item.innerHTML = `
      <div class="poll-item-title">${escHtml(poll.question)}</div>
      <div class="poll-item-meta">
        <span class="badge badge-blue" style="font-size:10px;">${typeLabels[poll.type] || '📊'} ${poll.type === 'mc' ? 'Poll' : poll.type === 'oe' ? 'Open' : 'Word Cloud'}</span>
        ${STATE.activePollId === poll.id ? '<span class="badge badge-green">LIVE</span>' : ''}
        <span style="font-size:11px;color:var(--text-muted);">${totalVotes} resp.</span>
      </div>
    `;
    item.addEventListener('click', () => selectPoll(poll.id));
    list.appendChild(item);
  });
}

function selectPoll(pollId) {
  STATE.selectedPollId = pollId;
  renderSidebar();
  renderMainPanel();
}

// ============================================================
// PRESENTER — MAIN PANEL
// ============================================================
function renderMainPanel() {
  const emptyState = document.getElementById('p-empty-state');
  const detail = document.getElementById('p-poll-detail');

  if (!STATE.selectedPollId) {
    emptyState.classList.remove('hidden');
    detail.classList.add('hidden');
    return;
  }

  const poll = STATE.polls.find(p => p.id === STATE.selectedPollId);
  if (!poll) {
    STATE.selectedPollId = null;
    emptyState.classList.remove('hidden');
    detail.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  detail.classList.remove('hidden');

  // Type badge
  const badgeEl = document.getElementById('p-poll-type-badge');
  const typeInfo = { mc: ['MULTIPLE CHOICE', 'badge-blue'], oe: ['OPEN ENDED', 'badge-purple'], wc: ['WORD CLOUD', 'badge-green'] };
  const [label, cls] = typeInfo[poll.type] || ['POLL', 'badge-blue'];
  badgeEl.className = 'badge ' + cls;
  badgeEl.textContent = label;

  document.getElementById('p-poll-title').textContent = poll.question;

  // Activate button
  const activateBtn = document.getElementById('p-activate-btn');
  if (STATE.activePollId === poll.id) {
    activateBtn.textContent = '⏹ Deactivate';
    activateBtn.className = 'btn btn-danger';
  } else {
    activateBtn.textContent = '▶ Activate';
    activateBtn.className = 'btn btn-success';
  }

  // Show/hide panels
  const resultsPanel = document.getElementById('p-results-panel');
  const wordcloudPanel = document.getElementById('p-wordcloud-panel');

  if (poll.type === 'wc') {
    resultsPanel.classList.add('hidden');
    wordcloudPanel.classList.remove('hidden');
    renderWordCloud(poll);
  } else {
    wordcloudPanel.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
    renderResults(poll);
  }

  updatePresenterStats();
}

function renderResults(poll) {
  const container = document.getElementById('p-results-container');
  const totalVotesLabel = document.getElementById('p-total-votes-label');

  if (poll.type === 'mc') {
    const votes = poll.votes || new Array(poll.options.length).fill(0);
    const total = votes.reduce((a, b) => a + b, 0);
    const maxVotes = Math.max(...votes, 1);
    totalVotesLabel.innerHTML = `<span class="live-dot"></span> ${total} total votes`;
    document.getElementById('p-stat-votes').textContent = total;

    container.innerHTML = '';
    poll.options.forEach((opt, i) => {
      const count = votes[i] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const isWinner = count === maxVotes && count > 0;
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `
        <div class="result-row-header">
          <span class="result-label">${escHtml(opt)}</span>
          <span class="result-count">${count} votes</span>
        </div>
        <div class="result-bar-bg">
          <div class="result-bar ${isWinner ? 'winner' : ''}" style="width:${pct}%">
            ${pct > 10 ? `<span class="result-bar-pct">${pct}%</span>` : ''}
          </div>
        </div>
      `;
      container.appendChild(row);
    });
  } else if (poll.type === 'oe') {
    const responses = poll.responses || [];
    totalVotesLabel.innerHTML = `<span class="live-dot"></span> ${responses.length} responses`;
    document.getElementById('p-stat-votes').textContent = responses.length;
    container.innerHTML = '';
    if (responses.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px;">No responses yet.</div>';
    } else {
      responses.forEach(r => {
        const el = document.createElement('div');
        el.className = 'qa-item';
        el.innerHTML = `
          <div class="qa-item-text">${escHtml(r.text)}</div>
          <div style="font-size:12px;color:var(--text-muted);">${r.name ? escHtml(r.name) : 'Anonymous'} · ${timeAgo(r.time)}</div>
        `;
        container.appendChild(el);
      });
    }
  }
}

function renderWordCloud(poll) {
  const container = document.getElementById('p-wordcloud-container');
  const words = poll.responses || [];
  container.innerHTML = '';

  if (words.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:14px;">No words submitted yet.</div>';
    return;
  }

  // Count frequencies
  const freq = {};
  words.forEach(w => {
    const key = w.text.toLowerCase();
    freq[key] = (freq[key] || 0) + 1;
  });

  const maxFreq = Math.max(...Object.values(freq));
  const colors = ['#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ec4899','#a78bfa','#60a5fa'];

  Object.entries(freq)
    .sort((a,b) => b[1] - a[1])
    .forEach(([word, count], i) => {
      const size = 12 + Math.round((count / maxFreq) * 32);
      const color = colors[i % colors.length];
      const el = document.createElement('span');
      el.className = 'word-cloud-word';
      el.textContent = word;
      el.style.cssText = `
        font-size: ${size}px;
        color: ${color};
        background: ${color}18;
        border: 1px solid ${color}30;
        opacity: ${0.5 + (count / maxFreq) * 0.5};
        transform: rotate(${(Math.random() - 0.5) * 10}deg);
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-weight: ${400 + Math.round((count / maxFreq) * 300)};
      `;
      container.appendChild(el);
    });
}

function updatePresenterStats() {
  // Update participant count (simulate based on storage)
  const data = loadSession(STATE.session?.code);
  const participantCount = data?.participantCount || STATE.participantCount;
  document.getElementById('p-participant-count').textContent = participantCount + ' participant' + (participantCount !== 1 ? 's' : '');
  document.getElementById('p-stat-participants').textContent = participantCount;

  const poll = STATE.polls.find(p => p.id === STATE.selectedPollId);
  if (poll) {
    const votes = poll.type === 'mc'
      ? (poll.votes || []).reduce((a, b) => a + b, 0)
      : (poll.responses || []).length;
    const pct = participantCount > 0 ? Math.round((votes / participantCount) * 100) : 0;
    document.getElementById('p-stat-pct').textContent = Math.min(pct, 100) + '%';
  } else {
    document.getElementById('p-stat-votes').textContent = '0';
    document.getElementById('p-stat-participants').textContent = participantCount;
    document.getElementById('p-stat-pct').textContent = '0%';
  }

  const livePoll = STATE.polls.find(item => item.id === STATE.activePollId);
  const liveStatus = document.getElementById('admin-live-status');
  if (liveStatus) {
    liveStatus.textContent = livePoll ? `Live: ${livePoll.question}` : 'No poll live';
    liveStatus.previousElementSibling.classList.toggle('is-live', Boolean(livePoll));
  }

  // Update Q&A count
  const qaCount = STATE.qaItems.length;
  document.getElementById('p-qa-count').textContent = qaCount;
  document.getElementById('p-qa-toggle-count').textContent = qaCount;
}

function refreshPresenterUI() {
  // Reload from storage to pick up participant votes
  const data = loadSession(STATE.session?.code);
  if (!data) return;

  // Adopt the stored activity list, including changes made from admin.html.
  STATE.polls = data.polls || [];
  STATE.activePollId = data.activePollId || null;
  if (!STATE.polls.some(poll => poll.id === STATE.selectedPollId)) STATE.selectedPollId = null;

  STATE.qaItems = data.qaItems || [];
  STATE.participantCount = data.participantCount || 0;

  // Re-render if detail is shown
  if (STATE.selectedPollId) renderMainPanel();
  updatePresenterStats();
  renderQAPresenter();
}

// ============================================================
// PRESENTER — ACTIONS
// ============================================================
function activateDeactivatePoll(pollId) {
  if (STATE.activePollId === pollId) {
    STATE.activePollId = null;
    toast('Poll deactivated', 'info');
  } else {
    STATE.activePollId = pollId;
    toast('Poll is now live! 🚀', 'success');
  }
  saveSession();
  renderSidebar();
  renderMainPanel();
}

function deletePoll(pollId) {
  STATE.polls = STATE.polls.filter(p => p.id !== pollId);
  if (STATE.selectedPollId === pollId) STATE.selectedPollId = null;
  if (STATE.activePollId === pollId) STATE.activePollId = null;
  saveSession();
  renderSidebar();
  renderMainPanel();
  toast('Activity deleted', 'info');
}

function duplicatePoll(pollId) {
  const poll = STATE.polls.find(p => p.id === pollId);
  if (!poll) return;
  const clone = JSON.parse(JSON.stringify(poll));
  clone.id = genId();
  clone.votes = new Array((clone.options || []).length).fill(0);
  clone.responses = [];
  STATE.polls.push(clone);
  saveSession();
  renderSidebar();
  toast('Activity duplicated', 'success');
}

function exportResults() {
  if (!STATE.session) return;
  const rows = [['Session', STATE.session.title], [], ['Activity', 'Type', 'Result', 'Count']];
  STATE.polls.forEach(poll => {
    const type = poll.type === 'mc' ? 'Multiple choice' : poll.type === 'oe' ? 'Open ended' : 'Word cloud';
    if (poll.type === 'mc') {
      poll.options.forEach((option, index) => rows.push([poll.question, type, option, (poll.votes || [])[index] || 0]));
    } else {
      (poll.responses || []).forEach(response => rows.push([poll.question, type, response.text, 1]));
      if (!(poll.responses || []).length) rows.push([poll.question, type, 'No responses', 0]);
    }
  });
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `epic-poll-${STATE.session.code}-results.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast('Results exported', 'success');
}

// ============================================================
// PRESENTER — Q&A
// ============================================================
function renderQAPresenter() {
  const list = document.getElementById('p-qa-list');
  if (STATE.qaItems.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px;">No questions yet.</div>';
    return;
  }
  const sorted = [...STATE.qaItems].sort((a, b) => b.upvotes - a.upvotes);
  list.innerHTML = '';
  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = 'qa-item';
    el.innerHTML = `
      <div class="qa-item-text">${escHtml(item.text)}</div>
      <div class="qa-item-footer">
        <div class="qa-upvotes">▲ ${item.upvotes}</div>
        <div class="qa-time">${timeAgo(item.time)}</div>
      </div>
    `;
    list.appendChild(el);
  });
}

// ============================================================
// ADD POLL MODAL
// ============================================================
let currentPollType = 'mc';

function openAddPollModal() {
  currentPollType = 'mc';
  document.getElementById('ap-question').value = '';
  resetOptionsBuilder();
  switchPollType('mc');
  document.getElementById('poll-type-tabs').querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === 'mc');
  });
  openModal('modal-add-poll');
}

function switchPollType(type) {
  currentPollType = type;
  document.getElementById('ap-mc-section').classList.toggle('hidden', type !== 'mc');
  document.getElementById('ap-oe-section').classList.toggle('hidden', type !== 'oe');
  document.getElementById('ap-wc-section').classList.toggle('hidden', type !== 'wc');
}

function resetOptionsBuilder() {
  const builder = document.getElementById('ap-options-builder');
  builder.innerHTML = `
    <div class="option-row">
      <input type="text" class="input" placeholder="Option A" maxlength="100" />
      <button class="remove-option-btn" onclick="removeOption(this)">✕</button>
    </div>
    <div class="option-row">
      <input type="text" class="input" placeholder="Option B" maxlength="100" />
      <button class="remove-option-btn" onclick="removeOption(this)">✕</button>
    </div>
  `;
}

function addOption() {
  const builder = document.getElementById('ap-options-builder');
  const count = builder.querySelectorAll('.option-row').length;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `
    <input type="text" class="input" placeholder="Option ${letters[count]}" maxlength="100" />
    <button class="remove-option-btn" onclick="removeOption(this)">✕</button>
  `;
  builder.appendChild(row);
}

function removeOption(btn) {
  const builder = document.getElementById('ap-options-builder');
  if (builder.querySelectorAll('.option-row').length <= 2) {
    toast('Need at least 2 options', 'error');
    return;
  }
  btn.closest('.option-row').remove();
}

function savePoll() {
  const question = document.getElementById('ap-question').value.trim();
  if (!question) { toast('Please enter a question', 'error'); return; }

  let poll = {
    id: genId(),
    type: currentPollType,
    question,
    createdAt: Date.now(),
    responses: [],
  };

  if (currentPollType === 'mc') {
    const inputs = document.getElementById('ap-options-builder').querySelectorAll('input');
    const options = [...inputs].map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) { toast('Add at least 2 options', 'error'); return; }
    poll.options = options;
    poll.votes = new Array(options.length).fill(0);
  }

  STATE.polls.push(poll);
  STATE.selectedPollId = poll.id;
  saveSession();
  closeModal('modal-add-poll');
  renderSidebar();
  renderMainPanel();
  toast('Activity added! ✨', 'success');
}

// ============================================================
// PARTICIPANT — JOIN
// ============================================================
function joinSession(code) {
  code = code.trim().toUpperCase();
  if (code.length < 6) { toast('Please enter a 6-character code', 'error'); return; }

  const data = loadSession(code);
  if (!data) {
    toast('Session not found. Check the code and try again.', 'error');
    return;
  }

  // Restore session data
  STATE.session = data.session;
  STATE.polls = data.polls || [];
  STATE.activePollId = data.activePollId || null;
  STATE.qaItems = data.qaItems || [];
  STATE.participantId = genId();
  STATE.votedPolls = {};

  // Increment participant count
  data.participantCount = (data.participantCount || 0) + 1;
  STATE.participantCount = data.participantCount;
  saveParticipantSession(data);

  enterParticipantView();
}

function saveParticipantSession(data) {
  localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify({
    ...data,
    lastUpdated: Date.now(),
  }));
}

function enterParticipantView() {
  showView('participant');
  STATE.participantName = 'Anonymous';
  document.getElementById('part-waiting').classList.add('hidden');
  document.getElementById('part-mc-poll').classList.add('hidden');
  document.getElementById('part-oe-poll').classList.add('hidden');
  document.getElementById('part-wc-poll').classList.add('hidden');
  document.getElementById('part-qa-section').classList.remove('hidden');
  startSyncLoop('participant');
  syncParticipant();
}

function syncParticipant() {
  const data = loadSession(STATE.session.code);
  if (!data) return;

  STATE.polls = data.polls || [];
  STATE.activePollId = data.activePollId || null;
  STATE.qaItems = data.qaItems || [];

  renderParticipantPoll();
  renderParticipantQA();
}

function renderParticipantPoll() {
  const mcEl = document.getElementById('part-mc-poll');
  const oeEl = document.getElementById('part-oe-poll');
  const wcEl = document.getElementById('part-wc-poll');
  const waitEl = document.getElementById('part-waiting');

  mcEl.classList.add('hidden');
  oeEl.classList.add('hidden');
  wcEl.classList.add('hidden');
  waitEl.classList.add('hidden');

  if (!STATE.activePollId) {
    waitEl.classList.remove('hidden');
    return;
  }

  const poll = STATE.polls.find(p => p.id === STATE.activePollId);
  if (!poll) { waitEl.classList.remove('hidden'); return; }

  if (poll.type === 'mc') {
    renderMCPoll(poll);
    mcEl.classList.remove('hidden');
  } else if (poll.type === 'oe') {
    renderOEPoll(poll);
    oeEl.classList.remove('hidden');
  } else if (poll.type === 'wc') {
    renderWCPoll(poll);
    wcEl.classList.remove('hidden');
  }
}

function renderMCPoll(poll) {
  document.getElementById('part-mc-question').textContent = poll.question;
  const optionsEl = document.getElementById('part-mc-options');
  const resultsEl = document.getElementById('part-mc-results');
  const resultsBarsEl = document.getElementById('part-mc-results-bars');

  const hasVoted = STATE.votedPolls[poll.id] !== undefined;
  const myVote = STATE.votedPolls[poll.id];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const votes = poll.votes || new Array(poll.options.length).fill(0);
  const total = votes.reduce((a, b) => a + b, 0);

  optionsEl.innerHTML = '';
  poll.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'vote-option' + (hasVoted && myVote === i ? ' voted' : '');
    btn.disabled = hasVoted;
    btn.innerHTML = `
      <span class="vote-option-letter">${letters[i]}</span>
      <span>${escHtml(opt)}</span>
      ${hasVoted && myVote === i ? ' <span style="margin-left:auto;">✓</span>' : ''}
    `;
    if (!hasVoted) {
      btn.addEventListener('click', () => castVote(poll, i));
    }
    optionsEl.appendChild(btn);
  });

  if (hasVoted) {
    resultsEl.classList.remove('hidden');
    resultsBarsEl.innerHTML = '';
    poll.options.forEach((opt, i) => {
      const count = votes[i] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'vote-result-row';
      row.innerHTML = `
        <div class="vote-result-label">
          <span>${escHtml(opt)}</span>
          <span>${count} (${pct}%)</span>
        </div>
        <div class="vote-result-bar-bg">
          <div class="vote-result-bar ${myVote === i ? 'my-vote' : ''}" style="width:${pct}%"></div>
        </div>
      `;
      resultsBarsEl.appendChild(row);
    });
  } else {
    resultsEl.classList.add('hidden');
  }
}

function castVote(poll, optionIndex) {
  STATE.votedPolls[poll.id] = optionIndex;

  // Update poll in state
  const localPoll = STATE.polls.find(p => p.id === poll.id);
  if (localPoll) {
    if (!localPoll.votes) localPoll.votes = new Array(localPoll.options.length).fill(0);
    localPoll.votes[optionIndex] = (localPoll.votes[optionIndex] || 0) + 1;
  }

  // Write back to storage
  const data = loadSession(STATE.session.code);
  if (data) {
    const sp = data.polls.find(p => p.id === poll.id);
    if (sp) {
      if (!sp.votes) sp.votes = new Array(sp.options.length).fill(0);
      sp.votes[optionIndex] = (sp.votes[optionIndex] || 0) + 1;
      data.lastUpdated = Date.now();
      localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify(data));
    }
  }

  renderMCPoll(STATE.polls.find(p => p.id === poll.id) || poll);
  toast('Vote cast! 🗳️', 'success');
  spawnConfetti();
}

function renderOEPoll(poll) {
  document.getElementById('part-oe-question').textContent = poll.question;
  const hasSubmitted = STATE.votedPolls[poll.id] === 'submitted';
  document.getElementById('part-oe-answer').value = '';
  document.getElementById('part-oe-submitted').classList.toggle('hidden', !hasSubmitted);
  document.querySelector('#part-oe-poll .input-group').classList.toggle('hidden', hasSubmitted);
}

function submitOEAnswer() {
  const poll = STATE.polls.find(p => p.id === STATE.activePollId);
  if (!poll) return;
  if (STATE.votedPolls[poll.id] === 'submitted') { toast('Already submitted!', 'info'); return; }
  const text = document.getElementById('part-oe-answer').value.trim();
  if (!text) { toast('Please type an answer first', 'error'); return; }

  STATE.votedPolls[poll.id] = 'submitted';

  const data = loadSession(STATE.session.code);
  if (data) {
    const sp = data.polls.find(p => p.id === poll.id);
    if (sp) {
      if (!sp.responses) sp.responses = [];
      sp.responses.push({ text, name: STATE.participantName, time: Date.now() });
      data.lastUpdated = Date.now();
      localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify(data));
    }
  }

  document.querySelector('#part-oe-poll .input-group').classList.add('hidden');
  document.getElementById('part-oe-submitted').classList.remove('hidden');
  toast('Answer submitted! ✅', 'success');
}

function renderWCPoll(poll) {
  document.getElementById('part-wc-question').textContent = poll.question;
  const hasSubmitted = STATE.votedPolls[poll.id] === 'submitted';
  document.getElementById('part-wc-word').value = '';
  document.getElementById('part-wc-submitted').classList.toggle('hidden', !hasSubmitted);
  document.querySelector('#part-wc-poll .input-group').classList.toggle('hidden', hasSubmitted);
}

function submitWCWord() {
  const poll = STATE.polls.find(p => p.id === STATE.activePollId);
  if (!poll) return;
  if (STATE.votedPolls[poll.id] === 'submitted') { toast('Already submitted!', 'info'); return; }
  const text = document.getElementById('part-wc-word').value.trim();
  if (!text) { toast('Please type a word first', 'error'); return; }

  STATE.votedPolls[poll.id] = 'submitted';

  const data = loadSession(STATE.session.code);
  if (data) {
    const sp = data.polls.find(p => p.id === poll.id);
    if (sp) {
      if (!sp.responses) sp.responses = [];
      sp.responses.push({ text, name: STATE.participantName, time: Date.now() });
      data.lastUpdated = Date.now();
      localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify(data));
    }
  }

  document.querySelector('#part-wc-poll .input-group').classList.add('hidden');
  document.getElementById('part-wc-submitted').classList.remove('hidden');
  toast('Word added! ☁️', 'success');
}

// ============================================================
// PARTICIPANT — Q&A
// ============================================================
function submitQuestion() {
  const input = document.getElementById('part-qa-input');
  const text = input.value.trim();
  if (!text) { toast('Please type a question', 'error'); return; }

  const item = {
    id: genId(),
    text,
    upvotes: 0,
    time: Date.now(),
    name: STATE.participantName,
  };

  STATE.qaItems.push(item);
  input.value = '';

  // Write to storage
  const data = loadSession(STATE.session.code);
  if (data) {
    if (!data.qaItems) data.qaItems = [];
    data.qaItems.push(item);
    data.lastUpdated = Date.now();
    localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify(data));
  }

  renderParticipantQA();
  toast('Question submitted! 💬', 'success');
}

function upvoteQuestion(itemId) {
  if (STATE.upvotedQuestions.has(itemId)) { toast('Already upvoted!', 'info'); return; }
  STATE.upvotedQuestions.add(itemId);

  const data = loadSession(STATE.session.code);
  if (data) {
    const item = data.qaItems?.find(q => q.id === itemId);
    if (item) {
      item.upvotes = (item.upvotes || 0) + 1;
      data.lastUpdated = Date.now();
      localStorage.setItem('pollwave_session_' + STATE.session.code, JSON.stringify(data));
    }
  }

  // Update local state
  const localItem = STATE.qaItems.find(q => q.id === itemId);
  if (localItem) localItem.upvotes = (localItem.upvotes || 0) + 1;

  renderParticipantQA();
  toast('Upvoted! ▲', 'success');
}

function renderParticipantQA() {
  const list = document.getElementById('part-qa-list');
  if (!STATE.qaItems || STATE.qaItems.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px;">No questions yet. Be the first to ask!</div>';
    return;
  }
  const sorted = [...STATE.qaItems].sort((a, b) => b.upvotes - a.upvotes);
  list.innerHTML = '';
  sorted.forEach(item => {
    const hasUpvoted = STATE.upvotedQuestions.has(item.id);
    const el = document.createElement('div');
    el.className = 'qa-participant-item';
    el.innerHTML = `
      <div class="qa-participant-text">${escHtml(item.text)}</div>
      <div class="qa-participant-footer">
        <button class="upvote-btn ${hasUpvoted ? 'upvoted' : ''}" data-id="${item.id}">
          ▲ ${item.upvotes || 0}
        </button>
        <span class="qa-time">${timeAgo(item.time)}</span>
      </div>
    `;
    el.querySelector('.upvote-btn').addEventListener('click', () => upvoteQuestion(item.id));
    list.appendChild(el);
  });
}

// ============================================================
// CONFETTI (fun feedback)
// ============================================================
function spawnConfetti() {
  const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4'];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;
      top:40%;
      left:${20 + Math.random() * 60}%;
      width:8px;height:8px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      background:${colors[Math.floor(Math.random() * colors.length)]};
      pointer-events:none;
      z-index:9999;
      animation: confettiFall ${0.8 + Math.random() * 0.8}s ease-in forwards;
      animation-delay:${Math.random() * 0.3}s;
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
}

// ============================================================
// XSS PROTECTION
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// EVENT LISTENERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  // --- LANDING ---
  const openCreate = () => openModal('modal-create-session');
  document.getElementById('nav-create-btn').addEventListener('click', openCreate);
  document.getElementById('hero-create-btn').addEventListener('click', openCreate);
  document.getElementById('public-poll-join-btn').addEventListener('click', event => {
    const code = event.currentTarget.dataset.sessionCode;
    if (code) joinSession(code);
  });
  renderLatestPublicPoll();
  setInterval(() => { if (STATE.currentView === 'landing') renderLatestPublicPoll(); }, 1800);

  // --- CREATE SESSION MODAL ---
  document.getElementById('cs-cancel-btn').addEventListener('click', () => closeModal('modal-create-session'));
  document.getElementById('cs-create-btn').addEventListener('click', () => {
    const title = document.getElementById('cs-title').value.trim();
    const name = document.getElementById('cs-presenter-name').value.trim();
    createSession(title, name);
    closeModal('modal-create-session');
  });
  document.getElementById('modal-create-session').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modal-create-session');
  });

  // --- PRESENTER ---
  document.getElementById('p-add-poll-btn').addEventListener('click', openAddPollModal);
  document.getElementById('p-empty-add-btn').addEventListener('click', openAddPollModal);
  document.getElementById('p-export-results-btn').addEventListener('click', exportResults);
  document.getElementById('end-session-btn').addEventListener('click', () => {
    if (confirm('End this session? Participants will be disconnected.')) {
      stopSync();
      if (STATE.session) {
        localStorage.removeItem('pollwave_session_' + STATE.session.code);
      }
      STATE.session = null;
      STATE.polls = [];
      document.getElementById('p-qa-toggle-btn').classList.add('hidden');
      showView('landing');
      toast('Session ended', 'info');
    }
  });

  document.getElementById('p-activate-btn').addEventListener('click', () => {
    if (STATE.selectedPollId) activateDeactivatePoll(STATE.selectedPollId);
  });
  document.getElementById('p-delete-btn').addEventListener('click', () => {
    if (STATE.selectedPollId && confirm('Delete this activity?')) deletePoll(STATE.selectedPollId);
  });
  document.getElementById('p-duplicate-btn').addEventListener('click', () => {
    if (STATE.selectedPollId) duplicatePoll(STATE.selectedPollId);
  });

  // Q&A Toggle
  document.getElementById('p-qa-toggle-btn').addEventListener('click', () => {
    const overlay = document.getElementById('p-qa-overlay');
    overlay.classList.remove('hidden');
    overlay.style.transform = 'translateX(0)';
    renderQAPresenter();
  });
  document.getElementById('p-close-qa-btn').addEventListener('click', () => {
    const overlay = document.getElementById('p-qa-overlay');
    overlay.style.transform = 'translateX(100%)';
    setTimeout(() => overlay.classList.add('hidden'), 300);
  });

  // --- ADD POLL MODAL ---
  document.getElementById('ap-cancel-btn').addEventListener('click', () => closeModal('modal-add-poll'));
  document.getElementById('ap-save-btn').addEventListener('click', savePoll);
  document.getElementById('ap-add-option-btn').addEventListener('click', addOption);
  document.getElementById('modal-add-poll').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modal-add-poll');
  });

  // Poll type tabs
  document.getElementById('poll-type-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#poll-type-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    switchPollType(tab.dataset.type);
  });

  // --- PARTICIPANT ---

  document.getElementById('part-leave-btn').addEventListener('click', () => {
    stopSync();
    STATE.votedPolls = {};
    STATE.upvotedQuestions = new Set();
    STATE.participantName = '';
    showView('landing');
    toast('Left the session', 'info');
  });

  document.getElementById('part-oe-submit-btn').addEventListener('click', submitOEAnswer);
  document.getElementById('part-oe-answer').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) submitOEAnswer();
  });

  document.getElementById('part-wc-submit-btn').addEventListener('click', submitWCWord);
  document.getElementById('part-wc-word').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitWCWord();
  });

  document.getElementById('part-qa-submit-btn').addEventListener('click', submitQuestion);
  document.getElementById('part-qa-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitQuestion();
  });

  // ESC closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // localStorage change listener (cross-tab sync)
  window.addEventListener('storage', e => {
    renderLatestPublicPoll();
    if (!STATE.session) return;
    if (e.key === 'pollwave_session_' + STATE.session.code) {
      if (STATE.currentView === 'presenter') refreshPresenterUI();
      else if (STATE.currentView === 'participant') syncParticipant();
    }
  });
});

