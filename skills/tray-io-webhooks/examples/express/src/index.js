// Generated with: tray-io-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Tray.io requests are unsigned. The workflow's HTTP Client step adds a secret header
 * (name chosen by the user, value from a Generic Service Authentication). We compare the
 * WHOLE header value, including any "Bearer " prefix, and never strip or parse it.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyTrayRequest(headers, {
  headerName = process.env.TRAY_IO_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.TRAY_IO_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lower-cases header names
  if (typeof received !== 'string' || !received) return false;
  return safeEqual(Buffer.from(received, 'latin1'), Buffer.from(secret, 'utf8'));
}

// The "event" field is a convention: Tray defines no event types.
function handleEvent(payload) {
  const { event, data } = payload;

  switch (event) {
    case 'record.created':
      console.log('Record created:', data);
      // TODO: create the record in your system
      break;

    case 'record.updated':
      console.log('Record updated:', data);
      // TODO: update the record in your system
      break;

    case 'record.deleted':
      console.log('Record deleted:', data);
      // TODO: remove the record from your system
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

function trayHandler(req, res) {
  // Authenticate before parsing the body.
  if (!verifyTrayRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credential header' });
  }

  // GET (or any request without a body) leaves req.body undefined.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Tray.io request:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

// The method is chosen in the workflow, so accept all of them. The body is read raw for any content type.
for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  app[method]('/webhooks/tray-io', express.raw({ type: '*/*' }), trayHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTrayRequest = verifyTrayRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/tray-io (POST, PUT, PATCH, DELETE, GET)`);
  });
}
