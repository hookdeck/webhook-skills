// Generated with: reducto-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Reducto webhook endpoint (Reducto delivers via Svix)
// IMPORTANT: use express.raw() so we verify the exact raw body bytes.
app.post('/webhooks/reducto',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.REDUCTO_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      const wh = new Webhook(secret);
      // Pass the RAW body (Buffer) — never re-serialized JSON. As of svix 2.x
      // verify() returns undefined, so the payload is parsed separately below.
      wh.verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const detail = /timestamp/i.test((err && err.message) || '')
        ? 'Timestamp too old'
        : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified — only now is it safe to parse.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Reducto sends one Svix event type (async.update); the body carries the
    // job status, job_id, and the metadata you passed when submitting the job.
    const { status, job_id: jobId, metadata } = payload;
    console.log(`Received Reducto webhook: job ${jobId} ${status} (svix-id ${svixId})`);

    switch (status) {
      case 'Completed':
        // Results are not in the webhook — fetch them with the Reducto API,
        // e.g. await client.job.retrieve(jobId). Respond within 15s; queue heavy work.
        console.log('Job completed:', { jobId, metadata });
        break;
      case 'Failed':
        console.log('Job failed:', { jobId, metadata });
        break;
      default:
        console.log('Unhandled job status:', status);
    }

    res.status(200).json({ received: true, status, job_id: jobId });
  }
);

const server = app.listen(PORT, () => {
  console.log(`Reducto webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/reducto`);
});

export { app, server };
