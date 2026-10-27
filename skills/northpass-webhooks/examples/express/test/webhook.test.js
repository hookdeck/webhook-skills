const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
const SECRET = 'test_northpass_shared_secret';
process.env.NORTHPASS_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyNorthpassSignature } = require('../src/index');

const HEADER = 'X-Northpass-Hmac-SHA256';

// Real signatures: base64 HMAC-SHA256 of the raw body, keyed by the shared secret.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

const PERSON = {
  id: 'abcdefghi-1234-jklm-5678-nopqrstuvwxy',
  type: 'people',
  attributes: { name: 'Jill Smith', email: 'jillsmith@example.com', created_at: '2022-04-08T17:55:42Z' },
};
const COURSE = { id: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzz', type: 'courses', attributes: { name: 'Intro' } };
const rel = (course = true) => ({
  person: { data: { id: PERSON.id, type: 'people' } },
  ...(course ? { course: { data: { id: COURSE.id, type: 'courses' } } } : {}),
});

// Compact versions of the documented sample payloads: [data.type, data fields]
const EVENTS = [
  ['learner_created_events', { included: [PERSON], attributes: { created_at: '2022-04-08T17:55:43Z' }, relationships: rel(false) }],
  ['person_activated_events', { included: [PERSON], attributes: { created_at: '2022-04-08T17:55:43Z' }, relationships: rel(false) }],
  ['learner_enrolled_to_course_events', { included: [PERSON, COURSE], attributes: { created_at: '2022-04-08T17:55:43Z' }, relationships: rel() }],
  ['learner_started_course_events', { included: [PERSON, COURSE], attributes: { created_at: '2022-04-08T17:55:43Z', course_version: 1, course_attempt_number: 1 }, relationships: rel() }],
  ['course_completed_events', { included: [PERSON, COURSE], attributes: { created_at: '2022-04-08T17:58:47Z', course_version: 1, course_attempt_number: 1 }, relationships: rel() }],
  ['quiz_completed_events', { attributes: { value: 90, created_at: '2022-04-08T17:58:00Z', minimum_passing_score: 70, attempts_remaining: 2 }, relationships: rel() }],
  ['course_published_events', { attributes: { published_at: '2024-07-05T11:19:07Z', required_for: 'progressing_learners', version_number: 9 }, relationships: rel() }],
];

let counter = 0;
function samplePayload(type = 'learner_created_events', fields = EVENTS[0][1]) {
  counter += 1;
  return {
    data: { id: `11111111-1111-1111-1111-${String(counter).padStart(12, '0')}`, type, links: {}, ...fields },
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/northpass').set('Content-Type', contentType).send(body);
}

describe('Northpass webhook endpoint', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body).set(HEADER, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('verifies the exact raw bytes, not re-serialised JSON', async () => {
      const body = '{ "data" : {"id":"e-1",  "type":"learner_created_events"} }\n';
      const res = await post(body).set(HEADER, sign(body));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, 'text/plain').set(HEADER, sign(body));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      const res = await post().set(HEADER, '');
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body).set(HEADER, sign(body, 'other_secret'));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body + ' ').set(HEADER, sign(body));
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      const body = JSON.stringify(samplePayload());
      const good = sign(body);
      for (const bad of ['short', good.slice(0, -1), good + 'A', good.replace(/=$/, 'A'), `sha256=${good}`, good.toLowerCase() === good ? good.toUpperCase() : good.toLowerCase()]) {
        const res = await post(body).set(HEADER, bad);
        expect(res.status).toBe(401);
      }
    });

    it('rejects a base64 value that decodes to the same bytes but is not canonical', () => {
      const body = Buffer.from('{"data":{}}');
      let digest = crypto.createHmac('sha256', SECRET).update(body).digest();
      const canonical = digest.toString('base64');
      // The last base64 char before "=" carries 2 unused low bits; set a stray one.
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const idx = alphabet.indexOf(canonical[42]);
      const stray = canonical.slice(0, 42) + alphabet[idx ^ 1] + '=';
      expect(Buffer.from(stray, 'base64').equals(digest)).toBe(true);
      expect(verifyNorthpassSignature(body, canonical, SECRET)).toBe(true);
      expect(verifyNorthpassSignature(body, stray, SECRET)).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      const body = Buffer.from('{}');
      expect(verifyNorthpassSignature(body, sign(body), '')).toBe(false);
      expect(verifyNorthpassSignature(body, sign(body), undefined)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('returns 400 for invalid JSON after verifying the signature', async () => {
      const body = '{not json';
      const res = await post(body).set(HEADER, sign(body));
      expect(res.status).toBe(400);
    });

    it('returns 400 when there is no data object', async () => {
      const body = JSON.stringify({ foo: 'bar' });
      const res = await post(body).set(HEADER, sign(body));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a signature', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (type, fields) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload(type, fields));
      const res = await post(body).set(HEADER, sign(body));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges and logs documented events it does not handle', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('learning_path_started_events', { attributes: { attempt_number: 1 } }));
      const res = await post(body).set(HEADER, sign(body));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('Unhandled event type: learning_path_started_events'))).toBe(true);
      spy.mockRestore();
    });

    it('de-duplicates on the event id', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('course_completed_events', EVENTS[4][1]));
      const first = await post(body).set(HEADER, sign(body));
      const second = await post(body).set(HEADER, sign(body));
      expect(first.body).toEqual({ received: true });
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
