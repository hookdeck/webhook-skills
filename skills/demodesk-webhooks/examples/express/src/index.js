// Generated with: demodesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Demodesk does not sign payloads. You add a custom header to the webhook endpoint
 * (the name is your choice) and compare its WHOLE value with the one you stored,
 * including any "Bearer " prefix you typed. Express lowercases header names.
 */
function verifyDemodeskRequest(
  headers,
  headerName = process.env.DEMODESK_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.DEMODESK_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(payload) {
  const action = payload && payload.meta && payload.meta.event && payload.meta.event.action;

  switch (action) {
    case 'demo.scheduled':
      console.log('Demo scheduled');
      // TODO: create the meeting in your CRM
      break;

    case 'demo.rescheduled':
      console.log('Demo rescheduled');
      // TODO: update the meeting time
      break;

    case 'demo.event_response_updated':
      console.log('Demo invitation response updated');
      // TODO: record the attendee's response
      break;

    case 'demo.handovered':
      console.log('Demo handed over');
      // TODO: reassign the meeting owner
      break;

    case 'demo.canceled':
      console.log('Demo canceled');
      // TODO: cancel the meeting downstream
      break;

    case 'demo.started':
      console.log('Demo started');
      // TODO: mark the meeting as in progress
      break;

    case 'demo.call_note_updated':
      console.log('Demo call note updated');
      // TODO: sync the call note
      break;

    case 'demo.ended':
      console.log('Demo ended');
      // TODO: log the outcome (it can fire again if a meeting is restarted)
      break;

    case 'recording.uploaded':
      console.log('Recording uploaded');
      // TODO: fetch the recording through the Demodesk API
      break;

    case 'recording.transcription_postprocessed':
      console.log('Recording transcription post-processed');
      // TODO: fetch the transcript through the Demodesk API
      break;

    default:
      console.log(`Unhandled event: ${action}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/demodesk', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDemodeskRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    console.error('Error handling Demodesk event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDemodeskRequest = verifyDemodeskRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/demodesk`);
  });
}
