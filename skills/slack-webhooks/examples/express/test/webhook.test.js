const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SLACK_SIGNING_SECRET = 'test_slack_signing_secret';

const { app, verifySlackRequest } = require('../src/index');

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

/**
 * Generate a valid Slack signature for testing.
 * Matches Slack's algorithm: HMAC-SHA256("v0:{ts}:{body}", secret) hex-encoded.
 */
function generateSlackSignature(body, timestamp, secret) {
  const basestring = `v0:${timestamp}:${body}`;
  const hex = crypto.createHmac('sha256', secret).update(basestring, 'utf8').digest('hex');
  return `v0=${hex}`;
}

function currentTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

describe('verifySlackRequest', () => {
  it('returns true for a valid signature', () => {
    const body = '{"type":"event_callback"}';
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    expect(verifySlackRequest(body, sig, ts, SIGNING_SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = '{"type":"event_callback"}';
    const ts = currentTimestamp();

    expect(verifySlackRequest(body, 'v0=deadbeef', ts, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the signature header is missing', () => {
    const ts = currentTimestamp();
    expect(verifySlackRequest('{}', null, ts, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the timestamp header is missing', () => {
    const body = '{}';
    const sig = generateSlackSignature(body, currentTimestamp(), SIGNING_SECRET);
    expect(verifySlackRequest(body, sig, null, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when timestamp is more than 5 minutes old (replay protection)', () => {
    const body = '{}';
    const staleTs = (Math.floor(Date.now() / 1000) - 60 * 6).toString();
    const sig = generateSlackSignature(body, staleTs, SIGNING_SECRET);

    expect(verifySlackRequest(body, sig, staleTs, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const original = '{"event":{"type":"app_mention"}}';
    const tampered = '{"event":{"type":"team_join"}}';
    const ts = currentTimestamp();
    const sig = generateSlackSignature(original, ts, SIGNING_SECRET);

    expect(verifySlackRequest(tampered, sig, ts, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the signing secret is wrong', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    expect(verifySlackRequest(body, sig, ts, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/slack', () => {
  it('returns 401 when signature header is missing', async () => {
    const body = JSON.stringify({ type: 'event_callback' });

    const res = await request(app)
      .post('/webhooks/slack')
      .set('Content-Type', 'application/json')
      .set('X-Slack-Request-Timestamp', currentTimestamp())
      .send(body);

    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify({ type: 'event_callback' });
    const ts = currentTimestamp();

    const res = await request(app)
      .post('/webhooks/slack')
      .set('Content-Type', 'application/json')
      .set('X-Slack-Signature', 'v0=invalid')
      .set('X-Slack-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(401);
  });

  it('echoes the challenge for url_verification requests', async () => {
    const body = JSON.stringify({
      type: 'url_verification',
      token: 'verification_token',
      challenge: 'abc123challengevalue'
    });
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/slack')
      .set('Content-Type', 'application/json')
      .set('X-Slack-Signature', sig)
      .set('X-Slack-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ challenge: 'abc123challengevalue' });
  });

  it('returns 200 for a valid app_mention event', async () => {
    const body = JSON.stringify({
      type: 'event_callback',
      team_id: 'T0001',
      api_app_id: 'A0001',
      event_id: 'Ev0001',
      event_time: 1731000000,
      event: {
        type: 'app_mention',
        user: 'U123',
        text: '<@U7LFEMQ6F> hello!',
        channel: 'C123',
        ts: '1731000000.000100'
      }
    });
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/slack')
      .set('Content-Type', 'application/json')
      .set('X-Slack-Signature', sig)
      .set('X-Slack-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 200 for a reaction_added event', async () => {
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev0002',
      event: { type: 'reaction_added', user: 'U123', reaction: 'thumbsup' }
    });
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/slack')
      .set('Content-Type', 'application/json')
      .set('X-Slack-Signature', sig)
      .set('X-Slack-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(200);
  });

  it('returns 200 for a team_join event', async () => {
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev0003',
      event: { type: 'team_join', user: { id: 'U999' } }
    });
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/slack')
      .set('Content-Type', 'application/json')
      .set('X-Slack-Signature', sig)
      .set('X-Slack-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
