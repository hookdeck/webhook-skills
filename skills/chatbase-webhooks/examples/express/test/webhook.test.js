const request = require('supertest');
const crypto = require('crypto');

// Test secret only. Chatbase's docs don't say where the Action webhook secret is shown.
process.env.CHATBASE_WEBHOOK_SECRET = 'test_chatbase_webhook_secret';

const { app, verifyChatbaseSignature, parseEventType } = require('../src/index');

const SECRET = process.env.CHATBASE_WEBHOOK_SECRET;

/** Sign like Chatbase Action webhooks: hex(HMAC-SHA1(secret, rawBody)) */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

// The leads.submit body Chatbase's webhook guide prints (placeholder values).
const leadEvent = {
  eventType: 'leads.submit',
  chatbotId: 'xxxxxxxx',
  payload: {
    conversationId: 'xxxxxxxx',
    customerEmail: 'example@chatbase.co',
    customerName: 'Example',
    customerPhone: '123',
    customFields: { 'Company name': 'Acme', 'Team size': 12, utm_source: 'google', utm_campaign: 'spring_sale' },
  },
};

// The fixtures below are illustrative: the guide documents these payloads as field shapes only.
const phoneEvent = {
  eventType: 'phone_call.summary',
  chatbotId: 'agent_123',
  payload: {
    conversationId: 'conv_789',
    callSummary: 'Example summary',
    duration: 94,
    callerNumber: '+15555550100',
    calledNumber: '+15555550199',
  },
};

// "Book demo" and "Shipping address" are example Action names.
const formEvent = {
  eventType: 'Book demo_custom_form.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_1', data: { field: 'value' }, error: null },
};

const collectEvent = {
  eventType: 'Shipping address_collect_data.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_2', customFields: { field: 'value' } },
};

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/chatbase').set('Content-Type', contentType);
  if (signature) req.set('x-chatbase-signature', signature);
  return req.send(body);
}

describe('verifyChatbaseSignature', () => {
  const body = JSON.stringify(leadEvent);

  it('accepts a valid HMAC-SHA1 hex signature over the raw body', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), sign(body).toUpperCase(), SECRET)).toBe(true);
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

  it('rejects a 39-character value', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), sign(body).slice(0, 39), SECRET)).toBe(false);
  });

  it('rejects a non-hex value of the right length', () => {
    expect(verifyChatbaseSignature(Buffer.from(body), 'z'.repeat(40), SECRET)).toBe(false);
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

  it('returns 400 for a signature signed with the wrong secret', async () => {
    const body = JSON.stringify(leadEvent);
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature', async () => {
    const body = JSON.stringify(leadEvent);
    expect((await post(body, sign(body).slice(0, 39))).status).toBe(400);
    expect((await post(body, 'g'.repeat(40))).status).toBe(400);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(leadEvent);
    const res = await post(body, sign(body).toUpperCase());
    expect(res.status).toBe(200);
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

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
