// Generated with: livekit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { jwtVerify } from 'jose';

export const app = express();
const PORT = process.env.PORT || 3000;

// LiveKit's token check allows 10 seconds of clock skew (livekit-server-sdk default)
const CLOCK_TOLERANCE_SECONDS = 10;

/**
 * Verify a LiveKit webhook. Throws on failure, returns the JWT claims on success.
 *
 * LiveKit sends `Authorization: <JWT>` (bare token, no `Bearer ` prefix). The JWT is
 * HS256-signed with the project API secret, `iss` is the API key, and the `sha256` claim
 * is base64(SHA-256(raw body)). The JWT signature only covers the claims, so BOTH steps
 * are required: verify the token, then compare the body hash.
 */
export async function verifyLiveKitWebhook(rawBody, authHeader, apiKey, apiSecret) {
  if (!authHeader) throw new Error('authorization header is empty');
  // Tolerate a `Bearer ` prefix added by a proxy; LiveKit itself sends the bare JWT
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const { payload } = await jwtVerify(token, new TextEncoder().encode(apiSecret), {
    algorithms: ['HS256'], // pin the algorithm: never accept `none` or RS256
    issuer: apiKey,
    requiredClaims: ['exp'], // a signed token without exp must not verify forever
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  });

  if (typeof payload.sha256 !== 'string' || !payload.sha256) {
    throw new Error('sha256 was not found in the token');
  }
  // Standard base64 WITH padding (not base64url, not hex)
  const expected = Buffer.from(crypto.createHash('sha256').update(rawBody).digest('base64'));
  const received = Buffer.from(payload.sha256);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error('sha256 checksum of body does not match');
  }
  return payload;
}

// protojson serialises int64 as a JSON string ("1700000000"); tolerate numbers too
const toSeconds = (value) => (value === undefined || value === null ? undefined : Number(value));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// LiveKit posts Content-Type: application/webhook+json. express.json() and the default
// express.raw() only match application/json and would leave the body empty, so every
// delivery would fail the hash check. Bind the raw parser to LiveKit's custom type.
app.post('/webhooks/livekit', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  // Fail closed: never skip verification because credentials are missing
  if (!apiKey || !apiSecret) {
    console.error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured; rejecting webhook');
    return res.status(401).json({ error: 'Webhook verification not configured' });
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error(`No raw body (Content-Type: ${req.get('content-type')}); expected application/webhook+json`);
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  try {
    await verifyLiveKitWebhook(rawBody, req.get('authorization'), apiKey, apiSecret);
  } catch (err) {
    console.error('LiveKit webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // `id` is the unique event uuid: a retry carries the same id, so dedupe on it.
  // protojson omits zero/default fields, so read every field defensively. That includes
  // enum zero values: an absent track.type means AUDIO, track.source UNKNOWN,
  // participant.state JOINING, egressInfo.status EGRESS_STARTING.
  // Don't log the whole payload: room.turnPassword and ingressInfo.streamKey are credentials.
  const { event: name, id, room, participant, track, egressInfo, ingressInfo } = event;
  console.log(`Received LiveKit webhook: ${name} (${id}) createdAt=${toSeconds(event.createdAt)}`);

  // Non-zero numDropped = LiveKit's send queue overflowed and events were LOST.
  // Reconcile state via the RoomService API (ListRooms / ListParticipants).
  if (Number(event.numDropped ?? 0) > 0) {
    console.warn(`LiveKit dropped ${event.numDropped} webhook event(s) before this one; reconcile state`);
  }

  switch (name) {
    case 'room_started':
      console.log(`Room started: ${room?.name} (${room?.sid})`);
      break;
    case 'room_finished':
      console.log(`Room finished: ${room?.name} (${room?.sid})`);
      break;
    case 'participant_joined':
      console.log(`Participant joined ${room?.name}: ${participant?.identity} (${participant?.state ?? 'JOINING'})`);
      break;
    case 'participant_left':
      console.log(`Participant left ${room?.name}: ${participant?.identity}`);
      break;
    case 'participant_connection_aborted':
      console.log(`Participant connection aborted in ${room?.name}: ${participant?.identity}`);
      break;
    case 'track_published':
    case 'track_unpublished':
      // room and participant are truncated on track events (SID, name, identity only)
      console.log(`${name}: ${track?.type ?? 'AUDIO'}/${track?.source ?? 'UNKNOWN'} track ${track?.sid} by ${participant?.identity}`);
      break;
    case 'egress_started':
    case 'egress_updated':
    case 'egress_ended':
      console.log(`${name}: egress ${egressInfo?.egressId} for ${egressInfo?.roomName} is ${egressInfo?.status ?? 'EGRESS_STARTING'}`);
      break;
    case 'ingress_started':
    case 'ingress_ended':
      // Never log ingressInfo.streamKey
      console.log(`${name}: ingress ${ingressInfo?.ingressId} into ${ingressInfo?.roomName}`);
      break;
    case 'agent_job_pending':
    case 'agent_job_started':
    case 'agent_job_ended':
      // In LiveKit's protocol definition but not its webhooks docs table; payload carries `job`
      console.log(`${name}: agent job ${event.job?.id}`);
      break;
    default:
      // Acknowledge unknown events: a 4xx would only burn LiveKit's retries
      console.log('Unhandled LiveKit event:', name);
  }

  res.status(200).json({ received: true });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`LiveKit webhook server listening on port ${PORT}`);
  });
}
