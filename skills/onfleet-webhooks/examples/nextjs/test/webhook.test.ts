import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';

// after() needs a Next.js request scope. Outside the Next server, run the
// callback on a microtask so the route can be exercised directly.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      queueMicrotask(() => void task());
    },
  };
});

import { NextRequest } from 'next/server';
import {
  GET,
  POST,
  verifyOnfleetSignature,
  handleOnfleetEvent,
} from '../app/webhooks/onfleet/route';

// Onfleet webhook secrets are hex strings. This is hex("onfleet-test-secret-key").
const SECRET_HEX = '6f6e666c6565742d746573742d7365637265742d6b6579';
process.env.ONFLEET_WEBHOOK_SECRET = SECRET_HEX;

/**
 * Sign a payload the way Onfleet does: HMAC-SHA512 over the raw body,
 * keyed with the HEX-DECODED secret, lowercase hex digest.
 */
function signOnfleet(body: string, secretHex = SECRET_HEX): string {
  return crypto
    .createHmac('sha512', Buffer.from(secretHex, 'hex'))
    .update(body)
    .digest('hex');
}

function buildPost(body: string, signature: string | null = signOnfleet(body)): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) headers.set('x-onfleet-signature', signature);
  return new NextRequest('http://localhost/webhooks/onfleet', {
    method: 'POST',
    headers,
    body,
  });
}

// Every trigger name from the Onfleet trigger table (ids 0-30; 11 and 21 are
// not documented), plus `taskPredictedDelay`, the name the published sample
// payload for trigger 30 carries.
const TRIGGERS: Array<[number, string]> = [
  [0, 'taskStarted'],
  [1, 'taskEta'],
  [2, 'taskArrival'],
  [3, 'taskCompleted'],
  [4, 'taskFailed'],
  [5, 'workerDuty'],
  [6, 'taskCreated'],
  [7, 'taskUpdated'],
  [8, 'taskDeleted'],
  [9, 'taskAssigned'],
  [10, 'taskUnassigned'],
  [12, 'taskDelayed'],
  [13, 'taskCloned'],
  [14, 'smsRecipientResponseMissed'],
  [15, 'workerCreated'],
  [16, 'workerDeleted'],
  [17, 'SMSRecipientOptOut'],
  [18, 'autoDispatchJobCompleted'],
  [19, 'taskBatchCreateJobCompleted'],
  [20, 'routeOptimizationJobCompleted'],
  [22, 'routePlanCreated'],
  [23, 'routePlanStarted'],
  [24, 'routePlanCompleted'],
  [25, 'workerUpdated'],
  [26, 'routePlanUpdated'],
  [27, 'routePlanUnassigned'],
  [28, 'routePlanAssigned'],
  [29, 'routePlanDelayed'],
  [30, 'predictedTaskDelay'],
  [30, 'taskPredictedDelay'],
];

// Shape of the documented taskCreated sample, trimmed. Note the null fields,
// the `[]` metadata placeholder, ids containing ~ and *, and [lon, lat].
const taskCreatedPayload = JSON.stringify({
  actionContext: { id: 'vjw*RDMKDljKVDve1Vtcplgu', type: 'ADMIN' },
  adminId: 'vjw*RDMKDljKVDve1Vtcplgu',
  data: {
    task: {
      id: 'txiK2xHBIaUwAKB~BJrjscKu',
      shortId: 'fab829cf',
      state: 1,
      container: { type: 'WORKER', worker: 'COwfwH~Zogm1LXIZYbPlLAyw' },
      destination: { location: [-117.8764687, 33.8078476] },
      metadata: [],
    },
  },
  taskId: 'txiK2xHBIaUwAKB~BJrjscKu',
  time: 1613002584051,
  triggerId: 6,
  triggerName: 'taskCreated',
  workerId: null,
});

afterEach(() => {
  process.env.ONFLEET_WEBHOOK_SECRET = SECRET_HEX;
  vi.restoreAllMocks();
});

