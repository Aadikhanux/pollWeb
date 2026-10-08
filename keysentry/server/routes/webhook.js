import express from 'express';
import crypto from 'crypto';
import { processWebhookPush } from '../services/githubService.js';

export default function webhookRouter(io) {
  const router = express.Router();

  router.post('/github', async (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      return res.status(400).send('Missing signature');
    }

    const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
    if (!secret) return res.status(503).json({ error: 'GitHub webhook secret is not configured' });
    
    // We use req.rawBody populated by express.json middleware config in server.js
    const payloadBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body));
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadBuffer);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    try {
      const isVerified = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isVerified) {
        return res.status(401).send('Signature mismatch');
      }
    } catch (error) {
      return res.status(401).send('Signature validation failed');
    }

    if (req.headers['x-github-event'] === 'ping') return res.json({ success: true });
    if (req.headers['x-github-event'] !== 'push') return res.status(202).json({ ignored: true });
    if (!req.body.repository?.full_name || !Array.isArray(req.body.commits)) return res.status(400).json({ error: 'Invalid push payload' });
    try {
      const result = await processWebhookPush(req.body, io);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });

  return router;
}
