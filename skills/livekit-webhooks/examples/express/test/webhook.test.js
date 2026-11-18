import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';
import { SignJWT, UnsecuredJWT } from 'jose';

const API_KEY = 'APItestkey123';
// LiveKit API secrets are long random strings; keep the test one >= 32 bytes
const API_SECRET = 'test_livekit_api_secret_0123456789abcdefghij';
process.env.LIVEKIT_API_KEY = API_KEY;
process.env.LIVEKIT_API_SECRET = API_SECRET;

const { app } = await import('../src/index.js');

const CONTENT_TYPE = 'application/webhook+json';
const now = () => Math.floor(Date.now() / 1000);
const sha256b64 = (body) => crypto.createHash('sha256').update(body).digest('base64');

/**
 * Mint a token the way LiveKit's sender does: HS256 with the API secret, iss = API key,
 * nbf = now, exp = now + 5 minutes, and sha256 = base64(SHA-256(raw body)).
 */
async function sign(body, {
  key = API_KEY,
  secret = API_SECRET,
  alg = 'HS256',
  sha256 = sha256b64(body),
  iat = now(),
  ttl = 300,
  omitExp = false,
} = {}) {
  const claims = { video: {} };
  if (sha256 !== null) claims.sha256 = sha256;
  let jwt = new SignJWT(claims).setProtectedHeader({ alg, typ: 'JWT' }).setIssuer(key).setNotBefore(iat);
  if (!omitExp) jwt = jwt.setExpirationTime(iat + ttl);
  return jwt.sign(new TextEncoder().encode(secret));
}

// protojson-style body: lowerCamelCase, int64 as strings, enums as names, defaults omitted
function payload(event, extra = {}) {
  return JSON.stringify({
    event,
    id: 'EV_3xV9FhQm7kTa',
    createdAt: String(now()),
    ...extra,
  });
}

const room = { sid: 'RM_hycBMAjmt6Ub', name: 'demo-room', emptyTimeout: 300, creationTime: '1700000000' };
const participant = { sid: 'PA_39FqBjKZ2xyC', identity: 'alice', name: 'Alice', state: 'ACTIVE', joinedAt: '1700000005' };
const EVENTS = [
  ['room_started', { room }],
  ['room_finished', { room }],
  ['participant_joined', { room, participant }],
  ['participant_left', { room, participant: { ...participant, state: 'DISCONNECTED' } }],
  ['participant_connection_aborted', { room, participant }],
  ['track_published', { room: { sid: room.sid, name: room.name }, participant: { sid: participant.sid, identity: 'alice' }, track: { sid: 'TR_AMkSJbBTnhXv', type: 'VIDEO', source: 'CAMERA', width: 1280, height: 720 } }],
  ['track_unpublished', { room: { sid: room.sid, name: room.name }, participant: { sid: participant.sid, identity: 'alice' }, track: { sid: 'TR_VC7ZnFsVsxZ9', source: 'MICROPHONE' } }],
  ['egress_started', { egressInfo: { egressId: 'EG_hesu4g2G7Jm6', roomName: 'demo-room', status: 'EGRESS_ACTIVE' } }],
  ['egress_updated', { egressInfo: { egressId: 'EG_hesu4g2G7Jm6', roomName: 'demo-room', status: 'EGRESS_ACTIVE' } }],
  ['egress_ended', { egressInfo: { egressId: 'EG_hesu4g2G7Jm6', roomName: 'demo-room', status: 'EGRESS_COMPLETE', endedAt: '1700000999' } }],
  ['ingress_started', { ingressInfo: { ingressId: 'IN_Kx2vY3cXoGz7', roomName: 'demo-room', streamKey: 'secret', state: { status: 'ENDPOINT_PUBLISHING' } } }],
  ['ingress_ended', { ingressInfo: { ingressId: 'IN_Kx2vY3cXoGz7', roomName: 'demo-room' } }],
  ['agent_job_pending', { job: { id: 'AJ_5mGHkLz7rT2d' } }],
  ['agent_job_started', { job: { id: 'AJ_5mGHkLz7rT2d' } }],
  ['agent_job_ended', { job: { id: 'AJ_5mGHkLz7rT2d' } }],
];

