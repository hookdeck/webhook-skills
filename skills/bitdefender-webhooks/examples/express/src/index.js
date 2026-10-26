// Generated with: bitdefender-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * GravityZone does not sign payloads. The credential is the Authorization header, sent
 * verbatim from serviceSettings.authorization (e.g. "Bearer sfasdfw34243"). Compare the
 * WHOLE header value, including any "Bearer " / "Basic " prefix. Do not strip or decode it.
 */
function verifyBitdefenderRequest(headers, config = process.env) {
  const expected = config.BITDEFENDER_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(event) {
  // Each event carries a `module` identifier (the event type).
  switch (event.module) {
    case 'av':
      console.log(`Antimalware: ${event.malware_name} on ${event.computer_name} (${event.final_status})`);
      // TODO: raise an alert or open a ticket for the detection
      break;

    case 'aph':
      console.log(`Antiphishing: ${event.url} ${event.status} on ${event.computer_name}`);
      break;

    case 'avc':
      console.log(`Advanced Threat Control: ${event.exploit_path} ${event.status} on ${event.computer_name}`);
      break;

    case 'fw':
    case 'hd':
    case 'dp':
    case 'network-sandboxing':
      console.log(`Detection event ${event.module} on ${event.computer_name}`);
      break;

    default:
      console.log(`Unhandled Bitdefender event module: ${event.module}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type GravityZone uses.
app.post('/webhooks/bitdefender', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyBitdefenderRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let message;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    message = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // JSON-RPC 2.0: {jsonrpc, method: "addEvents", params: {events: [...]}, id}
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return res.status(400).json({ error: 'Expected a JSON-RPC object' });
  }
  const events = message.params && message.params.events;
  if (message.method !== 'addEvents' || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Expected an addEvents call with params.events' });
  }

  try {
    for (const event of events) {
      if (event && typeof event === 'object') handleEvent(event);
    }
  } catch (err) {
    console.error('Error handling Bitdefender webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Any 2xx tells GravityZone the batch was received.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBitdefenderRequest = verifyBitdefenderRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bitdefender`);
  });
}
