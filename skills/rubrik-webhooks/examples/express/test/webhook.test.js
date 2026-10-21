const request = require('supertest');

// Credentials YOU choose and enter in the Rubrik webhook's auth settings.
// Rubrik doesn't define a format; any long random string works.
const TEST_HEADER_NAME = 'X-Rubrik-Webhook-Token';
const TEST_SECRET = 'rbk_test_9f2c4e6a8b1d3f5e7a9c';
const TEST_BEARER = 'bearer_test_token_4d6f8a0c2e';
const TEST_USERNAME = 'rubrik';
const TEST_PASSWORD = 'pa:ss:word'; // contains colons on purpose

process.env.RUBRIK_WEBHOOK_HEADER_NAME = TEST_HEADER_NAME;
process.env.RUBRIK_WEBHOOK_SECRET = TEST_SECRET;
process.env.RUBRIK_WEBHOOK_BEARER_TOKEN = TEST_BEARER;
process.env.RUBRIK_WEBHOOK_USERNAME = TEST_USERNAME;
process.env.RUBRIK_WEBHOOK_PASSWORD = TEST_PASSWORD;

const { app, authenticateRequest, normalizeEvent } = require('../src/index');

// Default payload (PD-CEF) from Rubrik's "Events" developer docs.
const BACKUP_FAILED = {
  summary: "Failed backup of vSphere VM 'sh1-EncryptMe-05-Group1'.",
  source: 'Rubrik Security Cloud',
  severity: 'critical',
  timestamp: '2024-07-18T06:39:40.46Z',
  class: 'Backup',
  custom_details: {
    seriesId: 'ccd7a8a5-4c58-4c88-bff9-7bdffddb6099',
    id: 'c2b47274-6323-4025-b307-afed1cfb7574',
    type: 'Event',
    objectId: '83c4a80a-4a57-5699-b399-651089135586',
    objectName: 'sh1-EncryptMe-05-Group1',
    objectType: 'VmwareVm',
    status: 'Failure',
    clusterId: '6a271636-9392-4cba-90c5-bdbe227854ab',
    clusterName: 'sh1-PaloAlto',
    eventName: 'Snapshot.BackupFailed',
    errorId: 'Snapshot.VmwareSnapshotError',
    errorCode: '',
    errorRemedy: '',
    errorReason: '',
    auditUserName: '',
    auditUserId: '',
    location: 'sh1-paloalto-vcsa.rubrikdemo.com',
    url: '',
    customerID: 'rubrik-gaia',
    logicalSizeInBytes: '',
    dataTransferredInBytes: '',
    effectiveThroughput: '',
  },
};

const BACKUP_SUCCEEDED = {
  ...BACKUP_FAILED,
  summary: "Completed backup of vSphere VM 'sh1-EncryptMe-05-Group1'.",
  severity: 'info',
  custom_details: { ...BACKUP_FAILED.custom_details, id: 'd3c58385-7434-4136-a418-bfe02d0c8685', status: 'Success', eventName: 'Snapshot.BackupSucceeded' },
};

