import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/surveymethods/route';
import { verifySurveyMethodsSignature } from '../lib/surveymethods';

const SECRET = 'surveymethods_test_signing_secret';

function digest(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
function sign(body: string, secret = SECRET) {
  return 'sha256=' + digest(body, secret);
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/webhooks/surveymethods', {
    method: 'POST',
    headers,
    body,
  });
}

// Shape of the vendor's documented response.completed sample
const completed = JSON.stringify({
  eventId: '6a1f0c3e-2b9d-4f7a-9c51-0e8d2f4b7a10',
  eventType: 'response.completed',
  eventTime: '2026-10-23T10:15:02Z',
  data: {
    surveyId: '12345',
    respondentId: 6789,
    collectorId: 456,
    completedDateTimeUtc: '2026-10-23T10:15:00Z',
    responses: { '910001': '3', '910002': 'Great support team.' },
  },
});
const eventBody = (eventType: string, data: Record<string, unknown> = {}) =>
  JSON.stringify({ eventId: 'evt_1', eventType, eventTime: '2026-10-23T10:15:02Z', data });

beforeAll(() => {
  process.env.SURVEYMETHODS_WEBHOOK_SECRET = SECRET;
});

describe('verifySurveyMethodsSignature', () => {
  const raw = Buffer.from(completed);
  it('accepts a valid signature, with or without the prefix', () => {
    expect(verifySurveyMethodsSignature(raw, sign(completed), SECRET)).toBe(true);
    expect(verifySurveyMethodsSignature(raw, digest(completed), SECRET)).toBe(true);
    expect(verifySurveyMethodsSignature(raw, 'sha256=' + digest(completed).toUpperCase(), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing header, bad hex, wrong length', () => {
    expect(verifySurveyMethodsSignature(raw, sign(completed, 'other'), SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(raw, null, SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(raw, '', SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(raw, 'sha256=' + 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(raw, 'sha256=abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/surveymethods', () => {
  const json = { 'content-type': 'application/json' };

  it.each([
    ['response.completed', completed],
    ['response.created', eventBody('response.created', { surveyId: '12345' })],
    ['survey.created', eventBody('survey.created', { surveyId: '12345' })],
    ['collector.created', eventBody('collector.created', { collectorId: 456 })],
    ['an unknown event', eventBody('something.else')],
  ])('accepts a signed %s', async (_n, body) => {
    const res = await POST(makeRequest(body, { ...json, 'x-surveymethods-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a bare digest with an unusual content type', async () => {
    const res = await POST(
      makeRequest(completed, { 'content-type': 'text/plain', 'x-surveymethods-signature': digest(completed) })
    );
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await POST(makeRequest(completed, json))).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    const res = await POST(makeRequest(completed, { ...json, 'x-surveymethods-signature': sign(completed, 'wrong') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await POST(
      makeRequest(completed.replace('12345', '99999'), { ...json, 'x-surveymethods-signature': sign(completed) })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await POST(makeRequest(bad, { ...json, 'x-surveymethods-signature': sign(bad) }))).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]'])('returns 400 for a signed non-object body %s', async (body) => {
    expect((await POST(makeRequest(body, { ...json, 'x-surveymethods-signature': sign(body) }))).status).toBe(400);
  });
});
