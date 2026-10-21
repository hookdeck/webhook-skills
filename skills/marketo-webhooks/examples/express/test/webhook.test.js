const request = require('supertest');

// Marketo does not sign webhooks. The "secret" is a random value YOU put in the
// Smart Campaign webhook's custom headers; tests send it the same way.
const SECRET = '3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e';
process.env.MARKETO_WEBHOOK_SECRET = SECRET;
delete process.env.MARKETO_WEBHOOK_HEADER;

const { app, EVENTS, verifyMarketoSecret, dedupeKey, dispatch } = require('../src/index');

const PATH = '/webhooks/marketo';

// Mirrors the Payload Template from references/setup.md after Marketo
// has substituted the tokens.
function leadPayload(event, overrides = {}) {
  return {
    event,
    campaign: 'Webinar follow-up',
    lead: {
      id: 1042,
      email: 'amy@example.com',
      first_name: 'Amy',
      last_name: 'Chen',
      company: 'Acme Inc',
      ...overrides,
    },
  };
}

function send(body, { header = 'X-Webhook-Secret', secret = SECRET, contentType = 'application/json' } = {}) {
  const req = request(app).post(PATH).set('Content-Type', contentType);
  if (secret !== null) req.set(header, secret);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeEach(() => {
  process.env.MARKETO_WEBHOOK_SECRET = SECRET;
  delete process.env.MARKETO_WEBHOOK_HEADER;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMarketoSecret', () => {
  it('accepts the matching secret', () => {
    expect(verifyMarketoSecret(SECRET)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(verifyMarketoSecret('0'.repeat(SECRET.length))).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyMarketoSecret(`${SECRET}0`)).toBe(false);
    expect(verifyMarketoSecret('short')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyMarketoSecret(undefined)).toBe(false);
  });

  it('throws (fails closed) when MARKETO_WEBHOOK_SECRET is unset', () => {
    delete process.env.MARKETO_WEBHOOK_SECRET;
    expect(() => verifyMarketoSecret(SECRET)).toThrow(/MARKETO_WEBHOOK_SECRET/);
  });
});

describe('POST /webhooks/marketo', () => {
  it('accepts lead_created with a valid secret', async () => {
    const res = await send(leadPayload(EVENTS.LEAD_CREATED));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts lead_updated with a valid secret', async () => {
    const res = await send(leadPayload(EVENTS.LEAD_UPDATED, { company: 'Acme Corp' }));
    expect(res.status).toBe(200);
  });

  it('matches the header name case-insensitively', async () => {
    const res = await send(leadPayload(EVENTS.LEAD_CREATED), { header: 'x-webhook-secret' });
    expect(res.status).toBe(200);
  });

  it('uses MARKETO_WEBHOOK_HEADER when set', async () => {
    process.env.MARKETO_WEBHOOK_HEADER = 'X-Acme-Token';
    const ok = await send(leadPayload(EVENTS.LEAD_CREATED), { header: 'X-Acme-Token' });
    expect(ok.status).toBe(200);
    const wrongHeader = await send(leadPayload(EVENTS.LEAD_CREATED));
    expect(wrongHeader.status).toBe(401);
  });

  it('rejects a missing secret header with 401', async () => {
    const res = await send(leadPayload(EVENTS.LEAD_CREATED), { secret: null });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await send(leadPayload(EVENTS.LEAD_CREATED), { secret: 'not-the-secret' });
    expect(res.status).toBe(401);
  });

  it('checks the secret before parsing the body', async () => {
    const res = await send('{not json', { secret: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.MARKETO_WEBHOOK_SECRET;
    const res = await send(leadPayload(EVENTS.LEAD_CREATED));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON (e.g. Form/Url encoding)', async () => {
    const res = await send('email=amy%40example.com&id=1', {
      contentType: 'application/x-www-form-urlencoded',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the payload has no event field', async () => {
    const res = await send({ lead: { id: 1042 } });
    expect(res.status).toBe(400);
  });

  it('acknowledges an unknown event with 200', async () => {
    const res = await send(leadPayload('lead_escalated'));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('lead_escalated'));
  });

  it('accepts a body sent without a JSON content type', async () => {
    const res = await send(leadPayload(EVENTS.LEAD_CREATED), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });
});

describe('dispatch', () => {
  it('recognises both events', async () => {
    expect(await dispatch(leadPayload(EVENTS.LEAD_CREATED))).toBe(true);
    expect(await dispatch(leadPayload(EVENTS.LEAD_UPDATED))).toBe(true);
  });

  it('returns false for an unknown event', async () => {
    expect(await dispatch(leadPayload('something_else'))).toBe(false);
  });

  it('tolerates a payload without a lead object', async () => {
    expect(await dispatch({ event: EVENTS.LEAD_CREATED })).toBe(true);
  });
});

describe('dedupeKey', () => {
  it('combines event, lead id and campaign', () => {
    expect(dedupeKey(leadPayload(EVENTS.LEAD_UPDATED))).toBe('lead_updated:1042:Webinar follow-up');
  });

  it('returns null without a lead id', () => {
    expect(dedupeKey({ event: EVENTS.LEAD_CREATED })).toBeNull();
  });
});
