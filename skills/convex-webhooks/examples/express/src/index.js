// Generated with: convex-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Convex log stream: x-webhook-signature = "sha256=" + hex(HMAC-SHA256(secret, rawBody)).
// Only the raw body is signed (no timestamp), and the bare digest is accepted too.
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const received = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  // Check the hex shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received.toLowerCase()), Buffer.from(expected));
}

// The body is a JSON array of log events (or one JSON object per line for JSONL streams)
function parseEvents(rawBody) {
  const text = rawBody.toString('utf8');
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
}

// express.raw with '*/*' keeps the body as a Buffer for any content type
app.post('/webhooks/convex', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-webhook-signature');

  if (!signature) {
    return res.status(401).send('Missing x-webhook-signature header');
  }
  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, signature, process.env.CONVEX_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  let events;
  try {
    events = parseEvents(req.body);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // There is no event header: each event in the batch carries its own `topic`
  for (const event of events) {
    switch (event?.topic) {
      case 'verification':
        console.log('Log stream verified:', event.message);
        break;
      case 'console':
        console.log(`[${event.log_level}] ${event.function?.path}: ${event.message}`);
        break;
      case 'function_execution':
        console.log(
          `${event.function?.type} ${event.function?.path} ${event.status} in ${event.execution_time_ms}ms`
        );
        break;
      case 'audit_log':
        console.log('Audit log:', event.audit_log_action);
        break;
      case 'scheduler_stats':
        console.log(`Scheduler lag ${event.lag_seconds}s, ${event.num_running_jobs} running jobs`);
        break;
      case 'current_storage_usage':
        console.log('Storage usage: documents', event.total_document_size_bytes, 'bytes');
        break;
      default:
        console.log('Unhandled topic:', event?.topic);
    }
  }

  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = app;
