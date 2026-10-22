const crypto = require('crypto');
const request = require('supertest');
const { encode } = require('@msgpack/msgpack');

// Ably API keys look like appId.keyId:keyValue. Only keyValue is the HMAC key.
const KEY_ID = 'aBCdEf.gHiJkL';
const KEY_VALUE = 'mNoPqRsTuVwXyZ0123456789abcdefABCDEFghijkl';
const API_KEY = `${KEY_ID}:${KEY_VALUE}`;
process.env.ABLY_API_KEY = API_KEY;

const app = require('../src/index');

// Ably: base64 HMAC-SHA256 of the raw body bytes, keyed with keyValue
function sign(body, keyValue = KEY_VALUE) {
  return crypto.createHmac('sha256', keyValue).update(body).digest('base64');
}

function post(body, { contentType = 'application/json', signature, key = KEY_ID, extra = {} } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const req = request(app).post('/webhooks/ably').set('Content-Type', contentType);
  const sig = signature === undefined ? sign(buf) : signature;
  if (sig) req.set('X-Ably-Signature', sig);
  if (key) req.set('X-Ably-Key', key);
  for (const [k, v] of Object.entries(extra)) req.set(k, v);
  // superagent JSON-serializes Buffers for application/json, so send strings as strings
  return req.send(typeof body === 'string' ? body : buf);
}

const envelope = (source, extra) => ({
  source, appId: 'aBCdEf', channel: 'my-channel', site: 'eu-central-1-A', ruleId: '1-a2Bc', ...extra,
});

describe('Ably webhook', () => {
  let log;
  beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { log.mockRestore(); jest.restoreAllMocks(); });

  it('accepts an enveloped channel.message', async () => {
    const body = JSON.stringify(envelope('channel.message', {
      messages: [{ id: 'A:1:0', clientId: 'user-3', name: 'greeting', data: 'hi' }],
    }));
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(log).toHaveBeenCalledWith('Message "greeting" on my-channel from user-3');
  });

  it('accepts channel.presence and decodes the numeric action', async () => {
    const body = JSON.stringify(envelope('channel.presence', {
      presence: [{ id: 'A:1:0', clientId: 'bob', action: 4 }],
    }));
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Presence update: bob on my-channel');
  });

  it('accepts a batched channel.lifecycle request', async () => {
    const body = JSON.stringify({ items: [{
      webhookId: 'ABcDEf', source: 'channel.lifecycle', name: 'channel.opened',
      data: { channelId: 'my-channel-5', status: { isActive: true } },
    }] });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Channel lifecycle channel.opened on my-channel-5');
  });

  it('processes every item in a batch', async () => {
    const body = JSON.stringify({ items: [
      { source: 'channel.message', name: 'channel.message', data: { channelId: 'c1', messages: [{ name: 'a', clientId: 'x' }] } },
      { source: 'channel.occupancy', name: 'channel.occupancy', data: { channelId: 'c2' } },
    ] });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Message "a" on c1 from x');
    expect(log).toHaveBeenCalledWith('Occupancy changed on c2');
  });

  it('accepts channel.occupancy', async () => {
    const res = await post(JSON.stringify(envelope('channel.occupancy')));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Occupancy changed on my-channel');
  });

  it('verifies msgpack bodies signed as raw bytes', async () => {
    const body = Buffer.from(encode(envelope('channel.message', {
      messages: [{ name: 'packed', clientId: 'u' }],
    })));
    const res = await post(body, { contentType: 'application/x-msgpack' });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Message "packed" on my-channel from u');
  });

  it('verifies non-enveloped events with any content type', async () => {
    const res = await post('plain text payload', {
      contentType: 'text/plain',
      extra: {
        'X-Ably-Envelope-Source': 'channel.message',
        'X-Ably-Envelope-Channel': 'my_channel',
        'X-Ably-Message-Name': 'publish',
      },
    });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Message "publish" on my_channel');
  });

  it('rejects a signature made with the whole API key instead of keyValue', async () => {
    const body = JSON.stringify(envelope('channel.message'));
    const res = await post(body, { signature: sign(body, API_KEY) });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(JSON.stringify(envelope('channel.message')), { signature: 'aW52YWxpZA==' });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(envelope('channel.message', { messages: [{ name: 'a' }] }));
    const res = await post(body.replace('"a"', '"b"'), { signature: sign(body) });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await post(JSON.stringify(envelope('channel.message')), { signature: '' });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Missing X-Ably-Signature/);
  });

  it('rejects a request signed by a different key', async () => {
    const res = await post(JSON.stringify(envelope('channel.message')), { key: 'aBCdEf.other' });
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not parseable', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid payload');
  });
});
