const request = require('supertest');
const crypto = require('crypto');

// Fathom secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_fathom_webhook_secret_key').toString('base64');
process.env.FATHOM_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { app } = require('../src/index');

/**
 * Sign a payload exactly as Fathom does (Standard Webhooks):
 * base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
 */
function sign(body, { id, timestamp, secret = WEBHOOK_SECRET }) {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${signature}`;
}

function headersFor(body, overrides = {}) {
  const id = overrides.id || 'msg_2x2zwLOcWaRTzsLK8KtbQt1FTk9';
  const timestamp = overrides.timestamp || Math.floor(Date.now() / 1000);
  return {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': overrides.signature || sign(body, { id, timestamp, secret: overrides.secret }),
  };
}

const meeting = {
  title: 'Quarterly Business Review',
  meeting_title: 'QBR 2025 Q1',
  recording_id: 123456789,
  url: 'https://fathom.video/xyz123',
  share_url: 'https://fathom.video/share/xyz123',
  created_at: '2025-03-01T17:01:30Z',
  transcript_language: 'en',
  shared_with: 'single_team',
  calendar_invitees_domains_type: 'one_or_more_external',
  recorded_by: { name: 'Alice Johnson', email: 'alice.johnson@acme.com', email_domain: 'acme.com', team: 'Marketing' },
  calendar_invitees: [],
  default_summary: { template_name: 'general', markdown_formatted: '## Summary\nWe reviewed Q1 OKRs.' },
  action_items: [{
    description: 'Email revised proposal to client',
    user_generated: false,
    completed: false,
    recording_timestamp: '00:10:45',
    recording_playback_url: 'https://fathom.video/calls/xyz123?timestamp=645',
    assignee: { name: 'Alice Johnson', email: 'alice.johnson@acme.com', team: 'Marketing' },
  }],
  transcript: [{ speaker: { display_name: 'Alice Johnson' }, text: "Let's revisit the budget allocations.", timestamp: '00:05:32' }],
};

describe('POST /webhooks/fathom', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.FATHOM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => jest.restoreAllMocks());

  it('accepts a correctly signed meeting payload', async () => {
    const body = JSON.stringify(meeting);
    const res = await request(app).post('/webhooks/fathom').set(headersFor(body)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a payload without optional summary, transcript or action items', async () => {
    const { default_summary, action_items, transcript, ...minimal } = meeting;
    const body = JSON.stringify(minimal);
    const res = await request(app).post('/webhooks/fathom').set(headersFor(body)).send(body);
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(meeting);
    const headers = headersFor(body);
    headers['webhook-signature'] = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${headers['webhook-signature']}`;
    const res = await request(app).post('/webhooks/fathom').set(headers).send(body);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(meeting);
    const headers = headersFor(body, { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' });
    const res = await request(app).post('/webhooks/fathom').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const body = JSON.stringify(meeting);
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await request(app).post('/webhooks/fathom').set(headersFor(body, { secret: other })).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(meeting);
    const headers = headersFor(body);
    const tampered = JSON.stringify({ ...meeting, title: 'Tampered' });
    const res = await request(app).post('/webhooks/fathom').set(headers).send(tampered);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = JSON.stringify(meeting);
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await request(app).post('/webhooks/fathom').set(headersFor(body, { timestamp })).send(body);
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s', async (header) => {
    const body = JSON.stringify(meeting);
    const headers = headersFor(body);
    delete headers[header];
    const res = await request(app).post('/webhooks/fathom').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.FATHOM_WEBHOOK_SECRET;
    const body = JSON.stringify(meeting);
    const res = await request(app).post('/webhooks/fathom').set(headersFor(body)).send(body);
    expect(res.status).toBe(500);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
