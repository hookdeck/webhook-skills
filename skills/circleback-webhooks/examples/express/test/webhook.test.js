const request = require('supertest');
const crypto = require('crypto');

const SIGNING_SECRET = 'test_circleback_signing_secret';
process.env.CIRCLEBACK_SIGNING_SECRET = SIGNING_SECRET;

const { app } = require('../src/index');

// Sign exactly as Circleback does: hex(HMAC-SHA256(secret, raw body))
function sign(body, secret = SIGNING_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const meeting = {
  id: 'WRweb12iCBimU6Vo8cD7z',
  name: 'Event Venue Review',
  createdAt: '2023-07-25T20:30:57.926Z',
  duration: 1306.09,
  url: 'https://meet.google.com/abc-defgh-xyz',
  recordingUrl: null,
  tags: ['Events'],
  icalUid: '1a2b3c@google.com',
  attendees: [{ name: 'John Appleseed', email: 'john@example.com' }],
  notes: '#### Overview\n*   Several options for event venues were reviewed...',
  actionItems: [
    {
      id: 252,
      title: 'Contact event venues',
      description: 'Reach out to potential venues.',
      assignee: { name: 'John Appleseed', email: 'john@example.com' },
      status: 'PENDING',
    },
    { id: 253, title: 'Review venue options', description: 'Pick a venue.', assignee: null, status: 'PENDING' },
  ],
  transcript: [{ speaker: 'John Appleseed', text: "Hey, how's it going?", timestamp: 4.56 }],
  insights: { Questions: [{ insight: 'Is this thing on?', speaker: 'Samantha Grey', timestamp: 49.15 }] },
};
const body = JSON.stringify(meeting);

function post(payload, headers = {}) {
  return request(app).post('/webhooks/circleback').set(headers).send(payload);
}

describe('Circleback webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid signature', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Event Venue Review'));
  });

  it('accepts uppercase hex', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await post(body, { 'content-type': 'text/plain', 'x-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong signature', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': sign(body, 'other_secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(body.replace('Event Venue Review', 'Tampered'), {
      'content-type': 'application/json',
      'x-signature': sign(body),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': sign(body).slice(0, 32) });
    expect(res.status).toBe(401);
  });

  it('rejects 64 characters that are not all hex', async () => {
    const bad = 'g' + sign(body).slice(1);
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': bad });
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature followed by junk', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': sign(body) + 'zz' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const bad = '{not json';
    const res = await post(bad, { 'content-type': 'application/json', 'x-signature': sign(bad) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the signing secret is not configured', async () => {
    delete process.env.CIRCLEBACK_SIGNING_SECRET;
    const res = await post(body, { 'content-type': 'application/json', 'x-signature': sign(body) });
    process.env.CIRCLEBACK_SIGNING_SECRET = SIGNING_SECRET;
    expect(res.status).toBe(500);
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
