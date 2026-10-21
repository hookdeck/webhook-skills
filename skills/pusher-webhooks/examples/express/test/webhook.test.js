const request = require('supertest');
const crypto = require('crypto');

const APP_KEY = 'a1b2c3d4e5f6a7b8c9d0';
const APP_SECRET = 'f0e1d2c3b4a5968778695a4b3c2d1e0f'; // Pusher app secrets are opaque hex strings

process.env.PUSHER_APP_ID = '123456';
process.env.PUSHER_APP_KEY = APP_KEY;
process.env.PUSHER_APP_SECRET = APP_SECRET;
process.env.PUSHER_CLUSTER = 'mt1';

const app = require('../src/index');

// Pusher: hex HMAC-SHA256 of the raw body, keyed with the app secret
function sign(body, secret = APP_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function body(events) {
  return JSON.stringify({ time_ms: Date.now(), events });
}

function post(payload, { key = APP_KEY, signature = sign(payload), contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/pusher').set('Content-Type', contentType);
  if (key) req.set('X-Pusher-Key', key);
  if (signature) req.set('X-Pusher-Signature', signature);
  return req.send(payload);
}

describe('Pusher webhook endpoint', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid channel_occupied webhook', async () => {
    const res = await post(body([{ name: 'channel_occupied', channel: 'my-channel' }]));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Channel occupied: my-channel');
  });

  it('handles every documented event type', async () => {
    const payload = body([
      { name: 'channel_occupied', channel: 'c1' },
      { name: 'channel_vacated', channel: 'c1' },
      { name: 'member_added', channel: 'presence-r', user_id: 'u1' },
      { name: 'member_removed', channel: 'presence-r', user_id: 'u1' },
      { name: 'client_event', channel: 'private-c', event: 'client-typing', data: '{}', socket_id: '1.2' },
      { name: 'cache_miss', channel: 'cache-c' },
      { name: 'subscription_count', channel: 'c1', subscription_count: 3 },
    ]);
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Channel vacated: c1');
    expect(logSpy).toHaveBeenCalledWith('Member u1 joined presence-r');
    expect(logSpy).toHaveBeenCalledWith('Member u1 left presence-r');
    expect(logSpy).toHaveBeenCalledWith('Client event client-typing on private-c from 1.2');
    expect(logSpy).toHaveBeenCalledWith('Cache miss on cache-c');
    expect(logSpy).toHaveBeenCalledWith('Subscription count on c1: 3');
  });

  it('processes every event in a batched webhook', async () => {
    const res = await post(body([
      { name: 'channel_occupied', channel: 'a' },
      { name: 'channel_occupied', channel: 'b' },
    ]));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Channel occupied: a');
    expect(logSpy).toHaveBeenCalledWith('Channel occupied: b');
  });

  it('rejects an invalid signature', async () => {
    const payload = body([{ name: 'channel_occupied', channel: 'x' }]);
    const res = await post(payload, { signature: 'deadbeef' });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const payload = body([{ name: 'channel_occupied', channel: 'x' }]);
    const res = await post(payload, { signature: sign(payload, 'wrong-secret') });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const payload = body([{ name: 'channel_occupied', channel: 'x' }]);
    const signature = sign(payload);
    const res = await post(payload.replace('"x"', '"y"'), { signature });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(body([{ name: 'channel_occupied', channel: 'x' }]), { signature: null });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown X-Pusher-Key', async () => {
    const res = await post(body([{ name: 'channel_occupied', channel: 'x' }]), { key: 'other-key' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON content type', async () => {
    const res = await post(body([{ name: 'channel_occupied', channel: 'x' }]), { contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});
