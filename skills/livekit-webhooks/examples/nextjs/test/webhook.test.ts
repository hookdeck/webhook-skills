import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { SignJWT, UnsecuredJWT } from 'jose';

const API_KEY = 'APItestkey123';
// LiveKit API secrets are long random strings; keep the test one >= 32 bytes
const API_SECRET = 'test_livekit_api_secret_0123456789abcdefghij';

const now = () => Math.floor(Date.now() / 1000);
const sha256b64 = (body: string) => crypto.createHash('sha256').update(body).digest('base64');

interface SignOptions {
  key?: string;
  secret?: string;
  alg?: string;
  sha256?: string | null;
  iat?: number;
  ttl?: number;
  omitExp?: boolean;
}

/**
 * Mint a token the way LiveKit's sender does: HS256 with the API secret, iss = API key,
 * nbf = now, exp = now + 5 minutes, and sha256 = base64(SHA-256(raw body)).
 */
async function sign(body: string, opts: SignOptions = {}): Promise<string> {
  const { key = API_KEY, secret = API_SECRET, alg = 'HS256', iat = now(), ttl = 300, omitExp = false } = opts;
  const sha256 = opts.sha256 === undefined ? sha256b64(body) : opts.sha256;
  const claims: Record<string, unknown> = { video: {} };
  if (sha256 !== null) claims.sha256 = sha256;
  let jwt = new SignJWT(claims).setProtectedHeader({ alg, typ: 'JWT' }).setIssuer(key).setNotBefore(iat);
  if (!omitExp) jwt = jwt.setExpirationTime(iat + ttl);
  return jwt.sign(new TextEncoder().encode(secret));
}

// protojson-style body: lowerCamelCase, int64 as strings, enums as names, defaults omitted
function payload(event: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ event, id: 'EV_3xV9FhQm7kTa', createdAt: String(now()), ...extra });
}

const room = { sid: 'RM_hycBMAjmt6Ub', name: 'demo-room', emptyTimeout: 300, creationTime: '1700000000' };
const participant = { sid: 'PA_39FqBjKZ2xyC', identity: 'alice', name: 'Alice', state: 'ACTIVE', joinedAt: '1700000005' };
const EVENTS: [string, Record<string, unknown>][] = [
  ['room_started', { room }],
  ['room_finished', { room }],
  ['participant_joined', { room, participant }],
  ['participant_left', { room, participant: { ...participant, state: 'DISCONNECTED' } }],
  ['participant_connection_aborted', { room, participant }],
  ['track_published', { room: { sid: room.sid, name: room.name }, participant: { sid: participant.sid, identity: 'alice' }, track: { sid: 'TR_AMkSJbBTnhXv', type: 'VIDEO', source: 'CAMERA' } }],
  ['track_unpublished', { room: { sid: room.sid, name: room.name }, participant: { sid: participant.sid, identity: 'alice' }, track: { sid: 'TR_VC7ZnFsVsxZ9', source: 'MICROPHONE' } }],
  ['egress_started', { egressInfo: { egressId: 'EG_hesu4g2G7Jm6', roomName: 'demo-room', status: 'EGRESS_ACTIVE' } }],
  ['egress_updated', { egressInfo: { egressId: 'EG_hesu4g2G7Jm6', roomName: 'demo-room', status: 'EGRESS_ACTIVE' } }],
  ['egress_ended', { egressInfo: { egressId: 'EG_hesu4g2G7Jm6', roomName: 'demo-room', status: 'EGRESS_COMPLETE' } }],
  ['ingress_started', { ingressInfo: { ingressId: 'IN_Kx2vY3cXoGz7', roomName: 'demo-room' } }],
  ['ingress_ended', { ingressInfo: { ingressId: 'IN_Kx2vY3cXoGz7', roomName: 'demo-room' } }],
  ['agent_job_pending', { job: { id: 'AJ_5mGHkLz7rT2d' } }],
  ['agent_job_started', { job: { id: 'AJ_5mGHkLz7rT2d' } }],
  ['agent_job_ended', { job: { id: 'AJ_5mGHkLz7rT2d' } }],
];

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.LIVEKIT_API_KEY = API_KEY;
  process.env.LIVEKIT_API_SECRET = API_SECRET;
  ({ POST } = await import('../app/webhooks/livekit/route'));
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.LIVEKIT_API_KEY = API_KEY;
  process.env.LIVEKIT_API_SECRET = API_SECRET;
});

