// Generated with: folk-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// folk secrets follow Standard Webhooks: "whsec_" + base64(key bytes), for
// example "whsec_QWFSUzl1QUVoQW1kdWtpTnJRTUFpbXNlZmxLTg==". The HMAC key is the
// decoded part.
const SECRET = 'whsec_' + Buffer.from('folk-test-signing-key-0123456789').toString('base64');

process.env.FOLK_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Standard Webhooks does for folk deliveries. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature, contentType } = {}) {
  const msgId = id || `evt_${crypto.randomUUID()}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': contentType || 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/folk').set(headers).send(rawBody);
}

const SOURCE = 'https://api.folk.app/v1/webhooks/wbk_2f15ec4f-0f70-4884-a43d-1f88ef7a6665';
const event = (type, data, id = `evt_${crypto.randomUUID()}`) => ({
  id,
  type,
  createdAt: '2025-09-30T09:55:52.715Z',
  source: SOURCE,
  data,
});

const personCreated = () =>
  event('person.created', {
    id: 'per_05837e2d-9bf7-4f17-8729-e95f1be4de67',
    url: 'https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67',
  });

beforeEach(() => {
  process.env.FOLK_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts person.created', async () => {
    const body = JSON.stringify(personCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Person created'));
  });

  it('accepts person.updated with changes', async () => {
    const body = JSON.stringify(
      event('person.updated', {
        id: 'per_05837e2d-9bf7-4f17-8729-e95f1be4de67',
        url: 'https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67',
        changes: [{ path: ['firstName'], type: 'set', value: 'John' }],
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1 changes'));
  });

  it('accepts person.deleted with details', async () => {
    const body = JSON.stringify(
      event('person.deleted', {
        id: 'per_05837e2d-9bf7-4f17-8729-e95f1be4de67',
        url: 'https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67',
        details: { name: 'John Doe', emails: ['john@doe.com'] },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('John Doe'));
  });

  it.each([
    'person.groups_updated',
    'person.workspace_interaction_metadata_updated',
    'company.created',
    'company.updated',
    'company.deleted',
    'company.groups_updated',
    'object.created',
    'object.updated',
    'object.deleted',
    'note.created',
    'note.updated',
    'note.deleted',
    'reminder.created',
    'reminder.updated',
    'reminder.deleted',
    'reminder.triggered',
    'person_enrichment.finished',
  ])('accepts %s', async (type) => {
    const body = JSON.stringify(event(type, { id: 'x_1', url: 'https://api.folk.app/v1/x/x_1' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('widget.exploded', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('verifies any content type (raw body is read with express.raw)', async () => {
    const body = JSON.stringify(personCreated());
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(personCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a redelivery with the same webhook-id', async () => {
    const body = JSON.stringify(personCreated());
    const id = `evt_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(personCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(personCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another webhook's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-webhook-secret-0123456789').toString('base64');
    const body = JSON.stringify(personCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(personCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('person.created', 'person.deleted'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(personCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(personCreated());
    const id = 'evt_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when FOLK_WEBHOOK_SECRET is not set', async () => {
    delete process.env.FOLK_WEBHOOK_SECRET;
    const body = JSON.stringify(personCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
