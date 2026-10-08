import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import axios from 'axios';
import { initDb, getDb } from '../services/db.js';
import apiRouter from '../routes/api.js';
import webhookRouter from '../routes/webhook.js';
import { dispatchAlerts } from '../services/notifier.js';
import { processWebhookPush } from '../services/githubService.js';

test('Local API, webhook and alert pipeline', async t => {
  const originalDirectory = process.cwd();
  const temporary = await mkdtemp(path.join(tmpdir(), 'keysentry-test-'));
  process.chdir(temporary);
  await initDb();
  const events = [];
  const io = { emit: (...event) => events.push(event) };
  const app = express();
  app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));
  app.use('/api', apiRouter(io));
  app.use('/api/webhook', webhookRouter(io));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const secretBefore = process.env.GITHUB_WEBHOOK_SECRET;
  const postBefore = axios.post;
  try {
    await t.test('Simulation runs real detector, persists masked history, and emits one event', async () => {
      const response = await fetch(`${url}/api/simulate`, { method: 'POST' });
      assert.equal(response.status, 200);
      const finding = await response.json();
      assert.equal(finding.source, 'simulation');
      assert.equal(finding.keyType, 'Generic Token');
      assert.ok(finding.entropy >= 3.8);
      assert.equal(finding.rawSecret, undefined);
      assert.equal(events.filter(e => e[0] === 'new-threat').length, 1);
      assert.equal(events.filter(e => e[0] === 'pr-created').length, 0);
      const history = await (await fetch(`${url}/api/threats?page=-1&limit=999`)).json();
      assert.equal(history.page, 1);
      assert.equal(history.limit, 100);
      assert.equal(history.data[0].id, finding.id);
      assert.equal(getDb().data.stats.scannedCommits, 0);
    });
    await t.test('Rejects invalid configuration', async () => {
      const response = await fetch(`${url}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entropyThreshold: -1 }) });
      assert.equal(response.status, 400);
    });
    await t.test('Verifies signed GitHub ping and rejects invalid signatures', async () => {
      process.env.GITHUB_WEBHOOK_SECRET = 'local-unit-signing-secret';
      const body = JSON.stringify({ zen: 'local test' });
      const signature = `sha256=${crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')}`;
      const headers = { 'Content-Type': 'application/json', 'x-github-event': 'ping', 'x-hub-signature-256': signature };
      assert.equal((await fetch(`${url}/api/webhook/github`, { method: 'POST', headers, body })).status, 200);
      assert.equal((await fetch(`${url}/api/webhook/github`, { method: 'POST', headers: { ...headers, 'x-hub-signature-256': 'invalid' }, body })).status, 401);
    });
    await t.test('Repeated commit deliveries are counted only once', async () => {
      const payload = { repository: { full_name: 'local/repository' }, commits: [{ id: 'local-sha', added: [], modified: [] }] };
      await Promise.all([processWebhookPush(payload, io), processWebhookPush(payload, io)]);
      assert.equal(getDb().data.stats.scannedCommits, 1);
    });
    await t.test('Uses saved Discord and Slack settings with required alert fields', async () => {
      getDb().data.config.discordWebhook = 'https://discord.com/api/webhooks/local/mock';
      getDb().data.config.slackWebhook = 'https://hooks.slack.com/services/local/mock';
      const requests = [];
      axios.post = async (...args) => { requests.push(args); return { status: 200 }; };
      const threat = { repo: 'local/repository', commit: 'local-sha', filePath: 'config.js', keyType: 'Generic Token', entropy: 4.8, severity: 'Critical' };
      assert.equal((await dispatchAlerts(threat)).status, 'sent');
      assert.equal(requests.length, 2);
      for (const [, payload, options] of requests) {
        for (const value of [threat.repo, threat.commit, threat.filePath, threat.keyType]) assert.ok(JSON.stringify(payload).includes(value));
        assert.equal(options.timeout, 10000);
      }
    });
  } finally {
    axios.post = postBefore;
    if (secretBefore === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = secretBefore;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    process.chdir(originalDirectory);
    assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temporary, { recursive: true, force: true });
  }
});
