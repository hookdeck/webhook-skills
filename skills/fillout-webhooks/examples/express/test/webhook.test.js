const request = require('supertest');

// Fillout issues no signing secret and signs nothing. The token is a random value
// you generate (openssl rand -hex 32) and configure in Fillout as the header
// value "Bearer <token>". Tests send that header instead of a signature.
const TOKEN = 'f3a1c9e7b5d2804611223344556677889900aabbccddeeff0011223344556677';
process.env.FILLOUT_WEBHOOK_TOKEN = TOKEN;

const { app, verifyFilloutAuth, parseFilloutPayload, answersById, processed } = require('../src/index');

const AUTH = `Bearer ${TOKEN}`;

// Submission object with the field names from Fillout's submission schema
const SUBMISSION = {
  submissionId: '6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c',
  submissionTime: '2026-10-21T10:15:30.000Z',
  lastUpdatedAt: '2026-10-21T10:15:30.000Z',
  questions: [
    { id: 'nameQ', name: "What's your name?", type: 'ShortAnswer', value: 'Ada Lovelace' },
    { id: 'emailQ', name: "What's your email?", type: 'EmailInput', value: 'ada@example.com' },
  ],
  calculations: [{ id: 'total', name: 'Total', type: 'number', value: '42' }],
  urlParameters: [{ id: 'utm_source', name: 'utm_source', value: 'newsletter' }],
  scheduling: [
    {
      id: 'sched1',
      name: 'Book a call',
      value: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        timezone: 'Europe/London',
        eventStartTime: '2026-10-22T09:00:00.000Z',
        eventEndTime: '2026-10-22T09:30:00.000Z',
      },
    },
  ],
  quiz: { score: 3, maxScore: 5 },
};

// Advanced mode: only the keys mapped in Fillout's Body section
const MAPPED = {
  submissionId: '0b8c7e1a-2222-4bcb-9ce9-d3850e38d42c',
  name: 'Grace Hopper',
  email: 'grace@example.com',
};

function post(body, auth = AUTH) {
  const req = request(app).post('/webhooks/fillout').set('Content-Type', 'application/json');
  if (auth !== null) req.set('Authorization', auth);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeEach(() => {
  process.env.FILLOUT_WEBHOOK_TOKEN = TOKEN;
  processed.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyFilloutAuth', () => {
  it('accepts the exact header value', () => {
    expect(verifyFilloutAuth(AUTH, TOKEN)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyFilloutAuth('Bearer wrong', TOKEN)).toBe(false);
  });

  it('compares the whole value, including the Bearer prefix', () => {
    expect(verifyFilloutAuth(TOKEN, TOKEN)).toBe(false);
    expect(verifyFilloutAuth(`bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(verifyFilloutAuth(`Bearer ${TOKEN} `, TOKEN)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyFilloutAuth(undefined, TOKEN)).toBe(false);
  });

  it('fails closed when no token is configured', () => {
    expect(verifyFilloutAuth('Bearer ', '')).toBe(false);
    expect(verifyFilloutAuth('Bearer undefined', undefined)).toBe(false);
  });
});

describe('parseFilloutPayload', () => {
  it('recognises a full submission', () => {
    expect(parseFilloutPayload(SUBMISSION)).toEqual({ kind: 'submission', submission: SUBMISSION });
  });

  it('unwraps { submission: {...} }', () => {
    expect(parseFilloutPayload({ submission: SUBMISSION })).toEqual({
      kind: 'submission',
      submission: SUBMISSION,
    });
  });

  it('treats a body without questions as an Advanced mode mapped body', () => {
    expect(parseFilloutPayload(MAPPED)).toEqual({ kind: 'mapped', fields: MAPPED });
  });

  it('maps answers by question id', () => {
    expect(answersById(SUBMISSION.questions)).toEqual({
      nameQ: 'Ada Lovelace',
      emailQ: 'ada@example.com',
    });
  });
});

describe('POST /webhooks/fillout', () => {
  it('returns 200 for an authenticated full submission', async () => {
    const res = await post(SUBMISSION);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(SUBMISSION.submissionId),
      expect.objectContaining({ emailQ: 'ada@example.com' })
    );
  });

  it('returns 200 for an authenticated mapped body', async () => {
    const res = await post(MAPPED);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 200 for a submission wrapped in { submission }', async () => {
    const res = await post({ submission: SUBMISSION });
    expect(res.status).toBe(200);
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await post(SUBMISSION, null);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    const res = await post(SUBMISSION, 'Bearer not-the-token');
    expect(res.status).toBe(401);
  });

  it('returns 401 for the bare token without the Bearer prefix', async () => {
    const res = await post(SUBMISSION, TOKEN);
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing, so bad JSON without auth is 401', async () => {
    const res = await post('{not json', null);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    const res = await post('[1,2,3]');
    expect(res.status).toBe(400);
  });

  it('returns 500 when FILLOUT_WEBHOOK_TOKEN is not set', async () => {
    delete process.env.FILLOUT_WEBHOOK_TOKEN;
    const res = await post(SUBMISSION);
    expect(res.status).toBe(500);
  });

  it('acknowledges a repeated submissionId as a duplicate', async () => {
    expect((await post(SUBMISSION)).body).toEqual({ received: true });
    const res = await post(SUBMISSION);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
  });

  it('processes an edited submission (new lastUpdatedAt) again', async () => {
    await post(SUBMISSION);
    const res = await post({ ...SUBMISSION, lastUpdatedAt: '2026-10-21T11:00:00.000Z' });
    expect(res.body).toEqual({ received: true });
  });
});
