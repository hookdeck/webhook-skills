require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify an AgentLine webhook signature.
 *
 * X-Webhook-Signature is the bare hex HMAC-SHA256 of the raw request body, keyed
 * with the webhook signing secret (UTF-8). No timestamp is signed.
 */
function verifyAgentLineSignature(rawBody, signature, secret) {
  // Validate shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(signature || '')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

// Raw body for any content type so we verify the exact bytes AgentLine sent
app.use('/webhooks/agentline', express.raw({ type: '*/*' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/agentline', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.AGENTLINE_WEBHOOK_SECRET;

  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Webhook-Signature header' });
  }
  if (!secret) {
    return res.status(500).json({ error: 'AGENTLINE_WEBHOOK_SECRET not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  if (!verifyAgentLineSignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The delivery envelope isn't spelled out in the docs; the events API uses `event_type`
  const eventType = event.event_type || event.type || event.event;
  console.log(`Received AgentLine webhook: ${eventType} (${event.event_id || 'no id'})`);

  switch (eventType) {
    case 'call.received':
      console.log('Inbound call answered');
      break;
    case 'call.utterance':
      // conversation roles here are `user` and `assistant`
      console.log('Live caller turn');
      break;
    case 'call.completed':
      console.log('Call completed');
      break;
    case 'call.owner_task':
      console.log('Owner task requested');
      break;
    case 'call.failed':
    case 'call.busy':
    case 'call.no-answer':
    case 'call.canceled':
      console.log(`Call did not connect: ${eventType}`);
      break;
    case 'sms.received':
      console.log('Inbound SMS');
      break;
    case 'webhook.test':
      console.log('Test webhook received');
      break;
    default:
      console.log('Unhandled event type:', eventType);
  }

  res.sendStatus(200);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`AgentLine webhook server listening on port ${PORT}`);
  });
}

module.exports = app;
