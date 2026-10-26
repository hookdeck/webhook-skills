const request = require('supertest');

// Set test environment variables before importing the app
process.env.REBRANDLY_WEBHOOK_HEADER = 'X-Rebrandly-Secret';
process.env.REBRANDLY_WEBHOOK_SECRET = 'Bearer test_rebrandly_secret_0123456789';

const app = require('../src/index');
const { verifyRebrandlyRequest } = require('../src/index');

const HEADER = process.env.REBRANDLY_WEBHOOK_HEADER;
const SECRET = process.env.REBRANDLY_WEBHOOK_SECRET;

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

function send(method, body = JSON.stringify(CLICKSTREAM), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/rebrandly');
  if (body !== null) req.set('Content-Type', contentType).send(body);
  return req;
}

describe('Rebrandly webhook endpoint', () => {
  describe('credential verification', () => {
    it('accepts the correct header value', async () => {
      const res = await send('post').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, clicks: 1 });
    });

    it('looks the header name up case-insensitively', async () => {
      const res = await send('post').set(HEADER.toUpperCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await send('post').set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyRebrandlyRequest({ 'x-rebrandly-secret': SECRET }, '', HEADER)).toBe(false);
      expect(verifyRebrandlyRequest({ 'x-rebrandly-secret': SECRET }, SECRET, HEADER)).toBe(true);
    });
  });

  describe('methods', () => {
    it.each(['post', 'put', 'patch', 'get', 'delete'])('accepts %s with the credential', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['post', 'put', 'get'])('checks the credential first for %s', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await send('post', JSON.stringify(CLICKSTREAM), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('handles an empty body', async () => {
      const res = await send('get', null).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, clicks: 0 });
    });

    it('loops over every click in data[]', async () => {
      const body = { ...CLICKSTREAM, data: [CLICKSTREAM.data[0], CLICKSTREAM.data[0]] };
      const res = await send('put', JSON.stringify(body)).set(HEADER, SECRET);
      expect(res.body.clicks).toBe(2);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await send('post', '[1]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 when data is not an array', async () => {
      const res = await send('post', JSON.stringify({ data: 'x' })).set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });
});
