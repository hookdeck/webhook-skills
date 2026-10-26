// Generated with: 100ms-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two header values. Hashing both sides gives
 * equal-length buffers, so timingSafeEqual never throws and the secret's length
 * isn't leaked. Header values arrive latin1-decoded; the configured secret is
 * what the user typed (utf8).
 */
function safeEqual(received, expected) {
  const a = crypto.createHash('sha256').update(Buffer.from(String(received), 'latin1')).digest();
  const b = crypto.createHash('sha256').update(Buffer.from(String(expected), 'utf8')).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * 100ms does not sign webhooks. You add a secret header in the 100ms dashboard and
 * 100ms sends it on every request. We compare the WHOLE header value (no 'Bearer '
 * parsing or stripping). Node lowercases incoming header names.
 */
function verify100msRequest(
  headers,
  secret = process.env.HUNDRED_MS_WEBHOOK_SECRET,
  headerName = process.env.HUNDRED_MS_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
const seenEventIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    case 'session.open.success':
      console.log(`Session opened: ${data.session_id} (room ${data.room_name})`);
      // TODO: mark the session as live
      break;

    case 'session.close.success':
      console.log(`Session closed: ${data.session_id} after ${data.session_duration}s`);
      // TODO: record session duration for analytics
      break;

    case 'peer.join.success':
      console.log(`Peer joined: ${data.user_name} (${data.peer_id}) as ${data.role}`);
      // TODO: record attendance
      break;

    case 'peer.leave.success':
      console.log(`Peer left: ${data.user_name} (${data.peer_id})`);
      // TODO: close the attendance record
      break;

    case 'peer.join.failure':
    case 'peer.leave.failure':
    case 'room.end.failure':
    case 'role.change.failure':
      console.log(`Event failed: ${type}`);
      // TODO: alert or investigate (data.error)
      break;

    case 'room.end.success':
      console.log(`Room ended: ${data.room_id}`);
      // TODO: finalize the room
      break;

    case 'role.change.success':
      console.log(`Role changed for peer ${data.peer_id}`);
      // TODO: update permissions in your app
      break;

    case 'recording.success':
    case 'track.recording.success':
    case 'stream.recording.success':
    case 'beam.recording.success':
    case 'hls.recording.success':
      console.log(`Recording ready: ${type}`);
      // TODO: fetch the asset from data.location or data.recording_path
      break;

    case 'recording.failed':
    case 'track.recording.failure':
    case 'stream.recording.failure':
    case 'beam.failure':
    case 'hls.failure':
      console.log(`Recording or streaming failed: ${type}`);
      // TODO: alert (data.error)
      break;

    case 'track.recording.started.success':
    case 'beam.started.success':
    case 'beam.stopped.success':
    case 'hls.started.success':
    case 'hls.stopped.success':
      console.log(`Streaming or recording state changed: ${type}`);
      // TODO: update UI state (data.room_id, data.session_id)
      break;

    case 'transcription.started.success':
    case 'transcription.success':
    case 'transcription.failure':
      console.log(`Transcription event: ${type}`);
      // TODO: fetch or flag the transcript
      break;

    case 'ingest.start.success':
    case 'ingest.end.success':
    case 'ingest.start.failure':
    case 'ingest.failure':
      console.log(`RTMP ingest event: ${type}`);
      break;

    case 'sip.start.success':
    case 'sip.start.failure':
    case 'sip.end.success':
    case 'sip.end.failure':
      console.log(`SIP call event: ${type}`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type); authenticate before parsing it.
app.post('/webhooks/100ms', express.raw({ type: '*/*' }), (req, res) => {
  if (!verify100msRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Expected a JSON object with a type' });
  }

  // 100ms retries three times on any non-200, so dedupe on the event id.
  if (event.id && seenEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling 100ms event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (event.id) seenEventIds.add(event.id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verify100msRequest = verify100msRequest;
module.exports.seenEventIds = seenEventIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/100ms`);
  });
}
