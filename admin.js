(() => {
  const client = window.supabase.createClient(window.POLL_SUPABASE_URL, window.POLL_SUPABASE_PUBLISHABLE_KEY);
  const el = id => document.getElementById(id);
  let selectedId = '';
  let refreshTimer;

  function notify(message, error = false) {
    const node = el('admin-toast');
    node.textContent = message;
    node.classList.toggle('admin-toast-error', error);
    node.classList.add('visible');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => node.classList.remove('visible'), 2800);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  async function loadPolls() {
    const { data, error } = await client.from('public_polls').select('*').order('created_at', { ascending: false });
    if (error) { notify(error.message, true); return; }
    const polls = data || [];
    if (!polls.some(poll => poll.id === selectedId)) selectedId = polls[0]?.id || '';
    renderPollList(polls);
    updateShareLink(selectedId);
    await renderResults(polls.find(poll => poll.id === selectedId));
  }
  function updateShareLink(pollId) {
    const box = el('admin-share-box');
    if (!pollId) { box.classList.add('hidden'); return; }
    const link = new URL('index.html', window.location.href);
    link.searchParams.set('poll', pollId);
    el('admin-share-url').value = link.href;
    box.classList.remove('hidden');
  }
  function renderPollList(polls) {
    const select = el('admin-session-select');
    select.innerHTML = '<option value="">Select a poll</option>' + polls.map(poll => `<option value="${escapeHtml(poll.id)}">${escapeHtml(poll.question)}${poll.is_active ? ' · LIVE' : ''}</option>`).join('');
    select.value = selectedId;
    const list = el('admin-poll-list');
    if (!polls.length) { list.innerHTML = '<div class="admin-empty">No polls yet. Add one to publish it on the homepage.</div>'; return; }
    list.innerHTML = polls.map(poll => `<article class="admin-poll-row ${poll.id === selectedId ? 'selected' : ''}">
      <button class="admin-poll-select" data-select="${escapeHtml(poll.id)}"><strong>${escapeHtml(poll.question)}</strong><span>${poll.poll_type === 'mc' ? 'Multiple choice' : poll.poll_type === 'oe' ? 'Open ended' : 'Word cloud'}${poll.is_active ? ' · LIVE' : ' · Draft'}</span></button>
      <button class="btn ${poll.is_active ? 'btn-danger' : 'btn-success'} btn-sm" data-toggle="${escapeHtml(poll.id)}">${poll.is_active ? '■ Pause' : '▶ Publish'}</button>
      <button class="btn btn-ghost btn-sm" data-delete="${escapeHtml(poll.id)}" aria-label="Delete poll">Delete</button>
    </article>`).join('');
    list.querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.select; loadPolls(); }));
    list.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => togglePoll(button.dataset.toggle)));
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deletePoll(button.dataset.delete)));
  }
  async function renderResults(poll) {
    const output = el('admin-results');
    const status = el('admin-status-text');
    el('admin-status-dot').classList.toggle('is-live', Boolean(poll?.is_active));
    if (!poll) {
      el('admin-session-name').textContent = 'Poll results';
      status.textContent = 'No poll selected';
      el('admin-response-total').textContent = '';
      output.innerHTML = '<div class="admin-empty">Create or select a poll to see its live results.</div>';
      return;
    }
    el('admin-session-name').textContent = poll.question;
    status.textContent = poll.is_active ? 'Published on the homepage' : 'Paused';
    const { data: votes, error } = await client.from('poll_votes').select('option_index,response_text').eq('poll_id', poll.id);
    if (error) { notify(error.message, true); return; }
    const answers = votes || [];
    if (poll.poll_type === 'mc') {
      const counts = (poll.options || []).map(() => 0);
      answers.forEach(vote => { if (Number.isInteger(vote.option_index) && counts[vote.option_index] !== undefined) counts[vote.option_index]++; });
      const total = counts.reduce((sum, count) => sum + count, 0);
      el('admin-response-total').textContent = `${total} votes`;
      output.innerHTML = (poll.options || []).map((option, index) => {
        const pct = total ? Math.round(counts[index] / total * 100) : 0;
        return `<div class="admin-result-row"><div><span>${escapeHtml(option)}</span><span>${counts[index]} · ${pct}%</span></div><div class="admin-result-track"><i style="width:${pct}%"></i></div></div>`;
      }).join('') || '<div class="admin-empty">No options configured.</div>';
    } else {
      el('admin-response-total').textContent = `${answers.length} responses`;
      output.innerHTML = answers.length ? `<div class="admin-response-list">${answers.map(answer => `<div class="admin-response"><p>${escapeHtml(answer.response_text)}</p></div>`).join('')}</div>` : '<div class="admin-empty">No responses yet.</div>';
    }
  }
  async function togglePoll(pollId) {
    const chosen = (await client.from('public_polls').select('is_active').eq('id', pollId).single()).data;
    if (!chosen) return;
    if (chosen.is_active) {
      const { error } = await client.from('public_polls').update({ is_active: false }).eq('id', pollId);
      if (error) notify(error.message, true);
    } else {
      const { error: pauseError } = await client.from('public_polls').update({ is_active: false }).eq('is_active', true);
      if (pauseError) { notify(pauseError.message, true); return; }
      const { error } = await client.from('public_polls').update({ is_active: true }).eq('id', pollId);
      if (error) notify(error.message, true);
    }
    await loadPolls();
  }
  async function deletePoll(pollId) {
    if (!confirm('Delete this poll and its responses?')) return;
    const { error } = await client.from('public_polls').delete().eq('id', pollId);
    if (error) { notify(error.message, true); return; }
    if (selectedId === pollId) selectedId = '';
    await loadPolls();
    notify('Poll deleted.');
  }
  async function exportResults() {
    const { data: polls, error } = await client.from('public_polls').select('*').order('created_at', { ascending: false });
    if (error) { notify(error.message, true); return; }
    const rows = [['Question', 'Type', 'Answer', 'Count']];
    for (const poll of polls || []) {
      const { data: votes } = await client.from('poll_votes').select('option_index,response_text').eq('poll_id', poll.id);
      if (poll.poll_type === 'mc') {
        const counts = (poll.options || []).map(() => 0);
        (votes || []).forEach(vote => { if (Number.isInteger(vote.option_index) && counts[vote.option_index] !== undefined) counts[vote.option_index]++; });
        poll.options.forEach((option, index) => rows.push([poll.question, poll.poll_type, option, counts[index]]));
      } else (votes || []).forEach(vote => rows.push([poll.question, poll.poll_type, vote.response_text, 1]));
    }
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'epic-poll-results.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  function setAuthenticated(session) {
    el('admin-auth-screen').classList.toggle('hidden', Boolean(session));
    el('admin-app').hidden = !session;
    if (session) {
      loadPolls();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(loadPolls, 3000);
    } else clearInterval(refreshTimer);
  }

  const authForm = el('admin-auth-form');
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = el('admin-auth-submit');
    button.disabled = true;
    el('admin-auth-error').textContent = '';
    const { data, error } = await client.auth.signInWithPassword({ email: el('admin-auth-email').value.trim(), password: el('admin-auth-password').value });
    button.disabled = false;
    if (error) { el('admin-auth-error').textContent = error.message; return; }
    authForm.reset();
    setAuthenticated(data.session);
  });
  el('admin-signout-btn').addEventListener('click', async () => { await client.auth.signOut(); });
  client.auth.onAuthStateChange((_event, session) => setAuthenticated(session));
  el('admin-session-select').addEventListener('change', event => { selectedId = event.target.value; loadPolls(); });
  el('admin-export-btn').addEventListener('click', exportResults);
  el('admin-copy-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el('admin-share-url').value);
      notify('Student link copied.');
    } catch { notify('Copy failed. Select and copy the link manually.', true); }
  });
  el('admin-add-btn').addEventListener('click', () => el('admin-add-form').classList.toggle('hidden'));
  el('admin-cancel-add').addEventListener('click', () => el('admin-add-form').classList.add('hidden'));
  el('admin-poll-type').addEventListener('change', event => {
    const mc = event.target.value === 'mc';
    el('admin-options').classList.toggle('hidden', !mc);
    el('admin-options').required = mc;
  });
  el('admin-add-form').addEventListener('submit', async event => {
    event.preventDefault();
    const question = el('admin-question').value.trim();
    const pollType = el('admin-poll-type').value;
    const options = pollType === 'mc' ? el('admin-options').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) : [];
    if (!question || (pollType === 'mc' && options.length < 2)) { notify('Add a question and at least two options for a multiple-choice poll.', true); return; }
    const { error: pauseError } = await client.from('public_polls').update({ is_active: false }).eq('is_active', true);
    if (pauseError) { notify(pauseError.message, true); return; }
    const { data, error } = await client.from('public_polls').insert({ question, poll_type: pollType, options, is_active: true }).select().single();
    if (error) { notify(error.message, true); return; }
    selectedId = data.id;
    el('admin-add-form').reset();
    el('admin-options').classList.remove('hidden');
    el('admin-options').required = true;
    el('admin-add-form').classList.add('hidden');
    await loadPolls();
    notify('Poll is live on the homepage.');
  });
  client.auth.getSession().then(({ data }) => setAuthenticated(data.session));
})();