describe('GET /webhooks/onfleet (validation handshake)', () => {
  it('echoes the check value as text/plain with 200', async () => {
    const res = await GET(new NextRequest('http://localhost/webhooks/onfleet?check=example'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('example');
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
  });

  it('echoes the value verbatim, unsigned', async () => {
    const token = 'a1B2~c3*D4-e5_f6';
    const url = new URL('http://localhost/webhooks/onfleet');
    url.searchParams.set('check', token);
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(token);
  });

  it('returns 400 when check is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/webhooks/onfleet'));
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/onfleet', () => {
  it('returns 200 for a valid signature', async () => {
    const res = await POST(buildPost(taskCreatedPayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await POST(buildPost(taskCreatedPayload, signOnfleet(taskCreatedPayload).toUpperCase()));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(buildPost(taskCreatedPayload, null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Missing X-Onfleet-Signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(buildPost(taskCreatedPayload, 'deadbeef'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const signature = signOnfleet(taskCreatedPayload);
    const tampered = taskCreatedPayload.replace('taskCreated', 'taskDeleted');
    const res = await POST(buildPost(tampered, signature));
    expect(res.status).toBe(400);
  });

  it('rejects a signature keyed with the secret as a UTF-8 string (regression)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrongKey = crypto.createHmac('sha512', SECRET_HEX).update(taskCreatedPayload).digest('hex');
    const res = await POST(buildPost(taskCreatedPayload, wrongKey));
    expect(res.status).toBe(400);
  });

  it('rejects an HMAC-SHA256 signature (regression)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sha256 = crypto
      .createHmac('sha256', Buffer.from(SECRET_HEX, 'hex'))
      .update(taskCreatedPayload)
      .digest('hex');
    const res = await POST(buildPost(taskCreatedPayload, sha256));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const res = await POST(buildPost('not json'));
    expect(res.status).toBe(400);
  });

  it('fails closed with 500 when the secret is unset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.ONFLEET_WEBHOOK_SECRET;
    const res = await POST(buildPost(taskCreatedPayload));
    expect(res.status).toBe(500);
  });

  it('fails closed with 500 when the secret is not hex', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ONFLEET_WEBHOOK_SECRET = 'not-a-hex-secret';
    const res = await POST(buildPost(taskCreatedPayload));
    expect(res.status).toBe(500);
  });

  it.each(TRIGGERS)('acknowledges trigger %i %s with null fields', async (triggerId, triggerName) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = JSON.stringify({
      triggerId,
      triggerName,
      taskId: null,
      workerId: null,
      adminId: null,
      actionContext: null,
      data: {},
      time: 1613002584051,
    });
    const res = await POST(buildPost(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown trigger', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = JSON.stringify({ triggerId: 99, triggerName: 'somethingNew', data: null, time: 1 });
    const res = await POST(buildPost(body));
    expect(res.status).toBe(200);
  });
});

describe('verifyOnfleetSignature', () => {
  it('matches the digest produced by the Onfleet docs Python sample', () => {
    // hmac.new(binascii.a2b_hex(secret), body.encode('utf-8'), 'sha512').hexdigest()
    const body =
      '{"triggerId":6,"triggerName":"taskCreated","taskId":"txiK2xHBIaUwAKB~BJrjscKu","time":1613002584051}';
    const expected =
      'd7b1dead2bca4ecb74d35eba8541ec308d372367c9068bb207467cd35f230572875a05e2b159373f2d9d8ca1ebf812522c861758b288d4ce041d827ab47c4f69';
    expect(signOnfleet(body)).toBe(expected);
    expect(verifyOnfleetSignature(body, expected, SECRET_HEX)).toEqual({ valid: true });
  });
});

describe('handleOnfleetEvent', () => {
  it('handles every documented trigger without throwing on null/empty fields', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const [triggerId, triggerName] of TRIGGERS) {
      expect(() =>
        handleOnfleetEvent({ triggerId, triggerName, taskId: null, workerId: null, data: {} })
      ).not.toThrow();
      expect(() => handleOnfleetEvent({ triggerId, triggerName, data: null })).not.toThrow();
    }
  });

  it('handles the SMSRecipientOptOut shape (top-level recipient, data {})', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    handleOnfleetEvent({
      recipient: { id: '7LecFRKJw7ExfyhBsi9h0NXW' },
      triggerId: 17,
      triggerName: 'SMSRecipientOptOut',
      data: {},
      time: 1632432776640,
    });
    expect(log).toHaveBeenCalledWith('Recipient opted out of SMS:', '7LecFRKJw7ExfyhBsi9h0NXW');
  });
});
