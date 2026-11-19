// Generated with: zoho-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

// Test-only values. In Zoho these are the Custom Parameter's name and value.
const HEADER = 'X-Webhook-Secret';
const SECRET = 'zcrm-test-secret-6f1c2a9d4b7e';

process.env.ZOHO_CRM_WEBHOOK_HEADER = HEADER;
process.env.ZOHO_CRM_WEBHOOK_SECRET = SECRET;

const { app, verifyZohoCrmRequest, parseBody } = require('../src/index');

// Illustrative raw JSON template with merge fields already substituted.
const leadBody = JSON.stringify({
  module: 'Leads',
  id: '5725767000000412001',
  last_name: 'Lovelace',
  email: 'ada@example.com',
});

beforeEach(() => {
  process.env.ZOHO_CRM_WEBHOOK_HEADER = HEADER;
  process.env.ZOHO_CRM_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('verifyZohoCrmRequest', () => {
  it('accepts the exact value', () => {
    expect(verifyZohoCrmRequest({ 'x-webhook-secret': SECRET }, HEADER, SECRET)).toBe(true);
  });

  it('rejects a different value, a missing header and an unset secret', () => {
    expect(verifyZohoCrmRequest({ 'x-webhook-secret': 'nope' }, HEADER, SECRET)).toBe(false);
    expect(verifyZohoCrmRequest({}, HEADER, SECRET)).toBe(false);
    expect(verifyZohoCrmRequest({ 'x-webhook-secret': SECRET }, HEADER, '')).toBe(false);
  });

  it('handles non-ASCII values without throwing', () => {
    expect(verifyZohoCrmRequest({ 'x-webhook-secret': 'clé-secrète' }, HEADER, 'clé-secrète')).toBe(true);
    expect(verifyZohoCrmRequest({ 'x-webhook-secret': 'clé' }, HEADER, 'clé-secrète')).toBe(false);
  });
});

describe('parseBody', () => {
  it('parses JSON, form-encoded and text bodies', () => {
    expect(parseBody(leadBody, 'application/json').format).toBe('json');
    expect(parseBody('module=Deals&id=1', 'application/x-www-form-urlencoded')).toEqual({
      format: 'form',
      data: { module: 'Deals', id: '1' },
    });
    expect(parseBody('<lead id="1"/>', 'application/xml').format).toBe('text');
    expect(parseBody('', 'text/plain').format).toBe('empty');
    expect(parseBody('{bad', 'application/json')).toBeNull();
  });
});

describe('POST /webhooks/zoho-crm', () => {
  it('accepts a POST with the right header and a raw JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-crm')
      .set('Content-Type', 'application/json')
      .set(HEADER, SECRET)
      .send(leadBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Lead 5725767000000412001 changed'));
  });

  it('accepts a PUT (CRM sends headers on POST and PUT)', async () => {
    const res = await request(app)
      .put('/webhooks/zoho-crm')
      .set('Content-Type', 'application/json')
      .set(HEADER, SECRET)
      .send(leadBody);
    expect(res.status).toBe(200);
  });

  it('accepts form-data parameters sent form-encoded', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-crm')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set(HEADER, SECRET)
      .send('module=Deals&id=5725767000000412077&stage=Closed+Won');
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('stage: Closed Won'));
  });

  it('accepts a raw XML or text body', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-crm')
      .set('Content-Type', 'application/xml')
      .set(HEADER, SECRET)
      .send('<lead><id>5725767000000412001</id></lead>');
    expect(res.status).toBe(200);
  });

  it('looks the header up case-insensitively', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-crm')
      .set('Content-Type', 'application/json')
      .set('x-webhook-secret', SECRET)
      .send(leadBody);
    expect(res.status).toBe(200);
  });

  it('uses the header name from ZOHO_CRM_WEBHOOK_HEADER', async () => {
    process.env.ZOHO_CRM_WEBHOOK_HEADER = 'X-Zoho-Token';
    const ok = await request(app).post('/webhooks/zoho-crm').set('X-Zoho-Token', SECRET).send(leadBody);
    const wrongHeader = await request(app).post('/webhooks/zoho-crm').set(HEADER, SECRET).send(leadBody);
    expect(ok.status).toBe(200);
    expect(wrongHeader.status).toBe(401);
  });

  it('rejects a missing header with 401', async () => {
    const res = await request(app).post('/webhooks/zoho-crm').set('Content-Type', 'application/json').send(leadBody);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value with 401', async () => {
    const res = await request(app).post('/webhooks/zoho-crm').set(HEADER, 'wrong-secret').send(leadBody);
    expect(res.status).toBe(401);
  });

  it('compares the whole value (no prefix stripping)', async () => {
    const res = await request(app).post('/webhooks/zoho-crm').set(HEADER, `Bearer ${SECRET}`).send(leadBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a body labelled JSON that does not parse', async () => {
    const res = await request(app)
      .post('/webhooks/zoho-crm')
      .set('Content-Type', 'application/json')
      .set(HEADER, SECRET)
      .send('{"module": "Leads",');
    expect(res.status).toBe(400);
  });

  it('does not route GET (GET webhooks cannot carry the header)', async () => {
    const res = await request(app).get('/webhooks/zoho-crm').set(HEADER, SECRET);
    expect(res.status).toBe(404);
  });

  it('returns 500 when ZOHO_CRM_WEBHOOK_SECRET is not set', async () => {
    delete process.env.ZOHO_CRM_WEBHOOK_SECRET;
    const res = await request(app).post('/webhooks/zoho-crm').set(HEADER, SECRET).send(leadBody);
    expect(res.status).toBe(500);
  });
});
