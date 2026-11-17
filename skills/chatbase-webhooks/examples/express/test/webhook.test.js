const request = require('supertest');
const crypto = require('crypto');

// Event webhook secret: any string; Chatbase's own sample reads it from SECRET_KEY
process.env.CHATBASE_WEBHOOK_SECRET = 'test_chatbase_webhook_secret';
// HIPAA signing secrets are 64-character hex strings, used as-is (UTF-8) as the HMAC key
process.env.CHATBASE_HIPAA_WEBHOOK_SECRET = 'a'.repeat(32) + 'b'.repeat(32);

const {
  app,
  verifyChatbaseSignature,
  verifyChatbaseHipaaSignature,
  parseEventType,
} = require('../src/index');

const SECRET = process.env.CHATBASE_WEBHOOK_SECRET;
const HIPAA_SECRET = process.env.CHATBASE_HIPAA_WEBHOOK_SECRET;

/** Sign like Chatbase event webhooks: hex(HMAC-SHA1(secret, rawBody)) */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

/** Sign like the HIPAA webhook: "v1=" + hex(HMAC-SHA256(secret, `${ts}.${body}`)) */
function signHipaa(body, timestamp, secret = HIPAA_SECRET) {
  return 'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

const leadEvent = {
  eventType: 'leads.submit',
  chatbotId: 'agent_123',
  payload: {
    conversationId: 'conv_456',
    customerEmail: 'example@chatbase.co',
    customerName: 'Example',
    customerPhone: '123',
    customFields: { 'Company name': 'Acme', 'Team size': 12, utm_source: 'google' },
  },
};

const phoneEvent = {
  eventType: 'phone_call.summary',
  chatbotId: 'agent_123',
  payload: {
    conversationId: 'conv_789',
    callSummary: 'Caller asked about opening hours.',
    duration: 94,
    callerNumber: '+14155550100',
    calledNumber: '+14155550199',
  },
};

const formEvent = {
  eventType: 'Book demo_custom_form.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_1', data: { email: 'a@b.co' }, error: null },
};

const collectEvent = {
  eventType: 'Shipping address_collect_data.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_2', customFields: { City: 'Paris' } },
};

const hipaaEvent = {
  deliveryId: 'b7c1e0a4-3f52-4d81-9a6c-2e4f8d0b1c73',
  event: 'conversation.deleted',
  deletedAt: '2026-08-17T03:00:00.000Z',
  deletionReason: 'idle_24h',
  conversation: {
    id: 'd41f8a92-6b3c-4e17-8f5a-9c0d2b7e4a16',
    chatbotId: 'c8e2f1b6-5a94-4d03-b7e8-1f6a3c9d0e52',
    messages: [{ id: 'msg_1', role: 'user', content: 'Hi' }],
  },
};

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/chatbase').set('Content-Type', contentType);
  if (signature) req.set('x-chatbase-signature', signature);
  return req.send(body);
}

function postHipaa(body, { signature, timestamp } = {}) {
  const req = request(app).post('/webhooks/chatbase-hipaa').set('Content-Type', 'application/json');
  if (signature) req.set('X-Chatbase-Signature', signature);
  if (timestamp) req.set('X-Chatbase-Timestamp', timestamp);
  return req.send(body);
}

describe('verifyChatbaseSignature', () => {
  const body = JSON.stringify(leadEvent);

  it('accepts a valid HMAC-SHA1 hex signature over the raw body', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('produces a bare 40-char hex digest (no prefix)', () => {
    expect(sign(body)).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a tampered body', () => {
    expect(verifyChatbaseSignature(Buffer.from(body.replace('Example', 'Evil')), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyChatbaseSignature(Buffer.from(body), sha256, SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifyChatbaseSignature(Buffer.from(body), sign(body), undefined)).toBe(false);
  });
});

describe('verifyChatbaseHipaaSignature', () => {
  const body = JSON.stringify(hipaaEvent);

  it('accepts a valid v1= signature over timestamp.body', () => {
    const ts = now();
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), signHipaa(body, ts), ts, HIPAA_SECRET)).toEqual({ ok: true });
  });

  it('rejects a signature without the v1= prefix', () => {
    const ts = now();
    const bare = signHipaa(body, ts).slice(3);
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), bare, ts, HIPAA_SECRET).ok).toBe(false);
  });

  it('rejects a signature over the body alone', () => {
    const ts = now();
    const bodyOnly = 'v1=' + crypto.createHmac('sha256', HIPAA_SECRET).update(body).digest('hex');
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), bodyOnly, ts, HIPAA_SECRET).ok).toBe(false);
  });

  it('rejects a timestamp older than 5 minutes', () => {
    const ts = String(Math.floor(Date.now() / 1000) - 301);
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), signHipaa(body, ts), ts, HIPAA_SECRET)).toEqual({
      ok: false,
      error: 'stale_timestamp',
    });
  });

  it('rejects a non-numeric timestamp', () => {
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), signHipaa(body, 'abc'), 'abc', HIPAA_SECRET).error).toBe(
      'stale_timestamp'
    );
  });

  it('reports missing headers separately', () => {
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), undefined, now(), HIPAA_SECRET).error).toBe('missing_headers');
    expect(verifyChatbaseHipaaSignature(Buffer.from(body), 'v1=x', undefined, HIPAA_SECRET).error).toBe('missing_headers');
  });
});

