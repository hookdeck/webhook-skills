const request = require('supertest');

// Set test environment variables before importing the app
process.env.EMARSYS_WEBHOOK_USERNAME = 'emarsys-hook';
process.env.EMARSYS_WEBHOOK_PASSWORD = 'p4ss:word/with+colon';

const app = require('../src/index');
const { verifyEmarsysRequest, seenDeduplicationIds } = require('../src/index');

const USER = process.env.EMARSYS_WEBHOOK_USERNAME;
const PASS = process.env.EMARSYS_WEBHOOK_PASSWORD;

function basic(user = USER, pass = PASS) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

// Illustrative payloads: the real body is defined by the Webhook node preset.
function contactPayload(overrides = {}) {
  return {
    email: 'jane@example.com',
    first_name: 'Jane',
    campaign_name: 'spring-sale', // "Additional data" static key-value
    deduplication_id: 'dd-1',
    ems_program_id: 4242,
    event_time: '2026-10-25T12:00:00Z',
    ...overrides,
  };
}

function post(body = JSON.stringify(contactPayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/emarsys').set('Content-Type', contentType).send(body);
}

beforeEach(() => seenDeduplicationIds.clear());

describe('Emarsys webhook endpoint', () => {
  describe('HTTP Basic authentication', () => {
    it('accepts correct credentials', async () => {
      const res = await post().set('Authorization', basic());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('treats the scheme as case-insensitive', async () => {
      const header = basic().replace('Basic', 'bAsIc');
      const res = await post().set('Authorization', header);
      expect(res.status).toBe(200);
    });

    it('splits on the first colon (password may contain colons)', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts a non-ASCII password when configured', () => {
      expect(verifyEmarsysRequest({ authorization: basic('u', 'pässwörd') }, 'u', 'pässwörd')).toBe(true);
      expect(verifyEmarsysRequest({ authorization: basic('u', 'pässwörd') }, 'u', 'password')).toBe(false);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the wrong username', async () => {
      const res = await post().set('Authorization', basic('someone-else', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects the wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username and password of different lengths without throwing', async () => {
      const res = await post().set('Authorization', basic('x', 'y'.repeat(200)));
      expect(res.status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const valid = basic().slice('Basic '.length);
      for (const junk of ['!!', 'AAAA', '=', ' extra']) {
        const res = await post().set('Authorization', `Basic ${valid}${junk}`);
        expect(res.status).toBe(401);
      }
    });

    it('rejects non-base64 and non-canonical base64', async () => {
      for (const value of ['Basic %%%%', 'Basic', 'Basic ', 'Basic YQ', 'Basic YR==']) {
        const res = await post().set('Authorization', value);
        expect(res.status).toBe(401);
      }
    });

    it('rejects credentials without a colon', async () => {
      const header = 'Basic ' + Buffer.from('nocolon').toString('base64');
      const res = await post().set('Authorization', header);
      expect(res.status).toBe(401);
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyEmarsysRequest({ authorization: basic('', '') }, '', '')).toBe(false);
      expect(verifyEmarsysRequest({ authorization: basic() }, null, null)).toBe(false);
    });

    it('does not authenticate before the body is parsed (401 beats 406)', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(contactPayload()), 'text/plain').set('Authorization', basic());
      expect(res.status).toBe(200);
    });

    it('handles a payload with event_data', async () => {
      const body = contactPayload({ event_data: { order_id: 'A-1', total: 99.5 } });
      const res = await post(JSON.stringify(body)).set('Authorization', basic());
      expect(res.status).toBe(200);
    });

    it('handles a payload without deduplication_id', async () => {
      const { deduplication_id, ...rest } = contactPayload();
      const res = await post(JSON.stringify(rest)).set('Authorization', basic());
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBeUndefined();
    });

    it('returns 406 (discard contact) for invalid JSON', async () => {
      const res = await post('not json').set('Authorization', basic());
      expect(res.status).toBe(406);
    });

    it('returns 406 for a JSON body that is not an object', async () => {
      const res = await post('[1,2]').set('Authorization', basic());
      expect(res.status).toBe(406);
    });
  });

  describe('idempotency', () => {
    it('acknowledges a repeated deduplication_id without reprocessing', async () => {
      const first = await post().set('Authorization', basic());
      const second = await post().set('Authorization', basic());
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });

    it('processes different deduplication_ids separately', async () => {
      await post().set('Authorization', basic());
      const res = await post(JSON.stringify(contactPayload({ deduplication_id: 'dd-2' })))
        .set('Authorization', basic());
      expect(res.body).toEqual({ received: true });
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