function post(body, headers = {}) {
  const req = request(app).post('/webhooks/rubrik').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`, 'utf8').toString('base64')}`;

let logSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe('CUSTOM_HEADER authentication', () => {
  test('accepts the configured header and value', async () => {
    const res = await post(BACKUP_FAILED, { [TEST_HEADER_NAME]: TEST_SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, id: 'c2b47274-6323-4025-b307-afed1cfb7574' });
  });

  test('header name is case-insensitive', async () => {
    const res = await post(BACKUP_FAILED, { 'x-rubrik-webhook-token': TEST_SECRET });
    expect(res.status).toBe(200);
  });

  test('rejects a wrong value', async () => {
    const res = await post(BACKUP_FAILED, { [TEST_HEADER_NAME]: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('rejects the right value under a different header', async () => {
    const res = await post(BACKUP_FAILED, { 'X-Other-Header': TEST_SECRET });
    expect(res.status).toBe(401);
  });

  test('rejects a missing header', async () => {
    const res = await post(BACKUP_FAILED);
    expect(res.status).toBe(401);
  });

  test('works when the custom header key is Authorization', () => {
    const env = { RUBRIK_WEBHOOK_HEADER_NAME: 'Authorization', RUBRIK_WEBHOOK_SECRET: 'Bearer Example123' };
    expect(authenticateRequest({ authorization: 'Bearer Example123' }, env)).toBe('custom_header');
    expect(authenticateRequest({ authorization: 'Bearer nope' }, env)).toBeNull();
  });
});

describe('BEARER authentication', () => {
  test('accepts a valid bearer token', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: `Bearer ${TEST_BEARER}` });
    expect(res.status).toBe(200);
  });

  test('scheme is case-insensitive', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: `bearer ${TEST_BEARER}` });
    expect(res.status).toBe(200);
  });

  test('rejects a wrong token', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  test('rejects the token without the Bearer scheme', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: TEST_BEARER });
    expect(res.status).toBe(401);
  });
});

describe('BASIC authentication', () => {
  test('accepts valid credentials (password containing colons)', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: basic(TEST_USERNAME, TEST_PASSWORD) });
    expect(res.status).toBe(200);
  });

  test('rejects a wrong password', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: basic(TEST_USERNAME, 'nope') });
    expect(res.status).toBe(401);
  });

  test('rejects a wrong username', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: basic('admin', TEST_PASSWORD) });
    expect(res.status).toBe(401);
  });

  test('rejects malformed base64', async () => {
    const res = await post(BACKUP_FAILED, { Authorization: 'Basic !!!notbase64' });
    expect(res.status).toBe(401);
  });
});

describe('fail closed', () => {
  test('rejects everything when no credentials are configured', () => {
    expect(authenticateRequest({ 'x-rubrik-webhook-token': TEST_SECRET, authorization: `Bearer ${TEST_BEARER}` }, {})).toBeNull();
  });
});

describe('payload handling', () => {
  const auth = { [TEST_HEADER_NAME]: TEST_SECRET };

  test('handles a backup failure event', async () => {
    const res = await post(BACKUP_FAILED, auth);
    expect(res.status).toBe(200);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('FAILED Backup on sh1-EncryptMe-05-Group1');
  });

  test('handles a backup success event', async () => {
    const res = await post(BACKUP_SUCCEEDED, auth);
    expect(res.status).toBe(200);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Succeeded Backup on sh1-EncryptMe-05-Group1');
  });

  test('flags Anomaly events', async () => {
    const anomaly = { ...BACKUP_FAILED, class: 'Anomaly', custom_details: { ...BACKUP_FAILED.custom_details, status: 'Warning' } };
    const res = await post(anomaly, auth);
    expect(res.status).toBe(200);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('ANOMALY detected');
  });

  test('accepts a flat custom-template payload', async () => {
    const custom = { id: 'abc', type: 'Event', class: 'Backup', status: 'Success', objectName: 'db01', message: 'ok' };
    const res = await post(custom, auth);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('abc');
  });

  test('normalizeEvent reads the PD-CEF shape', () => {
    expect(normalizeEvent(BACKUP_FAILED)).toMatchObject({
      id: 'c2b47274-6323-4025-b307-afed1cfb7574',
      activityType: 'Event',
      eventClass: 'Backup',
      status: 'Failure',
      severity: 'critical',
      objectType: 'VmwareVm',
      eventName: 'Snapshot.BackupFailed',
    });
  });

  test('returns 400 for invalid JSON (after auth)', async () => {
    const res = await post('{not json', auth);
    expect(res.status).toBe(400);
  });

  test('returns 400 for a JSON array', async () => {
    const res = await post([BACKUP_FAILED], auth);
    expect(res.status).toBe(400);
  });

  test('checks auth before parsing the body', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(401);
  });
});
