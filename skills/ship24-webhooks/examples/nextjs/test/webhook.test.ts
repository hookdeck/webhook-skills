import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/ship24/route';
import { verifyShip24Request } from '../lib/verify-ship24';

const SECRET = 'test_ship24_webhook_secret_0123456789';
const BEARER = `Bearer ${SECRET}`;

beforeAll(() => {
  process.env.SHIP24_WEBHOOK_SECRET = SECRET;
});

let counter = 0;

function trackingItem(topic = 'tracking/events', messageId = `msg-${++counter}`) {
  const base = {
    metadata: { generatedAt: '2025-03-04T17:13:35.000Z', messageId, topic },
    tracker: {
      trackerId: '26148317-7502-d3ac-44a9-546d240ac0dd',
      trackingNumber: '9400115901047177598206',
      isSubscribed: true,
    },
  };
  if (topic === 'tracking/pod') {
    return { ...base, data: { status: 'found', courier: 'ups-tracking', content: { type: 'text/plain', text: 'J. Doe' } } };
  }
  return {
    ...base,
    shipment: { shipmentId: 'f4f888d7-d140-423f-9a48-e0689d27e098' },
    events: [{ eventId: 'ee8ebe96', status: 'Delivered to the addressee', occurrenceDatetime: '2025-03-04T17:12:57' }],
    statistics: {},
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify({ trackings: [trackingItem()] }),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/ship24', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/ship24', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  const updates = () => logSpy.mock.calls.filter(([m]) => String(m).startsWith('Tracking update'));

  describe('Authorization bearer verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it.each(['bearer', 'BEARER', 'bEaReR'])('accepts the scheme in any case (%s)', async (scheme) => {
      const res = await POST(makeRequest({ Authorization: `${scheme} ${SECRET}` }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${'x'.repeat(SECRET.length)}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects a wrong scheme', async () => {
      for (const value of [`Basic ${SECRET}`, `Token ${SECRET}`, SECRET]) {
        const res = await POST(makeRequest({ Authorization: value }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects an empty secret after the scheme', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer ' }));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });

    it('does not trim the secret', () => {
      const h = (v: string) => new Headers({ authorization: v });
      expect(verifyShip24Request(h(`Bearer ${SECRET}`), `${SECRET} `)).toBe(false);
      expect(verifyShip24Request(h('Bearer  s3cret'), ' s3cret')).toBe(true);
    });

    it('fails closed when the secret is not configured', () => {
      const headers = new Headers({ authorization: BEARER });
      expect(verifyShip24Request(headers, '')).toBe(false);
      expect(verifyShip24Request(new Headers({ authorization: 'Bearer ' }), 'Bearer ')).toBe(false);
    });

    it('strips a "Bearer " prefix from the configured value, case-insensitively', () => {
      const headers = new Headers({ authorization: BEARER });
      expect(verifyShip24Request(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyShip24Request(headers, `bearer ${SECRET}`)).toBe(true);
    });
  });

  describe('raw body handling', () => {
    it('accepts any content type', async () => {
      for (const type of ['application/json', 'text/plain', 'application/octet-stream']) {
        const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify({ trackings: [trackingItem()] }), type));
        expect(res.status).toBe(200);
      }
    });

    it('rejects invalid JSON', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, '{nope'));
      expect(res.status).toBe(400);
    });

    it('rejects a body without a trackings array', async () => {
      for (const body of ['{}', '[]', '{"trackings":{}}', '{"trackings":[{}]}', 'null']) {
        const res = await POST(makeRequest({ Authorization: BEARER }, body));
        expect(res.status).toBe(400);
      }
    });
  });

  describe('topics', () => {
    it('handles tracking/events', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify({ trackings: [trackingItem('tracking/events')] })));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Tracking update for 9400115901047177598206: Delivered to the addressee');
    });

    it('handles tracking/pod', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify({ trackings: [trackingItem('tracking/pod')] })));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Proof of delivery for 9400115901047177598206: found');
    });

    it('acknowledges unknown topics', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify({ trackings: [trackingItem('tracking/other')] })));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled topic: tracking/other');
    });

    it('loops over grouped trackings', async () => {
      const body = JSON.stringify({ trackings: [trackingItem('tracking/events'), trackingItem('tracking/events')] });
      const res = await POST(makeRequest({ Authorization: BEARER }, body));
      expect(res.status).toBe(200);
      expect(updates()).toHaveLength(2);
    });
  });

  describe('deduplication', () => {
    it('skips a messageId it has already handled', async () => {
      const body = JSON.stringify({ trackings: [trackingItem('tracking/events', 'dup-1')] });
      expect((await POST(makeRequest({ Authorization: BEARER }, body))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: BEARER }, body))).status).toBe(200);
      expect(updates()).toHaveLength(1);
      expect(logSpy).toHaveBeenCalledWith('Duplicate message dup-1, skipping');
    });
  });
});
