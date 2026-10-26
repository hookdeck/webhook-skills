process.env.TIDIO_WEBHOOK_SECRET = 'test_tidio_webhook_secret';

const crypto = require('crypto');
const request = require('supertest');
const { app } = require('../src/index');

const secret = process.env.TIDIO_WEBHOOK_SECRET;

/** hex HMAC-SHA256 of `<body>_<t>`, exactly as Tidio documents. */
function sign(body, timestamp, key = secret) {
  return crypto.createHmac('sha256', key).update(`${body}_${timestamp}`).digest('hex');
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

let counter = 0;
function envelope(topic, content, webhookId) {
  return JSON.stringify({
    created_at: nowSeconds(),
    project_public_key: 'm8ixolegtgfvo6ckzvmuempdq0obbqsy',
    topic,
    version: 1,
    webhook_id: webhookId || `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    content,
  });
}

function post(body, header, contentType = 'application/json') {
  const req = request(app).post('/webhooks/tidio').set('Content-Type', contentType);
  if (header !== undefined) req.set('x-tidio-signature', header);
  return req.send(body);
}

describe('Tidio webhook', () => {
  afterEach(() => {
    delete process.env.TIDIO_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid signature', async () => {
    const body = envelope('contact.created', { id: 'c1', email: 'a@example.com' });
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    ['contact.updated', { id: 'c1' }],
    ['conversation.solved_by_operator', { contact_id: 'c1', solved_at: '2023-01-01T00:00:00+00:00' }],
    ['conversation.solved_by_lyro', { contact_id: 'c1', reason: 'handoff' }],
    ['ticket.created', { id: 10000, subject: 'A delivery problem', status: 'open' }],
    ['ticket.status_updated', { id: 10000, status: 'solved' }],
    ['customer_satisfaction.rated', { type: 'operator', score: 5 }],
    ['ticket.holder_changed', { ticket_id: 10000, new_holder: 'ai_assistant' }],
  ])('handles %s', async (topic, content) => {
    const body = envelope(topic, content);
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t)}`);
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several s values matches', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const other = sign(body, t, 'previous_secret');
    const res = await post(body, `t=${t},s=${other},s=${sign(body, t)}`);
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t)}`, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('verifies non-ASCII and oddly formatted bodies byte for byte', async () => {
    const body = '{ "topic" : "contact.created",\n "webhook_id":"w-odd", "content": {"first_name":"Zoë ☕"} }';
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t)}`);
    expect(res.status).toBe(200);
  });

  it('rejects a body modified after signing', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const res = await post(body.replace('c1', 'c2'), `t=${t},s=${sign(body, t)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t, 'wrong_secret')}`);
    expect(res.status).toBe(401);
  });

  it('rejects when t does not match the signed timestamp', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const res = await post(body, `t=${t + 1},s=${sign(body, t)}`);
    expect(res.status).toBe(401);
  });

  it('rejects the signed content in the wrong order (timestamp first)', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const wrong = crypto.createHmac('sha256', secret).update(`${t}_${body}`).digest('hex');
    const res = await post(body, `t=${t},s=${wrong}`);
    expect(res.status).toBe(401);
  });

  it.each([
    ['missing header', undefined],
    ['empty header', ''],
    ['missing t', `s=${'a'.repeat(64)}`],
    ['missing s', 't=1680652800'],
    ['empty t', `t=,s=${'a'.repeat(64)}`],
    ['short signature', 't=1680652800,s=abcd'],
    ['non-hex signature', `t=1680652800,s=${'z'.repeat(64)}`],
    ['long signature', `t=1680652800,s=${'a'.repeat(65)}`],
  ])('returns 401 for %s', async (_name, header) => {
    const res = await post(envelope('contact.created', { id: 'c1' }), header);
    expect(res.status).toBe(401);
  });

  it('compares hex case-insensitively', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t).toUpperCase()}`);
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const t = nowSeconds();
    const res = await post(body, `t=${t},s=${sign(body, t)}`, 'text/plain');
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = envelope('contact.created', { id: 'c1' });
    const t = 1680652800;
    const res = await post(body, `t=${t},s=${sign(body, t)}`);
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when the opt-in tolerance is set', async () => {
    process.env.TIDIO_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = envelope('contact.created', { id: 'c1' });
    const old = nowSeconds() - 3600;
    const stale = await post(body, `t=${old},s=${sign(body, old)}`);
    expect(stale.status).toBe(401);
    const fresh = nowSeconds();
    const ok = await post(body, `t=${fresh},s=${sign(body, fresh)}`);
    expect(ok.status).toBe(200);
  });

  it('dedupes on webhook_id', async () => {
    const body = envelope('contact.created', { id: 'c1' }, 'dup-1');
    const t = nowSeconds();
    const header = `t=${t},s=${sign(body, t)}`;
    const first = await post(body, header);
    const second = await post(body, header);
    expect(first.body).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});
