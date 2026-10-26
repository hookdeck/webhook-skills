const crypto = require('crypto');
const request = require('supertest');

// BambooHR webhook private key (used as a plain UTF-8 string)
const SECRET = '37b26dc8cf1f08435fd0d08779268d77';
process.env.BAMBOOHR_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

// BambooHR signature: hex HMAC-SHA256 of body + timestamp header value (no separator)
function sign(body, timestamp, secret = SECRET) {
  const message = Buffer.concat([Buffer.from(body), Buffer.from(timestamp, 'latin1')]);
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

const timestamp = String(Math.floor(Date.now() / 1000));
const payload = JSON.stringify({
  employees: [
    {
      id: '40351',
      action: 'Updated',
      timestamp: '2025-08-18T21:38:50Z',
      changedFields: ['Employee #'],
      fields: { 'Employee #': '9', 'First Name': 'Robert' },
    },
    { id: '40546', action: 'Created', timestamp: '2025-08-19T21:38:50Z', changedFields: [], fields: {} },
    { id: '40547', action: 'Deleted', timestamp: '2025-08-19T21:39:50Z', changedFields: [], fields: {} },
  ],
});

function post(body, headers = {}, contentType = 'application/json') {
  const req = request(app).post('/webhooks/bamboohr').set('Content-Type', contentType);
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(body);
}

describe('POST /webhooks/bamboohr', () => {
  afterEach(() => {
    delete process.env.BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid signature (batched employees)', async () => {
    const res = await post(payload, {
      'X-BambooHR-Signature': sign(payload, timestamp),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    { type: 'employee.created', timestamp: '2025-02-18T15:30:00Z', data: { companyId: '12345', employeeId: '100' } },
    {
      type: 'employee.updated',
      timestamp: '2026-01-31T18:42:00+0000',
      data: { companyId: '12345', employeeId: '67890', changedFields: ['firstName'] },
    },
    { type: 'employee.deleted', timestamp: '2025-02-18T15:30:00Z', data: { companyId: '12345', employeeId: '100' } },
    { type: 'company.updated', timestamp: '2025-02-18T15:30:00Z', data: { companyId: '12345' } },
    { type: 'company.deleted', timestamp: '2025-02-18T15:30:00Z', data: { companyId: '12345' } },
    { type: 'company-integrations.updated', timestamp: '2025-02-18T15:30:00Z', data: { companyId: '12345' } },
    { type: 'some.future_event', timestamp: '2025-02-18T15:30:00Z', data: {} },
  ])('accepts a signed event-based $type payload', async (event) => {
    const body = JSON.stringify(event);
    const res = await post(body, { 'X-BambooHR-Signature': sign(body, timestamp), 'X-BambooHR-Timestamp': timestamp });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects an event-based payload with a bad signature', async () => {
    const body = JSON.stringify({ type: 'employee.created', timestamp: '2025-02-18T15:30:00Z', data: { employeeId: '100' } });
    const res = await post(body, {
      'X-BambooHR-Signature': sign(body, timestamp, 'wrong_secret'),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(401);
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await post(payload, {
      'X-BambooHR-Signature': sign(payload, timestamp).toUpperCase(),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(200);
  });

  it('accepts a signed form-encoded body', async () => {
    const form = 'employees%5B40351%5D%5Baction%5D=Updated&employees%5B40351%5D%5Btimestamp%5D=2025-08-18T21%3A38%3A50Z';
    const res = await post(
      form,
      { 'X-BambooHR-Signature': sign(form, timestamp), 'X-BambooHR-Timestamp': timestamp },
      'application/x-www-form-urlencoded'
    );
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(payload, {
      'X-BambooHR-Signature': sign(payload, timestamp, 'wrong_secret'),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a signature that omits the timestamp', async () => {
    const bodyOnly = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    const res = await post(payload, { 'X-BambooHR-Signature': bodyOnly, 'X-BambooHR-Timestamp': timestamp });
    expect(res.status).toBe(401);
  });

  it('rejects a signature with the timestamp before the body', async () => {
    const swapped = crypto.createHmac('sha256', SECRET).update(timestamp + payload).digest('hex');
    const res = await post(payload, { 'X-BambooHR-Signature': swapped, 'X-BambooHR-Timestamp': timestamp });
    expect(res.status).toBe(401);
  });

  it('rejects a different timestamp header than the one signed', async () => {
    const res = await post(payload, {
      'X-BambooHR-Signature': sign(payload, timestamp),
      'X-BambooHR-Timestamp': String(Number(timestamp) + 1),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await post(payload, { 'X-BambooHR-Timestamp': timestamp });
    expect(res.status).toBe(401);
  });

  it('rejects a missing timestamp', async () => {
    const res = await post(payload, { 'X-BambooHR-Signature': sign(payload, timestamp) });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    for (const bad of ['abc', 'z'.repeat(64), `${sign(payload, timestamp)}00`]) {
      const res = await post(payload, { 'X-BambooHR-Signature': bad, 'X-BambooHR-Timestamp': timestamp });
      expect(res.status).toBe(401);
    }
  });

  it('rejects a body modified after signing', async () => {
    const res = await post(payload.replace('40351', '40352'), {
      'X-BambooHR-Signature': sign(payload, timestamp),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(401);
  });

  it('rejects signed invalid JSON with 400', async () => {
    const res = await post('not json', {
      'X-BambooHR-Signature': sign('not json', timestamp),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const old = '1500000000';
    const res = await post(payload, { 'X-BambooHR-Signature': sign(payload, old), 'X-BambooHR-Timestamp': old });
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when the tolerance is enabled', async () => {
    process.env.BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = '1500000000';
    const res = await post(payload, { 'X-BambooHR-Signature': sign(payload, old), 'X-BambooHR-Timestamp': old });
    expect(res.status).toBe(401);
  });

  it('accepts a fresh timestamp when the tolerance is enabled', async () => {
    process.env.BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS = '300';
    const res = await post(payload, {
      'X-BambooHR-Signature': sign(payload, timestamp),
      'X-BambooHR-Timestamp': timestamp,
    });
    expect(res.status).toBe(200);
  });
});
