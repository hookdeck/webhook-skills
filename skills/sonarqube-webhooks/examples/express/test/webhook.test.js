const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_sonarqube_secret';
process.env.SONARQUBE_WEBHOOK_SECRET = SECRET;

const { app, verifySonarQubeSignature } = require('../src/index');

/**
 * Sign like SonarQube: bare lowercase hex(HMAC-SHA256(secret, rawBody))
 */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const failedPayload = JSON.stringify({
  taskId: 'AVh21JS2JepAEhwQ-b3u',
  status: 'SUCCESS',
  analysedAt: '2026-10-26T09:30:00+0000',
  project: { key: 'my_project', name: 'My Project' },
  qualityGate: { name: 'Sonar way', status: 'ERROR', conditions: [] },
  properties: {},
});

const passedPayload = JSON.stringify({
  taskId: 'AVh21JS2JepAEhwQ-b3v',
  status: 'SUCCESS',
  analysedAt: '2026-10-26T09:31:00+0000',
  project: { key: 'my_project', name: 'My Project' },
  qualityGate: { name: 'Sonar way', status: 'OK', conditions: [] },
  properties: {},
});

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/sonarqube')
    .set('Content-Type', headers['Content-Type'] || 'application/json')
    .set(headers)
    .send(body);
}

describe('verifySonarQubeSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySonarQubeSignature(Buffer.from(failedPayload), sign(failedPayload), SECRET)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifySonarQubeSignature(Buffer.from(failedPayload), sign(failedPayload).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifySonarQubeSignature(Buffer.from(failedPayload), sign(failedPayload, 'other'), SECRET)).toBe(false);
  });

  it('rejects a modified body', () => {
    expect(verifySonarQubeSignature(Buffer.from(failedPayload + ' '), sign(failedPayload), SECRET)).toBe(false);
  });

  it('rejects non-hex, short, long, prefixed and empty signatures', () => {
    const body = Buffer.from(failedPayload);
    const good = sign(failedPayload);
    expect(verifySonarQubeSignature(body, 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifySonarQubeSignature(body, good.slice(0, 62), SECRET)).toBe(false);
    expect(verifySonarQubeSignature(body, good + '00', SECRET)).toBe(false);
    expect(verifySonarQubeSignature(body, `sha256=${good}`, SECRET)).toBe(false);
    expect(verifySonarQubeSignature(body, '', SECRET)).toBe(false);
    expect(verifySonarQubeSignature(body, undefined, SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifySonarQubeSignature(Buffer.from(failedPayload), sign(failedPayload), '')).toBe(false);
  });
});

describe('POST /webhooks/sonarqube', () => {
  it('accepts a failed quality gate with a valid signature', async () => {
    const res = await post(failedPayload, { 'X-Sonar-Webhook-HMAC-SHA256': sign(failedPayload) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a passed quality gate', async () => {
    const res = await post(passedPayload, { 'X-Sonar-Webhook-HMAC-SHA256': sign(passedPayload) });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const res = await post(failedPayload, {
      'Content-Type': 'text/plain',
      'X-Sonar-Webhook-HMAC-SHA256': sign(failedPayload),
    });
    expect(res.status).toBe(200);
  });

  it('verifies non-canonical JSON bytes exactly as received', async () => {
    const spaced = '{ "taskId" : "t1",  "qualityGate": {"status":"OK"} }';
    const res = await post(spaced, { 'X-Sonar-Webhook-HMAC-SHA256': sign(spaced) });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await post(failedPayload);
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header with 401', async () => {
    const res = await post(failedPayload, { 'X-Sonar-Webhook-HMAC-SHA256': '' });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    const res = await post(failedPayload, { 'X-Sonar-Webhook-HMAC-SHA256': 'not-hex' });
    expect(res.status).toBe(401);
  });

  it('rejects a signature from the wrong secret with 401', async () => {
    const res = await post(failedPayload, { 'X-Sonar-Webhook-HMAC-SHA256': sign(failedPayload, 'other') });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid JSON body with a valid signature', async () => {
    const res = await post('not json', { 'X-Sonar-Webhook-HMAC-SHA256': sign('not json') });
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
