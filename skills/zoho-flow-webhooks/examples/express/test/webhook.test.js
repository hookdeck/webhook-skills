// Generated with: zoho-flow-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

// Test-only values. In Zoho Flow these are the auth profile's Parameter Name
// and the key entered on the connection.
const HEADER = 'X-Webhook-Secret';
const SECRET = 'zflow-test-secret-3b8e0d71c5a2';

process.env.ZOHO_FLOW_WEBHOOK_HEADER = HEADER;
process.env.ZOHO_FLOW_WEBHOOK_SECRET = SECRET;

const { app, verifyZohoFlowRequest, parsePayload } = require('../src/index');

// Illustrative body a Send Webhook action might send.
const formBody = JSON.stringify({
  event: 'form.submitted',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  submitted_at: '2026-11-18T10:15:00Z',
});

beforeEach(() => {
  process.env.ZOHO_FLOW_WEBHOOK_HEADER = HEADER;
  process.env.ZOHO_FLOW_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('verifyZohoFlowRequest', () => {
  it('accepts the exact value and rejects anything else', () => {
    expect(verifyZohoFlowRequest({ 'x-webhook-secret': SECRET }, HEADER, SECRET)).toBe(true);
    expect(verifyZohoFlowRequest({ 'x-webhook-secret': 'nope' }, HEADER, SECRET)).toBe(false);
    expect(verifyZohoFlowRequest({}, HEADER, SECRET)).toBe(false);
    expect(verifyZohoFlowRequest({ 'x-webhook-secret': SECRET }, HEADER, '')).toBe(false);
  });

  it('handles non-ASCII values without throwing', () => {
    expect(verifyZohoFlowRequest({ 'x-webhook-secret': 'clé-secrète' }, HEADER, 'clé-secrète')).toBe(true);
    expect(verifyZohoFlowRequest({ 'x-webhook-secret': 'clé' }, HEADER, 'clé-secrète')).toBe(false);
  });
});

describe('parsePayload', () => {
  it('parses JSON, form-encoded, text and query-only requests', () => {
    expect(parsePayload(formBody, 'application/json').format).toBe('json');
    expect(parsePayload('event=deal.won&deal_id=D-1', 'application/x-www-form-urlencoded').data).toEqual({
      event: 'deal.won',
      deal_id: 'D-1',
    });
    expect(parsePayload('hello', 'text/plain').format).toBe('text');
    expect(parsePayload('', '', { event: 'deal.won' })).toEqual({ format: 'query', data: { event: 'deal.won' } });
    expect(parsePayload('{bad', 'application/json')).toBeNull();
  });
});

describe('/webhooks/zoho-flow', () => {
  it('accepts a POST with the right header and a JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-flow')
      .set('Content-Type', 'application/json')
      .set(HEADER, SECRET)
      .send(formBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith('Form submitted by ada@example.com');
  });

  it.each(['put', 'patch', 'delete'])('accepts %s', async (method) => {
    const res = await request(app)[method]('/webhooks/zoho-flow')
      .set('Content-Type', 'application/json')
      .set(HEADER, SECRET)
      .send(formBody);
    expect(res.status).toBe(200);
  });

  it('accepts a GET and uses the query string as the payload', async () => {
    const res = await request(app).get('/webhooks/zoho-flow?event=deal.won&deal_id=D-1042').set(HEADER, SECRET);
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Deal D-1042 won');
  });

  it('accepts a form-encoded body', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-flow')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set(HEADER, SECRET)
      .send('event=deal.won&deal_id=D-7');
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Deal D-7 won');
  });

  it('looks the header up case-insensitively', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-flow')
      .set('Content-Type', 'application/json')
      .set('x-webhook-secret', SECRET)
      .send(formBody);
    expect(res.status).toBe(200);
  });

  it('uses the header name from ZOHO_FLOW_WEBHOOK_HEADER', async () => {
    process.env.ZOHO_FLOW_WEBHOOK_HEADER = 'X-Api-Key';
    const ok = await request(app).post('/webhooks/zoho-flow').set('X-Api-Key', SECRET).send(formBody);
    const wrongHeader = await request(app).post('/webhooks/zoho-flow').set(HEADER, SECRET).send(formBody);
    expect(ok.status).toBe(200);
    expect(wrongHeader.status).toBe(401);
  });

  it('rejects a missing header with 401', async () => {
    const res = await request(app).post('/webhooks/zoho-flow').set('Content-Type', 'application/json').send(formBody);
    expect(res.status).toBe(401);
  });

  it('rejects the key sent in the query string instead of a header', async () => {
    const res = await request(app).get(`/webhooks/zoho-flow?${HEADER}=${SECRET}`);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong or prefixed value with 401', async () => {
    const wrong = await request(app).post('/webhooks/zoho-flow').set(HEADER, 'wrong-secret').send(formBody);
    const prefixed = await request(app).post('/webhooks/zoho-flow').set(HEADER, `Bearer ${SECRET}`).send(formBody);
    expect(wrong.status).toBe(401);
    expect(prefixed.status).toBe(401);
  });

  it('returns 400 for a body labelled JSON that does not parse', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-flow')
      .set('Content-Type', 'application/json')
      .set(HEADER, SECRET)
      .send('{"event":');
    expect(res.status).toBe(400);
  });

  it('returns 500 when ZOHO_FLOW_WEBHOOK_SECRET is not set', async () => {
    delete process.env.ZOHO_FLOW_WEBHOOK_SECRET;
    const res = await request(app).post('/webhooks/zoho-flow').set(HEADER, SECRET).send(formBody);
    expect(res.status).toBe(500);
  });
});
