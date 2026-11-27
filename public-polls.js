(() => {
  const client = window.supabase.createClient(window.POLL_SUPABASE_URL, window.POLL_SUPABASE_PUBLISHABLE_KEY);
  const voterKey = 'epic_poll_voter_id';
  const voterId = localStorage.getItem(voterKey) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  localStorage.setItem(voterKey, voterId);
  const byId = id => document.getElementById(id);
  let currentPoll = null;
  let selectedOption = null;
  let refreshTimer = null;

  function showMessage(message) {
    byId('public-poll-question').textContent = message;
    byId('public-poll-session').textContent = '';
    byId('public-poll-options').replaceChildren();
    byId('public-poll-response').classList.add('hidden');
    byId('public-poll-response').value = '';
    byId('public-poll-results').replaceChildren();
    byId('public-poll-join-btn').disabled = true;
  }

  async function renderResults() {
    if (!currentPoll) return;
    const { data, error } = await client.from('poll_votes').select('option_index,response_text').eq('poll_id', currentPoll.id);
    if (error) return;
    const results = byId('public-poll-results');
    if (currentPoll.poll_type === 'mc') {
      const counts = currentPoll.options.map(() => 0);
      data.forEach(vote => { if (Number.isInteger(vote.option_index) && counts[vote.option_index] !== undefined) counts[vote.option_index]++; });
      const total = counts.reduce((sum, count) => sum + count, 0);
      results.innerHTML = `<h3>Live results <span>${total} ${total === 1 ? 'vote' : 'votes'}</span></h3>` + currentPoll.options.map((option, index) => {
        const pct = total ? Math.round(counts[index] / total * 100) : 0;
        return `<div class="public-result-row"><div><span>${escapeHtml(option)}</span><span>${counts[index]} · ${pct}%</span></div><div class="public-result-track"><i style="width:${pct}%"></i></div></div>`;
      }).join('');
    } else {
      results.innerHTML = `<h3>Live responses <span>${data.length}</span></h3>` + (data.length
        ? `<div class="public-response-list">${data.slice(-20).reverse().map(vote => `<div>${escapeHtml(vote.response_text)}</div>`).join('')}</div>`
        : '<p class="public-no-responses">No responses yet.</p>');
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function loadLatestPoll() {
    const linkedPollId = new URLSearchParams(window.location.search).get('poll');
    let query = client.from('public_polls').select('*').eq('is_active', true);
    if (linkedPollId) query = query.eq('id', linkedPollId);
    const { data: polls, error } = await query.order('created_at', { ascending: false }).limit(1);
    if (error) { showMessage('Unable to load the poll'); byId('public-poll-session').textContent = 'Check the Supabase setup and connection.'; return; }
    const nextPoll = polls?.[0];
    if (!nextPoll) { currentPoll = null; showMessage('No live poll right now'); byId('public-poll-session').textContent = 'Check back when a new poll goes live.'; return; }
    if (currentPoll?.id !== nextPoll.id) selectedOption = null;
    currentPoll = nextPoll;
    byId('public-poll-question').textContent = currentPoll.question;
    byId('public-poll-session').textContent = currentPoll.poll_type === 'mc' ? 'Choose an answer below.' : 'Your response is anonymous.';
    const options = byId('public-poll-options');
    const response = byId('public-poll-response');
    options.replaceChildren();
    response.classList.toggle('hidden', currentPoll.poll_type === 'mc');
    if (currentPoll.poll_type === 'mc') {
      currentPoll.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vote-option' + (selectedOption === index ? ' selected' : '');
        button.textContent = option;
        button.addEventListener('click', () => {
          selectedOption = index;
          options.querySelectorAll('button').forEach((item, itemIndex) => item.classList.toggle('selected', itemIndex === index));
          byId('public-poll-join-btn').disabled = false;
        });
        options.appendChild(button);
      });
    }
    byId('public-poll-join-btn').textContent = 'Submit answer';
    byId('public-poll-join-btn').disabled = false;
    const { data: priorVote } = await client.from('poll_votes').select('id').eq('poll_id', currentPoll.id).eq('voter_id', voterId).maybeSingle();
    if (priorVote) {
      byId('public-poll-session').textContent = 'Thanks, your answer has been counted.';
      byId('public-poll-join-btn').disabled = true;
    }
    await renderResults();
  }

  byId('public-poll-join-btn').addEventListener('click', async () => {
    if (!currentPoll) return;
    const button = byId('public-poll-join-btn');
    const answer = currentPoll.poll_type === 'mc' ? { option_index: selectedOption, response_text: null } : { option_index: null, response_text: byId('public-poll-response').value.trim() };
    if (currentPoll.poll_type === 'mc' && answer.option_index === null) return;
    if (currentPoll.poll_type !== 'mc' && !answer.response_text) { byId('public-poll-response').focus(); return; }
    button.disabled = true;
    const { error } = await client.from('poll_votes').insert({ poll_id: currentPoll.id, voter_id: voterId, ...answer });
    if (error) {
      byId('public-poll-session').textContent = error.code === '23505' ? 'Your answer has already been counted.' : 'Could not submit. Please try again.';
      button.disabled = error.code === '23505';
      await renderResults();
      return;
    }
    byId('public-poll-session').textContent = 'Thanks, your answer has been counted.';
    byId('public-poll-response').value = '';
    await renderResults();
  });

  client.from('public_polls').select('id').limit(1).then(({ error }) => {
    if (error) showMessage('Supabase is not ready yet');
    else loadLatestPoll();
  });
  refreshTimer = setInterval(loadLatestPoll, 2500);
  window.addEventListener('beforeunload', () => clearInterval(refreshTimer));
})();