describe('parseEventType', () => {
  it('parses fixed and Action-named event types', () => {
    expect(parseEventType('leads.submit')).toEqual({ kind: 'leads.submit' });
    expect(parseEventType('phone_call.summary')).toEqual({ kind: 'phone_call.summary' });
    expect(parseEventType('Book demo_custom_form.submit')).toEqual({ kind: 'custom_form.submit', actionName: 'Book demo' });
    expect(parseEventType('Shipping address_collect_data.submit')).toEqual({
      kind: 'collect_data.submit',
      actionName: 'Shipping address',
    });
    expect(parseEventType('_custom_form.submit')).toEqual({ kind: 'unknown' });
    expect(parseEventType('something.else')).toEqual({ kind: 'unknown' });
  });
});

describe('POST /webhooks/chatbase', () => {
  it('returns 400 when x-chatbase-signature is missing', async () => {
    const res = await post(JSON.stringify(leadEvent));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing x-chatbase-signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify(leadEvent), 'a'.repeat(40));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it.each([
    [leadEvent, 'leads.submit'],
    [phoneEvent, 'phone_call.summary'],
    [formEvent, 'custom_form.submit'],
    [collectEvent, 'collect_data.submit'],
  ])('accepts a signed %#: %s', async (event, kind) => {
    const body = JSON.stringify(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, eventType: event.eventType, kind });
  });

  it('acknowledges unknown event types', async () => {
    const body = JSON.stringify({ eventType: 'new.event', chatbotId: 'x', payload: {} });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('unknown');
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(leadEvent);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await post('not json', sign('not json'), 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  it('returns 500 when the secret is not configured', async () => {
    const saved = process.env.CHATBASE_WEBHOOK_SECRET;
    delete process.env.CHATBASE_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(leadEvent);
      const res = await post(body, sign(body, saved));
      expect(res.status).toBe(500);
    } finally {
      process.env.CHATBASE_WEBHOOK_SECRET = saved;
    }
  });
});

describe('POST /webhooks/chatbase-hipaa', () => {
  it('accepts a signed conversation.deleted delivery', async () => {
    const body = JSON.stringify(hipaaEvent);
    const ts = now();
    const res = await postHipaa(body, { signature: signHipaa(body, ts), timestamp: ts });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'conversation.deleted' });
  });

  it('acknowledges the signed verification probe without processing it', async () => {
    const body = JSON.stringify({ ...hipaaEvent, test: true });
    const ts = now();
    const res = await postHipaa(body, { signature: signHipaa(body, ts), timestamp: ts });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, test: true });
  });

  it('rejects the probe signed with a throwaway key (non-2xx)', async () => {
    const body = JSON.stringify({ ...hipaaEvent, deliveryId: 'other', test: true });
    const ts = now();
    const res = await postHipaa(body, { signature: signHipaa(body, ts, crypto.randomBytes(32).toString('hex')), timestamp: ts });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('returns 400 for missing headers', async () => {
    const res = await postHipaa(JSON.stringify(hipaaEvent));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_headers');
  });

  it('returns 400 for a stale timestamp', async () => {
    const body = JSON.stringify(hipaaEvent);
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    const res = await postHipaa(body, { signature: signHipaa(body, ts), timestamp: ts });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('stale_timestamp');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
