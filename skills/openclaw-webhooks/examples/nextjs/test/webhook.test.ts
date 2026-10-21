import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, verifyOpenClawWebhook } from '../app/webhooks/openclaw/route';

// cron.webhookToken from the Gateway config; OpenClaw sends it as "Bearer <token>"
const WEBHOOK_TOKEN = 'test-openclaw-webhook-token';

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

function post(body: string, authorization?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (authorization !== undefined) headers.authorization = authorization;
  return POST(new Request('http://localhost:3000/webhooks/openclaw', { method: 'POST', headers, body }));
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
    expect(verifyOpenClawWebhook(null, WEBHOOK_TOKEN)).toBe(false);
    expect(verifyOpenClawWebhook(`Bearer ${WEBHOOK_TOKEN}`, '')).toBe(false);
  });
});

describe('POST /webhooks/openclaw', () => {
  beforeEach(() => {
    process.env.OPENCLAW_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a successful finished event', async () => {
    const res = await post(finishedOk, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, kind: 'finished' });
  });

  it('accepts a failed finished event', async () => {
    const res = await post(finishedError, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('finished');
  });

  it('accepts a failure alert', async () => {
    const res = await post(failureAlert, `Bearer ${WEBHOOK_TOKEN}`);
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('failure_alert');
  });

  it('verifies regardless of content type', async () => {
    const res = await post(finishedOk, `Bearer ${WEBHOOK_TOKEN}`, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    expect((await post(finishedOk, 'Bearer wrong-token')).status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(finishedOk)).status).toBe(401);
  });

  it('rejects the token sent without the Bearer prefix', async () => {
    expect((await post(finishedOk, WEBHOOK_TOKEN)).status).toBe(401);
  });

  it('rejects invalid JSON after a valid token', async () => {
    expect((await post('not json', `Bearer ${WEBHOOK_TOKEN}`)).status).toBe(400);
  });

  it('returns 500 when the token is not configured', async () => {
    delete process.env.OPENCLAW_WEBHOOK_TOKEN;
    expect((await post(finishedOk, `Bearer ${WEBHOOK_TOKEN}`)).status).toBe(500);
  });
});
