import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/papergames/route';

// The example secret from the Papergames security docs: 'whsec_' + base64 key
const TEST_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const OTHER_SECRET = 'whsec_b3RoZXJfc2VjcmV0X2tleQ==';

// Svix algorithm: base64(HMAC-SHA256(base64-decoded secret, `${svix-id}.${svix-timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string> } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const headers: Record<string, string> = opts.headers ?? {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/papergames', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
}

// The documented game-session payloads (developers.papergames.io/docs/webhooks/events)
const gameStarted = {
  eventType: 'game.started',
  payload: {
    createdAt: '2023-11-03T10:34:28.191Z',
    gamesPlayed: 0,
    players: [
      { externalId: 'PEP_001', name: 'Pepito', score: 0 },
      { externalId: 'JD_001', name: 'John Doe', score: 0 },
    ],
    status: 'playing',
    uid: '8qgmUmqJj',
    updatedAt: '2023-11-03T10:34:35.508Z',
  },
};

const gameFinished = {
  eventType: 'game.finished',
  payload: {
    createdAt: '2023-11-03T10:34:28.191Z',
    gamesPlayed: 1,
    players: [
      { externalId: 'PEP_001', name: 'Pepito', score: 1 },
      { externalId: 'JD_001', name: 'John Doe', score: 0 },
    ],
    status: 'playing',
    uid: '8qgmUmqJj',
    updatedAt: '2023-11-03T10:34:57.484Z',
  },
};

describe('Papergames webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.PAPERGAMES_WEBHOOK_SECRET = TEST_SECRET;
    delete process.env.PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const logged = () => logSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');

  test('handles game.started', async () => {
    const res = await send(JSON.stringify(gameStarted));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logged()).toContain('Game started in session 8qgmUmqJj');
    expect(logged()).toContain('Pepito (PEP_001)');
  });

  test('handles game.finished and derives the leader from scores', async () => {
    const res = await send(JSON.stringify(gameFinished));
    expect(res.status).toBe(200);
    expect(logged()).toContain('Game finished in session 8qgmUmqJj');
    expect(logged()).toMatch(/Leading: Pepito \(PEP_001\) with score 1/);
  });

  test('falls back to the player name when externalId is absent', async () => {
    const body = structuredClone(gameStarted) as { payload: { players: unknown[] } };
    body.payload.players = [{ name: 'Guest', score: 0 }];
    const res = await send(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(logged()).toContain('Players: Guest');
  });

  test('tolerates the envelope nested under webhookPayload', async () => {
    const res = await send(JSON.stringify({ webhookPayload: gameFinished }));
    expect(res.status).toBe(200);
    expect(logged()).toContain('Game finished in session 8qgmUmqJj');
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(JSON.stringify({ eventType: 'game.cancelled', payload: { uid: 'x' } }));
    expect(res.status).toBe(200);
    expect(logged()).toContain('Unhandled Papergames event type: game.cancelled');
  });

  test('matches a fixed signature vector', async () => {
    // Computed independently with openssl; the tolerance is disabled because the timestamp is fixed
    process.env.PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS = '0';
    const res = await send('{"eventType":"game.started","payload":{"uid":"8qgmUmqJj"}}', {
      msgId: 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W',
      timestamp: '1699007668',
      signature: 'v1,BXFMEbfDNtVqz0PXYTcA6U1v7YTjH7mjbbpo/XBfvxw=',
    });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const res = await send('{ "eventType" : "game.started",\n  "payload": {"uid": "8qgmUmqJj", "players": []} }');
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions (secret rotation)', async () => {
    const payload = JSON.stringify(gameStarted);
    const msgId = 'msg_rotation';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const old = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `${old} v2,${good.slice(3)} ${good}` });
    expect(res.status).toBe(200);
  });

  test('does not accept a valid digest under a non-v1 version tag', async () => {
    const payload = JSON.stringify(gameStarted);
    const msgId = 'msg_v2_only';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: `v2,${sign(payload, msgId, timestamp).slice(3)}` });
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(JSON.stringify(gameStarted), { headers: { 'svix-id': 'msg_1', 'svix-timestamp': now() } });
    expect(res.status).toBe(400);
  });

  test('ignores webhook-* headers (Papergames uses the svix- prefix)', async () => {
    const payload = JSON.stringify(gameStarted);
    const timestamp = now();
    const res = await send(payload, {
      headers: {
        'webhook-id': 'msg_1',
        'webhook-timestamp': timestamp,
        'webhook-signature': sign(payload, 'msg_1', timestamp),
      },
    });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(JSON.stringify(gameStarted), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(400);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = JSON.stringify(gameStarted);
    const msgId = 'msg_other';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(JSON.stringify(gameStarted), msgId, timestamp);
    const res = await send(JSON.stringify(gameFinished), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a signature reused with a different svix-id', async () => {
    const payload = JSON.stringify(gameStarted);
    const timestamp = now();
    const signature = sign(payload, 'msg_original', timestamp);
    const res = await send(payload, { msgId: 'msg_swapped', timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a non-numeric timestamp', async () => {
    const res = await send(JSON.stringify(gameStarted), { timestamp: 'yesterday' });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp outside the default 5-minute window', async () => {
    const payload = JSON.stringify(gameStarted);
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(400);
  });

  test('accepts an old timestamp when the window is widened', async () => {
    process.env.PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS = '86400';
    const payload = JSON.stringify(gameStarted);
    const msgId = 'msg_late_retry';
    const timestamp = (Math.floor(Date.now() / 1000) - 7200).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(200);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.PAPERGAMES_WEBHOOK_SECRET;
    const res = await send(JSON.stringify(gameStarted));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret decodes to zero bytes', async () => {
    process.env.PAPERGAMES_WEBHOOK_SECRET = 'whsec_';
    const res = await send(JSON.stringify(gameStarted));
    expect(res.status).toBe(500);
  });

  test('base64-decodes a secret pasted without the whsec_ prefix', async () => {
    process.env.PAPERGAMES_WEBHOOK_SECRET = TEST_SECRET.slice('whsec_'.length);
    const res = await send(JSON.stringify(gameStarted));
    expect(res.status).toBe(200);
  });
});
