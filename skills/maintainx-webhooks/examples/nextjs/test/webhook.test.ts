import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// MaintainX secrets are used as raw strings (no encoding/prefix)
const SECRET = 'test_maintainx_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MAINTAINX_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/maintainx/route'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Generate a real signature using MaintainX's algorithm: HMAC-SHA256 hex of "{t}.{body}"
function sign(body: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function makeRequest(body: string, header?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (header) headers['x-maintainx-webhook-body-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/maintainx', {
    method: 'POST',
    headers,
    body,
  });
}

const base = { orgId: 321, occurredAt: '2022-01-01T00:00:00.000Z' };
const events: Record<string, object> = {
  NEW_WORK_ORDER: { eventType: 'NEW_WORK_ORDER', workOrderId: 123456, ...base },
  WORK_ORDER_CHANGE: { eventType: 'WORK_ORDER_CHANGE', workOrderId: 123456, ...base },
  WORK_ORDER_STATUS_CHANGE: {
    eventType: 'WORK_ORDER_STATUS_CHANGE',
    workOrderId: 123456,
    oldStatus: 'OPEN',
    newStatus: 'IN_PROGRESS',
    ...base,
  },
  NEW_WORK_REQUEST: { eventType: 'NEW_WORK_REQUEST', workRequestId: 55, ...base },
  ASSET_STATUS_CHANGE: {
    eventType: 'ASSET_STATUS_CHANGE',
    assetId: 42,
    oldStatus: { id: 1 },
    newStatus: { id: 2 },
    ...base,
  },
};

describe('MaintainX webhook', () => {
  describe('valid signatures', () => {
    for (const name of Object.keys(events)) {
      it(`accepts ${name}`, async () => {
        const body = JSON.stringify(events[name]);
        const res = await POST(makeRequest(body, sign(body)));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
      });
    }

    it('accepts an unhandled event type', async () => {
      const body = JSON.stringify({ eventType: 'NEW_PART', orgId: 321 });
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    });

    it('ignores unknown signature schemes', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await POST(makeRequest(body, `${sign(body)},v2=deadbeef`));
      expect(res.status).toBe(200);
    });
  });

  describe('invalid requests', () => {
    it('rejects a missing signature header', async () => {
      const res = await POST(makeRequest(JSON.stringify(events.NEW_WORK_ORDER)));
      expect(res.status).toBe(400);
    });

    it('rejects a wrong secret', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await POST(makeRequest(body, sign(body, 'other_secret')));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const header = sign(body);
      const res = await POST(makeRequest(JSON.stringify({ ...events.NEW_WORK_ORDER, workOrderId: 1 }), header));
      expect(res.status).toBe(400);
    });

    it('rejects a malformed header', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await POST(makeRequest(body, 'garbage'));
      expect(res.status).toBe(400);
    });

    it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await POST(makeRequest(body, sign(body, SECRET, old)));
      expect(res.status).toBe(200);
    });

    it('rejects an old timestamp when MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
      process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS = '300';
      try {
        const old = Math.floor(Date.now() / 1000) - 3600;
        const body = JSON.stringify(events.NEW_WORK_ORDER);
        const res = await POST(makeRequest(body, sign(body, SECRET, old)));
        expect(res.status).toBe(400);
      } finally {
        delete process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS;
      }
    });

    it('treats a non-numeric MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
      process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const old = Math.floor(Date.now() / 1000) - 3600;
        const body = JSON.stringify(events.NEW_WORK_ORDER);
        const res = await POST(makeRequest(body, sign(body, SECRET, old)));
        expect(res.status).toBe(200);
      } finally {
        delete process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS;
        warn.mockRestore();
      }
    });

    it('rejects a signature of the wrong length', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await POST(makeRequest(body, `t=${Math.floor(Date.now() / 1000)},v1=abc`));
      expect(res.status).toBe(400);
    });

    it('rejects a validly signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(400);
    });
  });
});
