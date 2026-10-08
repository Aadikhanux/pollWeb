import express from 'express';
import crypto from 'crypto';
import { getDb } from '../services/db.js';
import { scanContent } from '../services/detector.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export default function apiRouter(io) {
  const router = express.Router();

  router.get('/threats', asyncRoute(async (req, res) => {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    
    const threats = db.data?.threats || [];
    const sortedThreats = [...threats].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const paginated = sortedThreats.slice(startIndex, endIndex);
    
    res.json({
      data: paginated,
      total: threats.length,
      page,
      limit,
      totalPages: Math.ceil(threats.length / limit)
    });
  }));

  router.get('/stats', asyncRoute(async (req, res) => {
    const db = getDb();
    const stats = db.data?.stats || {
      scannedCommits: 0,
      compromisedRepos: 0,
      redactedSecrets: 0,
      avgLatencyMs: 0
    };
    res.json(stats);
  }));

  router.get('/config', asyncRoute(async (req, res) => {
    const db = getDb();
    if (!db.data.config) {
      db.data.config = {
        entropyThreshold: 3.8,
        criticalEntropyThreshold: 4.5,
        autoRemediate: false,
        watchedRepos: [],
        discordWebhook: '',
        slackWebhook: ''
      };
      await db.write();
    }
    res.json(db.data.config);
  }));

  router.post('/config', asyncRoute(async (req, res) => {
    const db = getDb();
    const allowed = ['entropyThreshold', 'criticalEntropyThreshold', 'watchedRepos', 'discordWebhook', 'slackWebhook', 'autoRemediate'];
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !allowed.includes(key))) return res.status(400).json({ error: 'Unknown configuration field' });
    const config = { ...db.data.config, ...req.body };
    if (![config.entropyThreshold, config.criticalEntropyThreshold].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 8) || config.entropyThreshold > config.criticalEntropyThreshold) return res.status(400).json({ error: 'Entropy thresholds must be between 0 and 8, with critical at least high' });
    if (!Array.isArray(config.watchedRepos) || config.watchedRepos.length > 50 || config.watchedRepos.some(repo => typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))) return res.status(400).json({ error: 'Use owner/repository names, up to 50 repositories' });
    if (typeof config.autoRemediate !== 'boolean') return res.status(400).json({ error: 'autoRemediate must be a boolean' });
    for (const [channel, host] of [['discord', 'discord.com'], ['slack', 'hooks.slack.com']]) {
      const value = config[`${channel}Webhook`];
      if (typeof value !== 'string') return res.status(400).json({ error: 'Webhook must be a URL string' });
      if (value) {
        try { const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || !url.pathname.startsWith(channel === 'discord' ? '/api/webhooks/' : '/services/')) throw new Error(); }
        catch { return res.status(400).json({ error: `Invalid ${channel} webhook URL` }); }
      }
    }
    if (!db.data.config) db.data.config = {};
    db.data.config = { ...db.data.config, ...req.body };
    await db.write();
    
    // Broadcast config update to clients (optional but good for sync)
    io.emit('config-update', db.data.config);
    
    res.json({ success: true, config: db.data.config });
  }));

  router.post('/simulate', asyncRoute(async (req, res) => {
    const db = getDb();
    const start = Date.now();
    const content = `token = "${crypto.randomBytes(32).toString('base64url')}"`;
    const finding = scanContent(content, 'demo/config.js')[0];
    if (!finding) return res.status(500).json({ error: 'Demo detection failed' });
    const threat = {
      ...finding,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      repo: 'demo/local-detector',
      commit: crypto.randomBytes(20).toString('hex'),
      author: 'Local demo',
      source: 'simulation',
      status: 'Detected',
      alertStatus: 'demo-only',
      latencyMs: Date.now() - start
    };
    db.data.threats.push(threat);
    await db.write();
    io.emit('new-threat', threat);
    res.json(threat);
  }));

  return router;
}


