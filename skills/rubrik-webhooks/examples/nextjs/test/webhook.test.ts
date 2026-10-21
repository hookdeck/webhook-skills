import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authenticateRequest, normalizeEvent } from '../lib/rubrik-auth';

// Credentials YOU choose and enter in the Rubrik webhook's auth settings.
const TEST_HEADER_NAME = 'X-Rubrik-Webhook-Token';
const TEST_SECRET = 'rbk_test_9f2c4e6a8b1d3f5e7a9c';
const TEST_BEARER = 'bearer_test_token_4d6f8a0c2e';
const TEST_USERNAME = 'rubrik';
const TEST_PASSWORD = 'pa:ss:word'; // contains colons on purpose

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
    location: 'sh1-paloalto-vcsa.rubrikdemo.com',
    customerID: 'rubrik-gaia',
  },
};

const BACKUP_SUCCEEDED = {
  ...BACKUP_FAILED,
  summary: "Completed backup of vSphere VM 'sh1-EncryptMe-05-Group1'.",
  severity: 'info',
  custom_details: { ...BACKUP_FAILED.custom_details, id: 'd3c58385-7434-4136-a418-bfe02d0c8685', status: 'Success' },
};

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.RUBRIK_WEBHOOK_HEADER_NAME = TEST_HEADER_NAME;
  process.env.RUBRIK_WEBHOOK_SECRET = TEST_SECRET;
  process.env.RUBRIK_WEBHOOK_BEARER_TOKEN = TEST_BEARER;
  process.env.RUBRIK_WEBHOOK_USERNAME = TEST_USERNAME;
  process.env.RUBRIK_WEBHOOK_PASSWORD = TEST_PASSWORD;
  ({ POST } = await import('../app/webhooks/rubrik/route'));
});

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/rubrik', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`, 'utf8').toString('base64')}`;
const logs = () => logSpy.mock.calls.flat().join('\n');

describe('CUSTOM_HEADER authentication', () => {
  it('accepts the configured header and value', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { [TEST_HEADER_NAME]: TEST_SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, id: 'c2b47274-6323-4025-b307-afed1cfb7574' });
  });

  it('header name is case-insensitive', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { 'x-rubrik-webhook-token': TEST_SECRET }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong value', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { [TEST_HEADER_NAME]: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED));
    expect(res.status).toBe(401);
  });

  it('works when the custom header key is Authorization', () => {
    const env = { RUBRIK_WEBHOOK_HEADER_NAME: 'Authorization', RUBRIK_WEBHOOK_SECRET: 'Bearer Example123' };
    expect(authenticateRequest(new Headers({ authorization: 'Bearer Example123' }), env)).toBe('custom_header');
    expect(authenticateRequest(new Headers({ authorization: 'Bearer nope' }), env)).toBeNull();
  });
});

describe('BEARER authentication', () => {
  it('accepts a valid bearer token', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { authorization: `Bearer ${TEST_BEARER}` }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects the token without the Bearer scheme', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { authorization: TEST_BEARER }));
    expect(res.status).toBe(401);
  });
});

describe('BASIC authentication', () => {
  it('accepts valid credentials (password containing colons)', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { authorization: basic(TEST_USERNAME, TEST_PASSWORD) }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { authorization: basic(TEST_USERNAME, 'nope') }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, { authorization: basic('admin', TEST_PASSWORD) }));
    expect(res.status).toBe(401);
  });
});

describe('fail closed', () => {
  it('rejects everything when no credentials are configured', () => {
    const headers = new Headers({ [TEST_HEADER_NAME]: TEST_SECRET, authorization: `Bearer ${TEST_BEARER}` });
    expect(authenticateRequest(headers, {})).toBeNull();
  });
});

describe('payload handling', () => {
  const auth = { [TEST_HEADER_NAME]: TEST_SECRET };

  it('handles a backup failure event', async () => {
    const res = await POST(makeRequest(BACKUP_FAILED, auth));
    expect(res.status).toBe(200);
    expect(logs()).toContain('FAILED Backup on sh1-EncryptMe-05-Group1');
  });

  it('handles a backup success event', async () => {
    const res = await POST(makeRequest(BACKUP_SUCCEEDED, auth));
    expect(res.status).toBe(200);
    expect(logs()).toContain('Succeeded Backup on sh1-EncryptMe-05-Group1');
  });

  it('flags Anomaly events', async () => {
    const anomaly = { ...BACKUP_FAILED, class: 'Anomaly', custom_details: { ...BACKUP_FAILED.custom_details, status: 'Warning' } };
    const res = await POST(makeRequest(anomaly, auth));
    expect(res.status).toBe(200);
    expect(logs()).toContain('ANOMALY detected');
  });

  it('accepts a flat custom-template payload', async () => {
    const custom = { id: 'abc', type: 'Event', class: 'Backup', status: 'Success', objectName: 'db01', message: 'ok' };
    const res = await POST(makeRequest(custom, auth));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe('abc');
  });

  it('normalizeEvent reads the PD-CEF shape', () => {
    expect(normalizeEvent(BACKUP_FAILED)).toMatchObject({
      id: 'c2b47274-6323-4025-b307-afed1cfb7574',
      activityType: 'Event',
      eventClass: 'Backup',
      status: 'Failure',
      severity: 'critical',
      eventName: 'Snapshot.BackupFailed',
    });
  });

  it('returns 400 for invalid JSON (after auth)', async () => {
    const res = await POST(makeRequest('{not json', auth));
    expect(res.status).toBe(400);
  });

  it('checks auth before parsing the body', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(401);
  });
});
