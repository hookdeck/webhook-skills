import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/quicknode/route';
import { verifyQuicknodeWebhook } from '../lib/verify';

// Security token as shown in the Quicknode dashboard; used as UTF-8 text, not decoded
const SECRET = 'qn_test_security_token_0123456789';

// Real Quicknode algorithm: hex HMAC-SHA256 over nonce + timestamp + body, no separators
function sign(nonce: string, timestamp: string, body: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(nonce, 'latin1'), Buffer.from(timestamp, 'latin1'), Buffer.from(body)]))
    .digest('hex');
}

let counter = 0;
interface Delivery {
  body: string;
  headers: Record<string, string>;
}

function delivery(body: string, o: { nonce?: string; timestamp?: string; signature?: string } = {}): Delivery {
  const nonce = o.nonce ?? `nonce-${Date.now()}-${counter++}`;
  const timestamp = o.timestamp ?? String(Math.floor(Date.now() / 1000));
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-qn-nonce': nonce,
      'x-qn-timestamp': timestamp,
      'x-qn-signature': o.signature ?? sign(nonce, timestamp, body),
    },
  };
}

async function post(d: Delivery) {
  const req = new NextRequest('http://localhost:3000/webhooks/quicknode', {
    method: 'POST',
    headers: d.headers,
    body: d.body,
  });
  return POST(req);
}

// Illustrative payloads (Quicknode has no event types)
const streamsBatch = JSON.stringify({
  data: [{ number: '0x1', hash: '0xabc' }],
  metadata: { dataset: 'block', network: 'ethereum-mainnet', stream_id: 'stream-1' },
});
const webhookMatches = JSON.stringify([{ hash: '0xdef', from: '0x01', to: '0x02' }]);

describe('Quicknode webhook route', () => {
  beforeEach(() => {
    process.env.QUICKNODE_WEBHOOK_SECRET = SECRET;
    delete process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid Streams batch', async () => {
    expect((await post(delivery(streamsBatch))).status).toBe(200);
  });

  it('accepts a valid Webhooks array', async () => {
    expect((await post(delivery(webhookMatches))).status).toBe(200);
  });

  it('accepts any content type (raw body)', async () => {
    const d = delivery(streamsBatch);
    d.headers['content-type'] = 'text/plain';
    expect((await post(d)).status).toBe(200);
  });

  it('verifies the exact bytes received, not a re-serialised body', async () => {
    const spaced = '{ "data": [ 1 ],   "metadata": { "dataset": "block" } }\n';
    expect((await post(delivery(spaced))).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const d = delivery(streamsBatch);
    d.headers['x-qn-signature'] = d.headers['x-qn-signature'].toUpperCase();
    expect((await post(d)).status).toBe(200);
  });

  it('rejects missing signature, nonce or timestamp with 401', async () => {
    for (const name of ['x-qn-signature', 'x-qn-nonce', 'x-qn-timestamp']) {
      const d = delivery(streamsBatch);
      delete d.headers[name];
      expect((await post(d)).status).toBe(401);
    }
  });

  it('rejects an empty signature with 401', async () => {
    const d = delivery(streamsBatch);
    d.headers['x-qn-signature'] = '';
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
    d2.headers['x-qn-nonce'] = 'another-nonce';
    expect((await post(d2)).status).toBe(401);

    const d3 = delivery(streamsBatch);
    d3.headers['x-qn-timestamp'] = '1';
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
    expect((await post(delivery(streamsBatch))).status).toBe(500);
  });

  it('acknowledges a repeated nonce without reprocessing', async () => {
    const d = delivery(streamsBatch);
    expect((await (await post(d)).json()).duplicate).toBeUndefined();
    expect((await (await post(d)).json()).duplicate).toBe(true);
  });

  describe('opt-in timestamp tolerance', () => {
    it('ignores old timestamps by default', async () => {
      expect((await post(delivery(streamsBatch, { timestamp: '1000000000' }))).status).toBe(200);
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
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from([0x63, 0x61, 0x66, 0xe9]), Buffer.from('1'), body]))
      .digest('hex');
    const headers = new Headers({ 'x-qn-nonce': 'café', 'x-qn-timestamp': '1', 'x-qn-signature': sig });
    expect(verifyQuicknodeWebhook(body, headers, SECRET).valid).toBe(true);
  });
});
