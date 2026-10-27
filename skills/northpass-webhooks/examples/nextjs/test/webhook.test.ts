import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/northpass/route';
import { verifyNorthpassSignature } from '../lib/verify-northpass';

const HEADER = 'X-Northpass-Hmac-SHA256';
const SECRET = 'test_northpass_shared_secret';

beforeAll(() => {
  process.env.NORTHPASS_WEBHOOK_SECRET = SECRET;
});

// Real signatures: base64 HMAC-SHA256 of the raw body, keyed by the shared secret.
function sign(body: string, secret = SECRET): string {
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
const EVENTS: [string, Record<string, unknown>][] = [
  ['learner_created_events', { included: [PERSON], attributes: { created_at: '2022-04-08T17:55:43Z' }, relationships: rel(false) }],
  ['person_activated_events', { included: [PERSON], attributes: { created_at: '2022-04-08T17:55:43Z' }, relationships: rel(false) }],
  ['learner_enrolled_to_course_events', { included: [PERSON, COURSE], attributes: { created_at: '2022-04-08T17:55:43Z' }, relationships: rel() }],
  ['learner_started_course_events', { included: [PERSON, COURSE], attributes: { created_at: '2022-04-08T17:55:43Z', course_version: 1, course_attempt_number: 1 }, relationships: rel() }],
  ['course_completed_events', { included: [PERSON, COURSE], attributes: { created_at: '2022-04-08T17:58:47Z', course_version: 1, course_attempt_number: 1 }, relationships: rel() }],
  ['quiz_completed_events', { attributes: { value: 90, created_at: '2022-04-08T17:58:00Z', minimum_passing_score: 70, attempts_remaining: 2 }, relationships: rel() }],
  ['course_published_events', { attributes: { published_at: '2024-07-05T11:19:07Z', required_for: 'progressing_learners', version_number: 9 }, relationships: rel() }],
];

let counter = 0;
function samplePayload(type = 'learner_created_events', fields: Record<string, unknown> = EVENTS[0][1]) {
  counter += 1;
  return {
    data: { id: `11111111-1111-1111-1111-${String(counter).padStart(12, '0')}`, type, links: {}, ...fields },
  };
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/northpass', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

function signed(body: string) {
  return makeRequest(body, { [HEADER]: sign(body) });
}

describe('Northpass webhook route', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await POST(signed(JSON.stringify(samplePayload())));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('verifies the exact raw bytes, not re-serialised JSON', async () => {
      const res = await POST(signed('{ "data" : {"id":"e-1",  "type":"learner_created_events"} }\n'));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, { [HEADER]: sign(body) }, 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await POST(makeRequest(JSON.stringify(samplePayload())));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      const res = await POST(makeRequest(JSON.stringify(samplePayload()), { [HEADER]: '' }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, { [HEADER]: sign(body, 'other_secret') }));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body + ' ', { [HEADER]: sign(body) }));
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      const body = JSON.stringify(samplePayload());
      const good = sign(body);
      for (const bad of ['short', good.slice(0, -1), good + 'A', good.replace(/=$/, 'A'), `sha256=${good}`]) {
        const res = await POST(makeRequest(body, { [HEADER]: bad }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects a base64 value that decodes to the same bytes but is not canonical', () => {
      const body = Buffer.from('{"data":{}}');
      const digest = crypto.createHmac('sha256', SECRET).update(body).digest();
      const canonical = digest.toString('base64');
      // The last base64 char before "=" carries 2 unused low bits; set a stray one.
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const stray = canonical.slice(0, 42) + alphabet[alphabet.indexOf(canonical[42]) ^ 1] + '=';
      expect(Buffer.from(stray, 'base64').equals(digest)).toBe(true);
      expect(verifyNorthpassSignature(body, canonical, SECRET)).toBe(true);
      expect(verifyNorthpassSignature(body, stray, SECRET)).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      const body = Buffer.from('{}');
      const sig = sign('{}');
      expect(verifyNorthpassSignature(body, sig, '')).toBe(false);
      expect(verifyNorthpassSignature(body, sig, undefined)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('returns 400 for invalid JSON after verifying the signature', async () => {
      const res = await POST(signed('{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when there is no data object', async () => {
      const res = await POST(signed(JSON.stringify({ foo: 'bar' })));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a signature', async () => {
      const res = await POST(makeRequest('{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (type, fields) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(signed(JSON.stringify(samplePayload(type, fields))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges and logs documented events it does not handle', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(signed(JSON.stringify(samplePayload('learning_path_started_events', { attributes: { attempt_number: 1 } }))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('Unhandled event type: learning_path_started_events'))).toBe(true);
      spy.mockRestore();
    });

    it('de-duplicates on the event id', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('course_completed_events', EVENTS[4][1]));
      const first = await POST(signed(body));
      const second = await POST(signed(body));
      expect(await first.json()).toEqual({ received: true });
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
