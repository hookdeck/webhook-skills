import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/datacake/route';
import { verifyDatacakeRequest } from '../lib/verify-datacake';

// The secret is the exact, whole header value, including the "Bearer " the user typed in Datacake.
const SECRET = 'Bearer test_datacake_secret_0123456789';

// Payloads follow the samples in Datacake's outgoing webhook docs.
const PAYLOADS: Record<string, unknown> = {
  device_measurement: {
    data: [
      { field: 'TEMPERATURE', value: 19.141228, device: 'f7384fd1-9e7f-4540-b4ed-5fa5810bcc27', timestamp: 1647852981 },
      { field: 'HUMIDITY', value: 66.95572, device: 'f7384fd1-9e7f-4540-b4ed-5fa5810bcc27', timestamp: 1647852981 },
      { field: 'ORIENTATION', value: '', device: 'f7384fd1-9e7f-4540-b4ed-5fa5810bcc27', timestamp: 1647852980 },
    ],
    event: 'device_measurement',
  },
  decoder_output: {
    data: {
      log: null,
      device: null,
      result: [
        { field: 'TOWER_LOCATION', value: '(34.492523,136.171631)', device: 'dev:864475044240892' },
        { field: 'RSSI', device: 'dev:864475044240892' },
        { field: 'PM25', value: 4.88, device: 'dev:864475044240892' },
      ],
      product: 'ef6275c7-3e9b-4134-9bef-24bc276a9592',
      execution_time: 664535,
    },
    event: 'decoder_output',
  },
  downlink: {
    data: {
      meta: { type: 'lorawan', fport: 1, downlink: 'a6895656-8198-41fe-9c0e-f49074311190' },
      device: 'a52e6324-2cf9-4534-b523-819d94299414',
      payload: 'AQI=',
      product_id: '4e8e8623-18c4-4798-9877-699058a00e24',
      product_slug: 'temperatur-dach',
    },
    event: 'downlink',
  },
};

beforeAll(() => {
  process.env.DATACAKE_WEBHOOK_HEADER = 'Authorization';
  process.env.DATACAKE_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(PAYLOADS.device_measurement),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/datacake', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/datacake', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value and does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects an empty header value', async () => {
      const res = await POST(makeRequest({ Authorization: '' }));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('verifyDatacakeRequest', () => {
    it('reads a custom header name', () => {
      expect(verifyDatacakeRequest(new Headers({ 'x-datacake-token': 'abc123' }), 'X-Datacake-Token', 'abc123')).toBe(true);
      expect(verifyDatacakeRequest(new Headers({ authorization: 'abc123' }), 'X-Datacake-Token', 'abc123')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.DATACAKE_WEBHOOK_HEADER;
      delete process.env.DATACAKE_WEBHOOK_HEADER;
      try {
        expect(verifyDatacakeRequest(new Headers({ authorization: SECRET }))).toBe(true);
      } finally {
        process.env.DATACAKE_WEBHOOK_HEADER = saved;
      }
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyDatacakeRequest(new Headers({ authorization: 'anything' }), 'Authorization', undefined)).toBe(false);
      expect(verifyDatacakeRequest(new Headers({ authorization: '' }), 'Authorization', '')).toBe(false);
    });
  });

  describe('event handling', () => {
    for (const [event, payload] of Object.entries(PAYLOADS)) {
      it(`handles ${event}`, async () => {
        const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(payload)));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
      });
    }

    it('acknowledges unknown events', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ event: 'something_new', data: {} })));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(PAYLOADS.downlink), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('tolerates a decoder_output with no result array', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ event: 'decoder_output', data: {} })));
      expect(res.status).toBe(200);
    });
  });

  describe('body validation', () => {
    it('rejects invalid JSON', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[]'));
      expect(res.status).toBe(400);
    });

    it('rejects an empty body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, ''));
      expect(res.status).toBe(400);
    });
  });
});
