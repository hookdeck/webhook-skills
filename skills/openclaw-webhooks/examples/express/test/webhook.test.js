const request = require('supertest');

// cron.webhookToken from the Gateway config; OpenClaw sends it as "Bearer <token>"
const WEBHOOK_TOKEN = 'test-openclaw-webhook-token';
process.env.OPENCLAW_WEBHOOK_TOKEN = WEBHOOK_TOKEN;

const { app, verifyOpenClawWebhook } = require('../src/index');

// Finished event, as OpenClaw POSTs it after an automation run
const finishedOk = JSON.stringify({
  jobId: 'job_123',
  action: 'finished',
  runId: 'run_abc',
  runAtMs: 1767268800000,
  durationMs: 4200,
  status: 'ok',
  completionStatus: 'succeeded',
  summary: 'Three deploys today, all green.',
  job: { id: 'job_123', name: 'Deploy digest' },
  nextRunAtMs: 1767355200000,
});

// Error events omit the summary
const finishedError = JSON.stringify({
  jobId: 'job_123',
  action: 'finished',
  runId: 'run_def',
  runAtMs: 1767268800000,
  status: 'error',
  completionStatus: 'failed',
  error: 'Provider request timed out',
  job: { id: 'job_123', name: 'Deploy digest' },
});

// Failure alert sent to delivery.failureDestination in webhook mode
const failureAlert = JSON.stringify({
  jobId: 'job_123',
  jobName: 'Deploy digest',
  message: 'Automation "Deploy digest" failed 2 times in a row.',
  runAtMs: 1767268800000,
});

function post(body, authorization) {
  const r = request(app).post('/webhooks/openclaw').set('Content-Type', 'application/json');
  if (authorization !== undefined) r.set('Authorization', authorization);
  return r.send(body);
}

describe('verifyOpenClawWebhook', () => {
  it('accepts the exact Bearer value', () => {
    expect(verifyOpenClawWebhook(`Bearer ${WEBHOOK_TOKEN}`, WEBHOOK_TOKEN)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyOpenClawWebhook('Bearer wrong-token', WEBHOOK_TOKEN)).toBe(false);
  });

  it('rejects the bare token without the Bearer prefix', () => {
    expect(verifyOpenClawWebhook(WEBHOOK_TOKEN, WEBHOOK_TOKEN)).toBe(false);
  });

  it('compares the whole value (scheme case and extra spaces matter)', () => {
    expect(verifyOpenClawWebhook(`bearer ${WEBHOOK_TOKEN}`, WEBHOOK_TOKEN)).toBe(false);
    expect(verifyOpenClawWebhook(`Bearer  ${WEBHOOK_TOKEN}`, WEBHOOK_TOKEN)).toBe(false);
  });

  it('rejects a missing header or token', () => {
    expect(verifyOpenClawWebhook(undefined, WEBHOOK_TOKEN)).toBe(false);
    expect(verifyOpenClawWebhook(`Bearer ${WEBHOOK_TOKEN}`, '')).toBe(false);
  });
});

describe('POST /webhooks/openclaw', () => {
  let logSpy;
  let errorSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.env.OPENCLAW_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  });

  it('accepts a successful finished event', async () => {
    const res = await post(finishedOk, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, kind: 'finished' });
  });

  it('accepts a failed finished event', async () => {
    const res = await post(finishedError, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('finished');
  });

  it('accepts a failure alert', async () => {
    const res = await post(failureAlert, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('failure_alert');
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/openclaw')
      .set('Content-Type', 'text/plain')
      .set('Authorization', `Bearer ${WEBHOOK_TOKEN}`)
      .send(finishedOk);
    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    const res = await post(finishedOk, 'Bearer wrong-token');
    expect(res.status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    const res = await post(finishedOk);
    expect(res.status).toBe(401);
  });

  it('rejects the token sent without the Bearer prefix', async () => {
    const res = await post(finishedOk, WEBHOOK_TOKEN);
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON after a valid token', async () => {
    const res = await post('not json', `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('returns 500 when the token is not configured', async () => {
    delete process.env.OPENCLAW_WEBHOOK_TOKEN;
    const res = await post(finishedOk, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(500);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
