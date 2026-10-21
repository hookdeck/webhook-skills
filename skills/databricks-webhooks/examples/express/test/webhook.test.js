const request = require('supertest');

// Set test environment variables before importing the app
process.env.DATABRICKS_WEBHOOK_USERNAME = 'dbx_user';
process.env.DATABRICKS_WEBHOOK_PASSWORD = 'test_pass:with:colons';

const { app, verifyDatabricksAuth } = require('../src/index');

const USER = process.env.DATABRICKS_WEBHOOK_USERNAME;
const PASS = process.env.DATABRICKS_WEBHOOK_PASSWORD;

// Databricks sends the destination's username/password as a standard Basic auth header
function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

const jobEvent = (event_type) => ({
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

  it('rejects a wrong password', () => {
    expect(verifyDatabricksAuth(basicAuth(USER, 'nope'), USER, PASS)).toBe(false);
  });

  it('rejects a wrong username', () => {
    expect(verifyDatabricksAuth(basicAuth('someone', PASS), USER, PASS)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyDatabricksAuth(undefined, USER, PASS)).toBe(false);
  });

  it('rejects a non-Basic scheme', () => {
    expect(verifyDatabricksAuth('Bearer abc', USER, PASS)).toBe(false);
  });

  it('rejects decoded credentials without a colon', () => {
    expect(verifyDatabricksAuth('Basic ' + Buffer.from('nocolon').toString('base64'), USER, PASS)).toBe(false);
  });

  it('rejects when credentials are not configured', () => {
    expect(verifyDatabricksAuth(basicAuth('', ''), '', '')).toBe(false);
  });

  it('splits credentials on the first colon', () => {
    expect(verifyDatabricksAuth(basicAuth(USER, PASS), USER, PASS)).toBe(true);
    expect(verifyDatabricksAuth(basicAuth(`${USER}:with`, 'colons'), USER, PASS)).toBe(false);
  });
});

describe('POST /webhooks/databricks', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(app).post('/webhooks/databricks').send(jobEvent('jobs.on_success'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/webhooks/databricks')
      .set('Authorization', basicAuth(USER, 'wrong'))
      .send(jobEvent('jobs.on_success'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid credentials', async () => {
    const res = await request(app)
      .post('/webhooks/databricks')
      .set('Authorization', basicAuth(USER, PASS))
      .send(jobEvent('jobs.on_success'));
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 500 when credentials are not configured (fails closed)', async () => {
    const saved = { u: process.env.DATABRICKS_WEBHOOK_USERNAME, p: process.env.DATABRICKS_WEBHOOK_PASSWORD };
    delete process.env.DATABRICKS_WEBHOOK_USERNAME;
    delete process.env.DATABRICKS_WEBHOOK_PASSWORD;
    try {
      const res = await request(app)
        .post('/webhooks/databricks')
        .set('Authorization', basicAuth(USER, PASS))
        .send(jobEvent('jobs.on_success'));
      expect(res.status).toBe(500);
    } finally {
      process.env.DATABRICKS_WEBHOOK_USERNAME = saved.u;
      process.env.DATABRICKS_WEBHOOK_PASSWORD = saved.p;
    }
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/webhooks/databricks')
      .set('Authorization', basicAuth(USER, PASS))
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object payload', async () => {
    const res = await request(app)
      .post('/webhooks/databricks')
      .set('Authorization', basicAuth(USER, PASS))
      .send(['not-an-event']);
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
      const res = await request(app)
        .post('/webhooks/databricks')
        .set('Authorization', basicAuth(USER, PASS))
        .send(jobEvent(type));
      expect(res.status).toBe(200);
    }
  });

  it('handles task-level events', async () => {
    const res = await request(app)
      .post('/webhooks/databricks')
      .set('Authorization', basicAuth(USER, PASS))
      .send({ ...jobEvent('jobs.on_start'), task: { task_key: 'ingest' }, run: { run_id: '43', parent_run_id: '42' } });
    expect(res.status).toBe(200);
  });

  it('handles SQL alert payloads', async () => {
    const res = await request(app)
      .post('/webhooks/databricks')
      .set('Authorization', basicAuth(USER, PASS))
      .send(alertEvent);
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
