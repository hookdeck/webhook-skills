import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyDatabricksAuth, POST } from '../app/webhooks/databricks/route';

const USER = 'dbx_user';
const PASS = 'test_pass:with:colons';

beforeEach(() => {
  process.env.DATABRICKS_WEBHOOK_USERNAME = USER;
  process.env.DATABRICKS_WEBHOOK_PASSWORD = PASS;
});

// Databricks sends the destination's username/password as a standard Basic auth header
function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/databricks', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const jobEvent = (event_type: string) => ({
  event_type,
  workspace_id: '1234567890',
  run: { run_id: '42' },
  job: { job_id: '7', name: 'nightly-etl' },
});

const alertEvent = {
  event: 'alert_state_change',
  url_base: 'https://example.cloud.databricks.com/sql?o=1234567890123456',
  alert: {
    title: 'Alert "Daily revenue" changed status to TRIGGERED',
    alert: { id: '9876543210987654', name: 'Daily revenue', evaluations: [{ state: 'TRIGGERED' }] },
  },
};

describe('verifyDatabricksAuth', () => {
  it('accepts valid Basic credentials', () => {
    expect(verifyDatabricksAuth(basicAuth(USER, PASS), USER, PASS)).toBe(true);
  });

  it('rejects wrong credentials', () => {
    expect(verifyDatabricksAuth(basicAuth(USER, 'nope'), USER, PASS)).toBe(false);
    expect(verifyDatabricksAuth(basicAuth('someone', PASS), USER, PASS)).toBe(false);
  });

  it('rejects a missing header or non-Basic scheme', () => {
    expect(verifyDatabricksAuth(null, USER, PASS)).toBe(false);
    expect(verifyDatabricksAuth('Bearer abc', USER, PASS)).toBe(false);
  });

  it('rejects decoded credentials without a colon', () => {
    expect(verifyDatabricksAuth('Basic ' + Buffer.from('nocolon').toString('base64'), USER, PASS)).toBe(false);
  });

  it('rejects when credentials are not configured', () => {
    expect(verifyDatabricksAuth(basicAuth('', ''), '', '')).toBe(false);
  });
});

describe('POST /webhooks/databricks', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await POST(makeRequest(jobEvent('jobs.on_success')));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await POST(makeRequest(jobEvent('jobs.on_success'), basicAuth(USER, 'wrong')));
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid credentials', async () => {
    const res = await POST(makeRequest(jobEvent('jobs.on_success'), basicAuth(USER, PASS)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 500 when credentials are not configured (fails closed)', async () => {
    delete process.env.DATABRICKS_WEBHOOK_USERNAME;
    delete process.env.DATABRICKS_WEBHOOK_PASSWORD;
    const res = await POST(makeRequest(jobEvent('jobs.on_success'), basicAuth(USER, PASS)));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json', basicAuth(USER, PASS)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object payload', async () => {
    const res = await POST(makeRequest(['not-an-event'], basicAuth(USER, PASS)));
    expect(res.status).toBe(400);
  });

  it('handles every job event type', async () => {
    const types = [
      'jobs.on_start',
      'jobs.on_success',
      'jobs.on_failure',
      'jobs.on_duration_warning_threshold_exceeded',
      'jobs.some_future_event',
    ];
    for (const type of types) {
      const res = await POST(makeRequest(jobEvent(type), basicAuth(USER, PASS)));
      expect(res.status).toBe(200);
    }
  });

  it('handles task-level events', async () => {
    const body = { ...jobEvent('jobs.on_start'), task: { task_key: 'ingest' }, run: { run_id: '43', parent_run_id: '42' } };
    const res = await POST(makeRequest(body, basicAuth(USER, PASS)));
    expect(res.status).toBe(200);
  });

  it('handles SQL alert payloads', async () => {
    const res = await POST(makeRequest(alertEvent, basicAuth(USER, PASS)));
    expect(res.status).toBe(200);
  });
});
