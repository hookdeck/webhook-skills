const request = require('supertest');
const crypto = require('crypto');

// The signing_key is whatever string you set on the RootFi webhook config; RootFi does not
// generate one. The whole string, as UTF-8, is the HMAC key. This one is only for tests.
const SECRET = 'rf_whsk_3f9a1c7e5b2d4a60';
process.env.ROOTFI_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function v1For(body, t, secret = SECRET) {
  const h = crypto.createHmac('sha256', secret).update(`${t}.`);
  return h.update(Buffer.isBuffer(body) ? body : Buffer.from(body)).digest('hex');
}

function sign(body, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${t},v1=${v1For(body, t, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json', extra = {}) {
  const req = request(app).post('/webhooks/rootfi').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-RootFi-Signature', signature);
  for (const [k, v] of Object.entries(extra)) req.set(k, v);
  return req.send(body);
}

// Payloads as shown in RootFi's webhook docs
const samples = {
  DATA_MODEL_CHANGES: { event: 'DATA_MODEL_CHANGES', data: { company_id: 1234, integration_type: 'XERO', data_model: 'INVOICE', type: 'CREATE', job_id: 'amiKRBIQ1khvk6B', sync_id: 'pt21IJtaATVZJ5v', no_of_records: 2, records: [{ platform_id: '3124930487' }, { platform_id: '3147384833' }] } },
  SYNC_STARTED: { event: 'SYNC_STARTED', data: { sync_id: 'pt21IJtaATVZJ5v', company_id: 1234, integration_type: 'XERO', data_models: ['INVOICE', 'CONTACT'], full_sync: false } },
  SYNC_COMPLETED: { event: 'SYNC_COMPLETED', data: { id: 'pt21IJtaATVZJ5v', sync_id: 'pt21IJtaATVZJ5v', type: 'PULL', status: 'SUCCESS', start_time: '2024-05-16T11:27:22.000Z', end_time: '2024-05-16T11:27:38.743Z', total_jobs_count: 15, success_jobs_count: 15, failed_jobs_count: 0, running_jobs_count: 0, created_jobs_count: 0, data_models: ['INVOICE', 'CONTACT'], company_id: 1234, integration_type: 'XERO' } },
  CONNECTION_CHANGED: { event: 'CONNECTION_CHANGED', data: { connection_id: '1234_XERO', company_id: 1234, integration_type: 'XERO', status: 'HEALTHY' } },
  DISCONNECT_REQUESTED: { event: 'DISCONNECT_REQUESTED', data: { disconnect_request_id: 42, connection_id: '1234_XERO', company_id: 1234, integration_type: 'XERO' } },
};
const syncCompleted = JSON.stringify(samples.SYNC_COMPLETED);

describe('RootFi webhook signature verification', () => {
  it('accepts a valid X-RootFi-Signature', async () => {
    const res = await post(syncCompleted, sign(syncCompleted));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(syncCompleted, sign(syncCompleted), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes received, including whitespace and non-ASCII', async () => {
    const body = '{\n  "event":   "CONNECTION_CHANGED",\n  "data": {"status": "HEALTHY", "name": "Café ☕"}\n}\n';
    expect((await post(body, sign(body))).status).toBe(200);
    // Re-serialized JSON is a different byte sequence and must not verify
    const reserialized = JSON.stringify(JSON.parse(body));
    expect((await post(reserialized, sign(body))).status).toBe(401);
  });

  it('verifies bytes that are not valid UTF-8 without re-encoding them', async () => {
    const body = Buffer.concat([Buffer.from('{"event":"SYNC_STARTED","data":{"x":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}}')]);
    const res = await post(body, sign(body), 'application/octet-stream');
    // Verified over the untouched bytes; decoding to a string happens only after the check
    expect(res.status).toBe(200);
    // A decoded-and-re-encoded copy has different bytes and must not verify
    const lossy = Buffer.from(body.toString('utf8'));
    expect((await post(lossy, sign(body), 'application/octet-stream')).status).toBe(401);
  });

  it('uses t exactly as it appears in the header', async () => {
    // A leading zero would be lost if t were parsed to a number and formatted again
    const t = '01716035258';
    expect((await post(syncCompleted, `t=${t},v1=${v1For(syncCompleted, t)}`)).status).toBe(200);
    expect((await post(syncCompleted, `t=1716035258,v1=${v1For(syncCompleted, t)}`)).status).toBe(401);
  });

  it('uses the signing key as plain UTF-8, not hex- or base64-decoded', async () => {
    const key = crypto.randomBytes(16).toString('hex');
    process.env.ROOTFI_WEBHOOK_SECRET = key;
    try {
      const t = Math.floor(Date.now() / 1000);
      expect((await post(syncCompleted, sign(syncCompleted, t, key))).status).toBe(200);
      expect((await post(syncCompleted, sign(syncCompleted, t, Buffer.from(key, 'hex')))).status).toBe(401);
      expect((await post(syncCompleted, sign(syncCompleted, t, Buffer.from(key, 'base64')))).status).toBe(401);
    } finally {
      process.env.ROOTFI_WEBHOOK_SECRET = SECRET;
    }
  });

  it('allows a space after the comma in the header', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(syncCompleted, `t=${t}, v1=${v1For(syncCompleted, t)}`)).status).toBe(200);
  });

  it('accepts when any v1 matches and ignores other keys such as v0', async () => {
    const t = Math.floor(Date.now() / 1000);
    const old = v1For(syncCompleted, t, 'rf_old_signing_key');
    const good = v1For(syncCompleted, t);
    expect((await post(syncCompleted, `t=${t},v1=${old},v1=${good}`)).status).toBe(200);
    expect((await post(syncCompleted, `t=${t},v1=${good},v1=${old}`)).status).toBe(200);
    expect((await post(syncCompleted, `t=${t},v0=${good},v1=${good}`)).status).toBe(200);
    expect((await post(syncCompleted, `t=${t},v0=${good}`)).status).toBe(401);
    expect((await post(syncCompleted, `t=${t},v1=${old},v1=${old.replace(/.$/, '0')}`)).status).toBe(401);
  });

  it('accepts uppercase hex', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(syncCompleted, `t=${t},v1=${v1For(syncCompleted, t).toUpperCase()}`)).status).toBe(200);
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await post(syncCompleted, undefined)).status).toBe(401);
    expect((await post(syncCompleted, '')).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(syncCompleted.replace('SUCCESS', 'FAILED'), sign(syncCompleted))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(syncCompleted, sign(syncCompleted, undefined, 'rf_other_key'))).status).toBe(401);
  });

  it('rejects a v1 of the wrong length or invalid hex without throwing', async () => {
    const t = 1716035258;
    expect((await post(syncCompleted, `t=${t},v1=abc`)).status).toBe(401);
    // 64 chars but not hex: Buffer.from(x, 'hex') would silently truncate it
    expect((await post(syncCompleted, `t=${t},v1=${'zz'.repeat(32)}`)).status).toBe(401);
    expect((await post(syncCompleted, `t=${t},v1=${'a'.repeat(63)}g`)).status).toBe(401);
    expect((await post(syncCompleted, `t=${t},v1=${'a'.repeat(66)}`)).status).toBe(401);
  });

  it('rejects headers with no t or no v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(syncCompleted, `v1=${v1For(syncCompleted, t)}`)).status).toBe(401);
    expect((await post(syncCompleted, `t=${t}`)).status).toBe(401);
    expect((await post(syncCompleted, `t=,v1=${v1For(syncCompleted, '')}`)).status).toBe(401);
    expect((await post(syncCompleted, 'garbage')).status).toBe(401);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(syncCompleted, 1716035258).replace('t=1716035258', 't=1716035259');
    expect((await post(syncCompleted, header)).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.ROOTFI_WEBHOOK_SECRET;
    try {
      expect((await post(syncCompleted, sign(syncCompleted))).status).toBe(500);
    } finally {
      process.env.ROOTFI_WEBHOOK_SECRET = SECRET;
    }
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(syncCompleted, sign(syncCompleted, old))).status).toBe(200);
  });

  it('rejects an old timestamp when ROOTFI_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.ROOTFI_WEBHOOK_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(syncCompleted, sign(syncCompleted, old))).status).toBe(401);
      expect((await post(syncCompleted, sign(syncCompleted))).status).toBe(200);
    } finally {
      delete process.env.ROOTFI_WEBHOOK_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric ROOTFI_WEBHOOK_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.ROOTFI_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(syncCompleted, sign(syncCompleted, old))).status).toBe(200);
    } finally {
      delete process.env.ROOTFI_WEBHOOK_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('RootFi events (dispatch on the event field)', () => {
  it.each([...Object.keys(samples), 'SOMETHING_NEW'])('handles %s', async (name) => {
    const body = JSON.stringify(samples[name] || { event: name, data: {} });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body), 'application/json', { 'X-RootFi-Webhook-Delivery-Id': 'dlv_123' });
      expect(res.status).toBe(200);
      const logged = log.mock.calls.map((c) => c[0]).join('\n');
      if (samples[name]) expect(logged).not.toContain('Unhandled');
      else expect(logged).toContain(`Unhandled event: ${name}`);
    } finally {
      log.mockRestore();
    }
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