function makeRequest(body: string, authorization?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/webhook+json' };
  if (authorization !== undefined) headers.authorization = authorization;
  return new NextRequest('http://localhost:3000/webhooks/livekit', { method: 'POST', headers, body });
}

describe('LiveKit webhook route', () => {
  it.each(EVENTS)('accepts a correctly signed %s event', async (event, extra) => {
    const body = payload(event, extra);
    const res = await POST(makeRequest(body, await sign(body)));
    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown event name with 200', async () => {
    const body = payload('some_future_event');
    expect((await POST(makeRequest(body, await sign(body)))).status).toBe(200);
  });

  it('accepts a numeric createdAt as well as the protojson string form', async () => {
    const body = JSON.stringify({ event: 'room_started', id: 'EV_1', createdAt: now(), room });
    expect((await POST(makeRequest(body, await sign(body)))).status).toBe(200);
  });

  it('warns when numDropped shows lost events', async () => {
    const body = payload('room_started', { room, numDropped: 3 });
    expect((await POST(makeRequest(body, await sign(body)))).status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('dropped 3'));
  });

  it('tolerates a Bearer prefix added by a proxy', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, `Bearer ${await sign(body)}`))).status).toBe(200);
  });

  it('accepts a token that expired within the 10 s clock tolerance', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, await sign(body, { iat: now() - 305 })))).status).toBe(200);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    expect((await POST(makeRequest(payload('room_started', { room })))).status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const body = payload('room_started', { room });
    const token = await sign(body, { secret: 'another_secret_0123456789abcdefghijklmn' });
    expect((await POST(makeRequest(body, token))).status).toBe(401);
  });

  it('rejects a token whose iss is a different API key', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, await sign(body, { key: 'APIotherkey' })))).status).toBe(401);
  });

  it('rejects an expired token (tokens live 5 minutes)', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, await sign(body, { iat: now() - 600 })))).status).toBe(401);
  });

  it('rejects a signed token with no exp claim', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, await sign(body, { omitExp: true })))).status).toBe(401);
  });

  it('rejects a valid token with no sha256 claim', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, await sign(body, { sha256: null })))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const token = await sign(payload('room_started', { room }));
    expect((await POST(makeRequest(payload('room_finished', { room }), token))).status).toBe(401);
  });

  it('rejects a body that was re-serialised after signing', async () => {
    const original = '{"event": "room_started", "id": "EV_1", "createdAt": "1700000000"}';
    const token = await sign(original);
    expect((await POST(makeRequest(JSON.stringify(JSON.parse(original)), token))).status).toBe(401);
  });

  it('rejects a hex digest in the sha256 claim (must be base64)', async () => {
    const body = payload('room_started', { room });
    const hex = crypto.createHash('sha256').update(body).digest('hex');
    expect((await POST(makeRequest(body, await sign(body, { sha256: hex })))).status).toBe(401);
  });

  it('rejects an HS512 token (algorithm pinned to HS256)', async () => {
    const body = payload('room_started', { room });
    expect((await POST(makeRequest(body, await sign(body, { alg: 'HS512' })))).status).toBe(401);
  });

  it('rejects an unsigned alg=none token', async () => {
    const body = payload('room_started', { room });
    const token = new UnsecuredJWT({ sha256: sha256b64(body) }).setIssuer(API_KEY).setExpirationTime(now() + 300).encode();
    expect((await POST(makeRequest(body, token))).status).toBe(401);
  });

  it('fails closed (401) when credentials are not configured', async () => {
    const body = payload('room_started', { room });
    const token = await sign(body);
    delete process.env.LIVEKIT_API_KEY;
    expect((await POST(makeRequest(body, token))).status).toBe(401);
  });

  it('returns 400 for a correctly signed non-JSON body', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, await sign(body)))).status).toBe(400);
  });
});
