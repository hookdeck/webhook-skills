import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/rebrandly/route';
import { verifyRebrandlyRequest } from '../lib/verify-rebrandly';

const HEADER = 'X-Rebrandly-Secret';
const SECRET = 'Bearer test_rebrandly_secret_0123456789';

beforeAll(() => {
  process.env.REBRANDLY_WEBHOOK_HEADER = HEADER;
  process.env.REBRANDLY_WEBHOOK_SECRET = SECRET;
});

// Clickstream payload as shown in Rebrandly's docs
const CLICKSTREAM = {
  "data": [
    {
      "timestamp": "2019-07-02T14:07:06.981094Z",
      "client": {
        "language": "pt",
        "location": {
          "country": "br"
        },
        "agent": {
          "browser": {
            "name": "facebook-app",
            "version": "227.0.0.43.158"
          },
          "os": {
            "name": "android",
            "version": "android-9.0-pie"
          },
          "device": {
            "name": "smartphone"
          },
          "type": "human"
        },
        "session": {
          "started": "2019-07-02T14:07:06.981094Z",
          "first": true
        }
      },
      "referral": {
        "hostname": "m.facebook.com",
        "protocol": "http",
        "path": "/",
        "origin": {
          "type": "social",
          "name": "facebook"
        }
      },
      "route": {
        "id": "a1ec86bf91bfe763ad02f602259ea0a9",
        "slashtag": "",
        "creator": {
          "id": "wf09bfww4eb9jkw2844555e1ce9af4f2",
          "workspace": {
            "id": "d88bfe5fgd14b2ghb44538b9aekpw89",
            "name": ""
          }
        },
        "domain": {
          "id": "9a5ae320f3e247ef8c9b6061131bb517",
          "raw": ""
        },
        "destination": {
          "raw": "https://www.yourdestination.com/?utm_source=cs_facebook_post&utm_medium=customersuccess",
          "protocol": "https",
          "hostname": "www.yourdestination.com",
          "path": "/",
          "params": {
            "query": {
              "utm_source": [
                "cs_facebook_post"
              ],
              "utm_medium": [
                "customersuccess"
              ]
            }
          }
        }
      }
    }
  ],
  "key": "abcxyz123"
};

const HANDLERS = { GET, POST, PUT, PATCH, DELETE };

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(CLICKSTREAM)
): NextRequest {
  const hasBody = body !== null && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/rebrandly', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: hasBody ? body : undefined,
  });
}

describe('/webhooks/rebrandly', () => {
  describe('credential verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, clicks: 1 });
    });

    it('looks the header name up case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { [HEADER.toUpperCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyRebrandlyRequest(headers, '', HEADER)).toBe(false);
      expect(verifyRebrandlyRequest(headers, SECRET, HEADER)).toBe(true);
    });
  });

  describe('methods', () => {
    for (const [method, fn] of Object.entries(HANDLERS)) {
      it(`accepts ${method} with the credential`, async () => {
        const res = await fn(makeRequest(method, { [HEADER]: SECRET }));
        expect(res.status).toBe(200);
      });

      it(`checks the credential first for ${method}`, async () => {
        const res = await fn(makeRequest(method));
        expect(res.status).toBe(401);
      });
    }
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = makeRequest('POST', { [HEADER]: SECRET, 'content-type': 'text/plain' });
      expect((await POST(req)).status).toBe(200);
    });

    it('handles an empty body', async () => {
      const res = await PUT(makeRequest('PUT', { [HEADER]: SECRET }, ''));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, clicks: 0 });
    });

    it('loops over every click in data[]', async () => {
      const body = JSON.stringify({ ...CLICKSTREAM, data: [CLICKSTREAM.data[0], CLICKSTREAM.data[0]] });
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, body));
      expect((await res.json()).clicks).toBe(2);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '[1]'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when data is not an array', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '{"data":"x"}'));
      expect(res.status).toBe(400);
    });
  });
});
