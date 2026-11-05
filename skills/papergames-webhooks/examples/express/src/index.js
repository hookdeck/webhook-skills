// Generated with: papergames-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Svix reference libraries default to 5 minutes; Papergames publishes no tolerance. 0 disables the check.
const DEFAULT_TOLERANCE_SECONDS = 300;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// `whsec_<base64>`: base64-decode the part after the prefix. A value without the prefix is
// base64-decoded whole (Standard Webhooks rule). Returns null for a secret that decodes to nothing.
function decodeSecret(secret) {
  const encoded = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(encoded, 'base64');
  return key.length > 0 ? key : null;
}

function readTolerance() {
  const raw = process.env.PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_TOLERANCE_SECONDS;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_TOLERANCE_SECONDS;
}

// Papergames is delivered by Svix: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${raw body}`,
// base64-encoded, compared against every `v1,<base64>` entry in the space-delimited svix-signature header.
function verifySignature(rawBody, msgId, timestamp, signatureHeader, key) {
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.`).update(rawBody).digest('base64')
  );
  return signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',', 2);
    if (version !== 'v1' || !signature) return false; // ignore unknown version tags
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

// Winner is not a field: derive it by comparing scores (ties produce several leaders)
function leaders(players) {
  if (players.length === 0) return [];
  const top = Math.max(...players.map((p) => Number(p.score) || 0));
  return players.filter((p) => (Number(p.score) || 0) === top);
}

// externalId only appears when you passed externalUserId on the iframe URL; fall back to the display name
function playerLabel(player) {
  return player.externalId ? `${player.name} (${player.externalId})` : String(player.name);
}

// IMPORTANT: express.raw() keeps the exact bytes Svix signed; never verify re-serialized JSON
app.post('/webhooks/papergames', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PAPERGAMES_WEBHOOK_SECRET;
  const key = secret ? decodeSecret(secret) : null;
  if (!key) {
    console.error('PAPERGAMES_WEBHOOK_SECRET is missing or not a valid whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const msgId = req.get('svix-id');
  const timestamp = req.get('svix-timestamp');
  const signatureHeader = req.get('svix-signature');
  if (!msgId || !timestamp || !signatureHeader) {
    return res.status(400).json({ error: 'Missing svix-id, svix-timestamp or svix-signature header' });
  }

  if (!/^\d+$/.test(timestamp) || Number(timestamp) <= 0) {
    return res.status(400).json({ error: 'Invalid svix-timestamp header' });
  }
  const tolerance = readTolerance();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) {
    return res.status(400).json({ error: 'Timestamp outside tolerance' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(rawBody, msgId, timestamp, signatureHeader, key)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Parse only after verification: the event type is in the body, not in a header
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (typeof body !== 'object' || body === null) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Documented examples put { eventType, payload } at the root; the docs' prose calls the root
  // `webhookPayload`, so tolerate the envelope arriving one level deeper.
  const envelope = body.webhookPayload && typeof body.webhookPayload === 'object' ? body.webhookPayload : body;
  const { eventType } = envelope;
  const session = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
  const players = (Array.isArray(session.players) ? session.players : []).filter(
    (p) => p && typeof p === 'object'
  );

  // svix-id is the same on every retry of a message: deduplicate on it. Ordering is not guaranteed,
  // so key game state on session.uid + session.gamesPlayed rather than on arrival order.
  console.log(`Received Papergames webhook ${msgId}: ${eventType} (session ${session.uid})`);

  switch (eventType) {
    case 'game.started':
      // Fires for each game in the session, so it can arrive several times per uid
      console.log(`Game started in session ${session.uid}, games played so far: ${session.gamesPlayed}`);
      console.log('Players:', players.map(playerLabel).join(', '));
      break;
    case 'game.finished': {
      // `status` stays "playing" here because a session can hold several games: rely on the event type
      const top = leaders(players);
      console.log(`Game finished in session ${session.uid}, games played: ${session.gamesPlayed}`);
      console.log('Leading:', top.map(playerLabel).join(', '), 'with score', top[0] ? top[0].score : 0);
      break;
    }
    default:
      // Endpoints subscribe to chosen events and the list may grow: acknowledge anything else
      console.log('Unhandled Papergames event type:', eventType);
  }

  // Return 2xx quickly; move slow work to a queue
  res.status(200).json({ received: true });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Papergames webhook server running on http://localhost:${PORT}/webhooks/papergames`);
  });
}

module.exports = app;
module.exports.decodeSecret = decodeSecret;
module.exports.verifySignature = verifySignature;
