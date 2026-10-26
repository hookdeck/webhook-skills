const request = require('supertest');
const crypto = require('crypto');

// Security token as shown in the Quicknode dashboard; used as UTF-8 text, not decoded
const SECRET = 'qn_test_security_token_0123456789';
process.env.QUICKNODE_WEBHOOK_SECRET = SECRET;

const { app, verifyQuicknodeWebhook, processedNonces } = require('../src/index');

// Real Quicknode algorithm: hex HMAC-SHA256 over nonce + timestamp + body, no separators
function sign(nonce, timestamp, body, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(nonce, 'latin1'), Buffer.from(timestamp, 'latin1'), Buffer.from(body)]))
    .digest('hex');
}

let counter = 0;
function delivery(body, overrides = {}) {
  const nonce = overrides.nonce ?? `nonce-${Date.now()}-${counter++}`;
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  return {
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-QN-Nonce': nonce,
      'X-QN-Timestamp': timestamp,
      'X-QN-Signature': overrides.signature ?? sign(nonce, timestamp, body),
    },
  };
}

function post(d) {
  return request(app).post('/webhooks/quicknode').set(d.headers).send(d.body);
}

// Illustrative payloads (Quicknode has no event types)
const streamsBatch = JSON.stringify({
  data: [{ number: '0x1', hash: '0xabc' }],
  metadata: { dataset: 'block', network: 'ethereum-mainnet', stream_id: 'stream-1' },
});
const webhookMatches = JSON.stringify([{ hash: '0xdef', from: '0x01', to: '0x02' }]);

describe('Quicknode webhook handler', () => {
  beforeEach(() => {
    processedNonces.clear();
    delete process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid Streams batch', async () => {
    const res = await post(delivery(streamsBatch));
    expect(res.status).toBe(200);
  });

  it('accepts a valid Webhooks array', async () => {
    const res = await post(delivery(webhookMatches));
    expect(res.status).toBe(200);
  });

  it('accepts any content type (raw body)', async () => {
    const d = delivery(streamsBatch);
    d.headers['Content-Type'] = 'text/plain';
    expect((await post(d)).status).toBe(200);
  });

  it('verifies the exact bytes received, not a re-serialised body', async () => {
    const spaced = '{ "data": [ 1 ],   "metadata": { "dataset": "block" } }\n';
    expect((await post(delivery(spaced))).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const d = delivery(streamsBatch);
    d.headers['X-QN-Signature'] = d.headers['X-QN-Signature'].toUpperCase();
    expect((await post(d)).status).toBe(200);
  });

  it('rejects missing signature, nonce or timestamp with 401', async () => {
    for (const name of ['X-QN-Signature', 'X-QN-Nonce', 'X-QN-Timestamp']) {
      const d = delivery(streamsBatch);
      delete d.headers[name];
      expect((await post(d)).status).toBe(401);
    }
  });

  it('rejects an empty signature with 401', async () => {
    const d = delivery(streamsBatch);
    d.headers['X-QN-Signature'] = '';
    expect((await post(d)).status).toBe(401);
  });

  it('rejects malformed signatures with 401', async () => {
    const good = sign('n', 't', streamsBatch);
    for (const bad of [good.slice(0, 63), good + '0', 'z'.repeat(64), `sha256=${good}`, `${good},${good}`]) {
      const d = delivery(streamsBatch, { nonce: 'n', timestamp: 't', signature: bad });
      expect((await post(d)).status).toBe(401);
    }
  });

  it('rejects a signature from the wrong secret', async () => {
    const d = delivery(streamsBatch, { nonce: 'n1', timestamp: '1', signature: sign('n1', '1', streamsBatch, 'other') });
    expect((await post(d)).status).toBe(401);
  });

  it('rejects a tampered body, nonce or timestamp', async () => {
    const d = delivery(streamsBatch);
    expect((await post({ ...d, body: streamsBatch.replace('0x1', '0x2') })).status).toBe(401);

    const d2 = delivery(streamsBatch);
    d2.headers['X-QN-Nonce'] = 'another-nonce';
    expect((await post(d2)).status).toBe(401);

    const d3 = delivery(streamsBatch);
    d3.headers['X-QN-Timestamp'] = '1';
    expect((await post(d3)).status).toBe(401);
  });

  it('does not accept a signature built with separators', async () => {
    const hmac = crypto.createHmac('sha256', SECRET).update(`n.t.${streamsBatch}`).digest('hex');
    const d = delivery(streamsBatch, { nonce: 'n', timestamp: 't', signature: hmac });
    expect((await post(d)).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await post(delivery('not json'))).status).toBe(400);
  });

  it('returns 500 when no secret is configured', async () => {
    delete process.env.QUICKNODE_WEBHOOK_SECRET;
    const res = await post(delivery(streamsBatch));
    process.env.QUICKNODE_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });

  it('acknowledges a repeated nonce without reprocessing', async () => {
    const d = delivery(streamsBatch);
    expect((await post(d)).text).toBe('OK');
    expect((await post(d)).text).toBe('Already processed');
  });

  describe('opt-in timestamp tolerance', () => {
    it('ignores old timestamps by default', async () => {
      const d = delivery(streamsBatch, { timestamp: '1000000000' });
      expect((await post(d)).status).toBe(200);
    });

    it('rejects old timestamps when enabled', async () => {
      process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const d = delivery(streamsBatch, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) });
      expect((await post(d)).status).toBe(401);
    });

    it('accepts fresh seconds, milliseconds and ISO timestamps when enabled', async () => {
      process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS = '300';
      for (const ts of [String(Math.floor(Date.now() / 1000)), String(Date.now()), new Date().toISOString()]) {
        expect((await post(delivery(streamsBatch, { timestamp: ts }))).status).toBe(200);
      }
    });

    it('rejects an unparseable timestamp when enabled', async () => {
      process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(delivery(streamsBatch, { timestamp: 'soon' }))).status).toBe(401);
    });
  });
});

describe('verifyQuicknodeWebhook', () => {
  it('encodes header values as latin1', () => {
    const body = Buffer.from('{}');
    const nonce = 'café';
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from([0x63, 0x61, 0x66, 0xe9]), Buffer.from('1'), body]))
      .digest('hex');
    const headers = { 'x-qn-nonce': nonce, 'x-qn-timestamp': '1', 'x-qn-signature': sig };
    expect(verifyQuicknodeWebhook(body, headers, SECRET).valid).toBe(true);
  });

  it('rejects a string body (raw bytes required)', () => {
    const headers = { 'x-qn-nonce': 'n', 'x-qn-timestamp': 't', 'x-qn-signature': sign('n', 't', '{}') };
    expect(verifyQuicknodeWebhook('{}', headers, SECRET).valid).toBe(false);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