const post = (body, headers = {}, contentType = CONTENT_TYPE) =>
  request(app).post('/webhooks/livekit').set('Content-Type', contentType).set(headers).send(body);

let logSpy;
let errorSpy;
let warnSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  process.env.LIVEKIT_API_KEY = API_KEY;
  process.env.LIVEKIT_API_SECRET = API_SECRET;
});

describe('LiveKit webhook handler', () => {
  it.each(EVENTS)('accepts a correctly signed %s event', async (event, extra) => {
    const body = payload(event, extra);
    const res = await post(body, { Authorization: await sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('acknowledges an unknown event name with 200', async () => {
    const body = payload('some_future_event');
    const res = await post(body, { Authorization: await sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts a numeric createdAt as well as the protojson string form', async () => {
    const body = JSON.stringify({ event: 'room_started', id: 'EV_1', createdAt: now(), room });
    const res = await post(body, { Authorization: await sign(body) });
    expect(res.status).toBe(200);
  });

  it('warns when numDropped shows lost events', async () => {
    const body = payload('room_started', { room, numDropped: 3 });
    const res = await post(body, { Authorization: await sign(body) });
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dropped 3'));
  });

  it('tolerates a Bearer prefix added by a proxy', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: `Bearer ${await sign(body)}` });
    expect(res.status).toBe(200);
  });

  it('accepts a token that expired within the 10 s clock tolerance', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { iat: now() - 305 }) });
    expect(res.status).toBe(200);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await post(payload('room_started', { room }));
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { secret: 'another_secret_0123456789abcdefghijklmn' }) });
    expect(res.status).toBe(401);
  });

  it('rejects a token whose iss is a different API key', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { key: 'APIotherkey' }) });
    expect(res.status).toBe(401);
  });

  it('rejects an expired token (tokens live 5 minutes)', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { iat: now() - 600 }) });
    expect(res.status).toBe(401);
  });

  it('rejects a signed token with no exp claim', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { omitExp: true }) });
    expect(res.status).toBe(401);
  });

  it('rejects a valid token with no sha256 claim (JWT-only check is not enough)', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { sha256: null }) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const signed = payload('room_started', { room });
    const res = await post(payload('room_finished', { room }), { Authorization: await sign(signed) });
    expect(res.status).toBe(401);
  });

  it('rejects a body that was re-serialised after signing', async () => {
    const original = '{"event": "room_started", "id": "EV_1", "createdAt": "1700000000"}';
    const reserialised = JSON.stringify(JSON.parse(original));
    const res = await post(reserialised, { Authorization: await sign(original) });
    expect(res.status).toBe(401);
  });

  it('rejects a hex digest in the sha256 claim (must be base64)', async () => {
    const body = payload('room_started', { room });
    const hex = crypto.createHash('sha256').update(body).digest('hex');
    const res = await post(body, { Authorization: await sign(body, { sha256: hex }) });
    expect(res.status).toBe(401);
  });

  it('rejects an HS512 token (algorithm pinned to HS256)', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body, { alg: 'HS512' }) });
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned alg=none token', async () => {
    const body = payload('room_started', { room });
    const token = new UnsecuredJWT({ sha256: sha256b64(body) })
      .setIssuer(API_KEY)
      .setExpirationTime(now() + 300)
      .encode();
    const res = await post(body, { Authorization: token });
    expect(res.status).toBe(401);
  });

  it('rejects garbage in the Authorization header', async () => {
    const res = await post(payload('room_started', { room }), { Authorization: 'not-a-jwt' });
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when credentials are not configured', async () => {
    const body = payload('room_started', { room });
    const token = await sign(body);
    delete process.env.LIVEKIT_API_SECRET;
    const res = await post(body, { Authorization: token });
    expect(res.status).toBe(401);
  });

  it('401s when the body arrives as application/json (raw parser bound to application/webhook+json)', async () => {
    const body = payload('room_started', { room });
    const res = await post(body, { Authorization: await sign(body) }, 'application/json');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a correctly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { Authorization: await sign(body) });
    expect(res.status).toBe(400);
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
