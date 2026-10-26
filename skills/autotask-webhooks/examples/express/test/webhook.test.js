const request = require('supertest');
const crypto = require('crypto');

process.env.AUTOTASK_WEBHOOK_SECRET = 'ahywqn676nwh8';

const { app, verifyAutotaskWebhook } = require('../src/index');

// Generate a real Autotask signature: sha1=base64(HMAC_SHA1(secret, body))
function sign(payload, secret) {
  return 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('base64');
}

const secret = process.env.AUTOTASK_WEBHOOK_SECRET;

const ticketCreate = JSON.stringify({
  Action: 'Create',
  Guid: '8f1c1d5e-2f4b-4b1e-9d0e-3a0f1d2c3b4a',
  EntityType: 'Ticket',
  Id: 12345,
  Fields: { Title: 'Printer offline' },
  EventTime: '2026-10-22T10:00:00Z',
  SequenceNumber: 7,
  PersonID: 29682894,
});

describe('verifyAutotaskWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate), sign(ticketCreate, secret), secret)).toBe(true);
  });

  it('matches the documented example format', () => {
    // sha1=<28 base64 chars ending in "=">
    expect(sign('x', secret)).toMatch(/^sha1=[A-Za-z0-9+/]{27}=$/);
  });

  it('rejects a wrong secret', () => {
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate), sign(ticketCreate, 'other'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate + ' '), sign(ticketCreate, secret), secret)).toBe(false);
  });

  it('rejects a missing sha1= prefix', () => {
    const bare = sign(ticketCreate, secret).slice(5);
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate), bare, secret)).toBe(false);
  });

  it('rejects a signature with the padding stripped', () => {
    const noPad = sign(ticketCreate, secret).replace(/=+$/, '');
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate), noPad, secret)).toBe(false);
  });

  it('rejects non-ASCII and wrong-length headers without throwing', () => {
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate), 'sha1=héllo✓', secret)).toBe(false);
    expect(verifyAutotaskWebhook(Buffer.from(ticketCreate), 'sha1=', secret)).toBe(false);
  });
});

describe('POST /webhooks/autotask', () => {
  const post = (body, headers = {}, type = 'application/json') =>
    request(app).post('/webhooks/autotask').set('Content-Type', type).set(headers).send(body);

  it('accepts a signed Ticket Create', async () => {
    const res = await post(ticketCreate, { 'X-Hook-Signature': sign(ticketCreate, secret) });
    expect(res.status).toBe(200);
  });

  it.each([
    ['Company', 'Update'],
    ['Contact', 'Delete'],
    ['TicketNote', 'Create'],
    ['Company', 'Deactivated'],
    ['ConfigurationItem', 'Create'],
  ])('accepts a signed %s %s', async (EntityType, Action) => {
    const body = JSON.stringify({ Action, EntityType, Id: 1, Fields: {} });
    const res = await post(body, { 'X-Hook-Signature': sign(body, secret) });
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await post(ticketCreate, { 'X-Hook-Signature': sign(ticketCreate, secret) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    expect((await post(ticketCreate)).status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    expect((await post(ticketCreate, { 'X-Hook-Signature': 'sha1=AAAAAAAAAAAAAAAAAAAAAAAAAAA=' })).status).toBe(401);
  });

  it('returns 401 (not 500) for a non-ASCII signature header', async () => {
    const res = await post(ticketCreate, { 'X-Hook-Signature': Buffer.from('sha1=café', 'latin1').toString('latin1') });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await post('not json', { 'X-Hook-Signature': sign('not json', secret) });
    expect(res.status).toBe(400);
  });
});
