const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_hackerone_secret';
process.env.HACKERONE_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyHackerOne } = require('../src/index');

// Shape taken from the HackerOne docs' example delivery (trimmed)
const reportCreated = {
  data: {
    activity: {
      type: 'activity-bug-filed',
      id: '1337',
      attributes: { message: '', created_at: '2020-02-25T08:05:21.674Z', internal: false },
    },
    report: {
      id: '548',
      type: 'report',
      attributes: { title: 'Critical vulnerability!', state: 'new', created_at: '2020-02-25T08:05:21.405Z' },
    },
  },
};

// Real HackerOne algorithm: hex HMAC-SHA256 of the raw body, prefixed "sha256="
function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, { event = 'report_created', signature, contentType = 'application/json' } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const req = request(app).post('/webhooks/hackerone').set('Content-Type', contentType);
  if (event !== null) req.set('X-H1-Event', event);
  req.set('X-H1-Delivery', '2f7c1c1e-6a25-4e31-9d8c-1d0f4b8a0c11');
  const sig = signature === undefined ? sign(payload) : signature;
  if (sig !== null) req.set('X-H1-Signature', sig);
  return req.send(payload);
}

beforeEach(() => {
  process.env.HACKERONE_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('signature verification', () => {
  it('accepts a valid sha256= signature', async () => {
    const res = await post(reportCreated);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the bare digest without the prefix', async () => {
    const payload = JSON.stringify(reportCreated);
    const res = await post(payload, { signature: sign(payload).slice('sha256='.length) });
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const payload = JSON.stringify(reportCreated);
    const res = await post(payload, { signature: 'sha256=' + sign(payload).slice(7).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the exact raw bytes, not a re-serialised body', async () => {
    const payload = '{ "data" :   {"report": {"id": "7", "attributes": {"title": "x"}}} }\n';
    const res = await post(payload);
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const payload = JSON.stringify(reportCreated);
    const res = await post(payload, { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const payload = JSON.stringify(reportCreated);
    const res = await post(payload, { signature: sign(payload, 'wrong_secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const original = JSON.stringify(reportCreated);
    const tampered = original.replace('Critical', 'Trivial');
    const res = await post(tampered, { signature: sign(original) });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(reportCreated, { signature: null });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const res = await post(reportCreated, { signature: '' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'sha256=abcd'],
    ['non-hex characters', 'sha256=' + 'zz'.repeat(32)],
    ['extra characters', sign('{}') + 'ab'],
    ['wrong prefix', 'sha1=' + sign('{}').slice(7)],
    ['prefix only', 'sha256='],
  ])('rejects a malformed signature (%s)', async (_name, signature) => {
    const res = await post(reportCreated, { signature });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the empty key HackerOne uses when no secret is set', async () => {
    const payload = JSON.stringify(reportCreated);
    const res = await post(payload, { signature: sign(payload, '') });
    expect(res.status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.HACKERONE_WEBHOOK_SECRET;
    const payload = JSON.stringify(reportCreated);
    const res = await post(payload, { signature: sign(payload, '') });
    expect(res.status).toBe(500);
  });

  it('verifyHackerOne never accepts an empty secret', () => {
    const body = Buffer.from('{}');
    expect(verifyHackerOne(body, sign('{}', ''), '')).toBe(false);
    expect(verifyHackerOne(body, sign('{}'), SECRET)).toBe(true);
  });
});

describe('event handling', () => {
  it.each([
    'report_created',
    'report_new',
    'report_triaged',
    'report_bounty_awarded',
    'report_comment_created',
    'report_resolved',
    'report_closed_as_duplicate',
    'report_closed_as_informative',
    'report_closed_as_spam',
    'report_closed_as_not_applicable',
  ])('handles %s', async (event) => {
    const res = await post(reportCreated, { event });
    expect(res.status).toBe(200);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('logs and accepts other documented events', async () => {
    const res = await post(reportCreated, { event: 'program_hacker_joined' });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled HackerOne event: program_hacker_joined');
  });

  it('returns 400 when X-H1-Event is missing', async () => {
    const res = await post(reportCreated, { event: null });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON (with a valid signature)', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it.each([['array', '[1,2]'], ['string', '"hi"'], ['null', 'null']])(
    'returns 400 when the body is a JSON %s',
    async (_name, payload) => {
      const res = await post(payload);
      expect(res.status).toBe(400);
    }
  );

  it.each([
    ['data is a string', { data: 'x' }],
    ['report is an array', { data: { report: [] } }],
    ['attributes is a number', { data: { report: { id: '1', attributes: 5 } } }],
    ['id is a number', { data: { report: { id: 5, attributes: { title: 7 } } } }],
    ['data is null', { data: null }],
  ])('ignores wrong-typed fields (%s) instead of failing', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(200);
  });
});
