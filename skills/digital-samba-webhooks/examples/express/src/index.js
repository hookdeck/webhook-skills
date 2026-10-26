// Generated with: digital-samba-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Digital Samba does not sign payloads. When authorization_header is set on the
 * webhook, every POST carries "Authorization: Bearer <secret>". The secret is a
 * static shared credential: it authenticates the sender, not the body, and gives
 * no replay protection.
 */
function verifyDigitalSambaRequest(headers, secret = process.env.DIGITAL_SAMBA_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  // Tolerate a configured value that already includes "Bearer " (the secret itself is not trimmed).
  const expected = /^bearer /i.test(secret) ? secret.slice(7) : secret;
  if (!expected) return false;

  const header = headers['authorization'];
  if (typeof header !== 'string' || !/^bearer /i.test(header)) return false; // scheme is case-insensitive

  // Node decodes header bytes as latin1; re-encode to recover the original bytes.
  const received = Buffer.from(header.slice(7), 'latin1');
  const wanted = Buffer.from(expected, 'utf8');
  if (received.length !== wanted.length) return false; // timingSafeEqual throws on unequal lengths
  return crypto.timingSafeEqual(received, wanted);
}

function handleEvent(payload) {
  const { eventType, sessionId, roomId } = payload;

  switch (eventType) {
    case 'participant_joined':
      console.log(`Participant joined room ${roomId}: ${payload.data?.name}`);
      // TODO: update attendance (payload.data.participantId, payload.data.role)
      break;

    case 'participant_left':
      console.log(`Participant left room ${roomId}`);
      // TODO: record the departure
      break;

    case 'session_started':
      console.log(`Session started: ${sessionId}`);
      // TODO: mark the room as live
      break;

    case 'session_ended':
      console.log(`Session ended: ${sessionId}`);
      // TODO: finalize attendance and billing
      break;

    case 'recording_started':
      console.log(`Recording started in session ${sessionId}`);
      // TODO: show a recording indicator
      break;

    case 'recording_stopped':
      console.log(`Recording stopped in session ${sessionId}`);
      // TODO: mark the recording as processing
      break;

    case 'recording_ready':
      console.log(`Recording ready for session ${sessionId}`);
      // TODO: fetch the recording through the REST API
      break;

    case 'recording_deleted':
      console.log(`Recording deleted in session ${sessionId}`);
      // TODO: remove the stored reference
      break;

    case 'session_summary_ready':
      console.log(`Session summary ready for session ${sessionId}`);
      // TODO: fetch the summary through the REST API
      break;

    case 'session_transcript_ready':
      console.log(`Session transcript ready for session ${sessionId}`);
      // TODO: fetch the transcript through the REST API
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/digital-samba', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDigitalSambaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization bearer secret' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
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
    console.error('Error handling Digital Samba event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDigitalSambaRequest = verifyDigitalSambaRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/digital-samba`);
  });
}
