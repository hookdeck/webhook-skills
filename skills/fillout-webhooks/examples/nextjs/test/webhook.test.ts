import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/fillout/route';
import {
  answersById,
  dedupeKey,
  parseFilloutPayload,
  verifyFilloutAuth,
  type FilloutSubmission,
} from '../lib/fillout';

// Fillout issues no signing secret and signs nothing. The token is a random value
// you generate (openssl rand -hex 32) and configure in Fillout as the header
// value "Bearer <token>". Tests send that header instead of a signature.
const TOKEN = 'f3a1c9e7b5d2804611223344556677889900aabbccddeeff0011223344556677';
const AUTH = `Bearer ${TOKEN}`;

let counter = 0;
// Submission object with the field names from Fillout's submission schema.
// Each call gets a fresh submissionId because the route's dedupe Set is shared.
function makeSubmission(): FilloutSubmission {
  counter += 1;
  return {
    submissionId: `6bcedd3a-fe26-4bcb-9ce9-${String(counter).padStart(12, '0')}`,
    submissionTime: '2026-10-21T10:15:30.000Z',
    lastUpdatedAt: '2026-10-21T10:15:30.000Z',
    questions: [
      { id: 'nameQ', name: "What's your name?", type: 'ShortAnswer', value: 'Ada Lovelace' },
      { id: 'emailQ', name: "What's your email?", type: 'EmailInput', value: 'ada@example.com' },
    ],
    calculations: [{ id: 'total', name: 'Total', type: 'number', value: '42' }],
    urlParameters: [{ id: 'utm_source', name: 'utm_source', value: 'newsletter' }],
    scheduling: [
      {
        id: 'sched1',
        name: 'Book a call',
        value: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
          timezone: 'Europe/London',
          eventStartTime: '2026-10-22T09:00:00.000Z',
          eventEndTime: '2026-10-22T09:30:00.000Z',
        },
      },
    ],
    quiz: { score: 3, maxScore: 5 },
  };
}

function makeRequest(body: unknown, auth: string | null = AUTH): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== null) headers.authorization = auth;
  return new NextRequest('http://localhost:3000/webhooks/fillout', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.FILLOUT_WEBHOOK_TOKEN = TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyFilloutAuth', () => {
  it('accepts the exact header value', () => {
    expect(verifyFilloutAuth(AUTH, TOKEN)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyFilloutAuth('Bearer wrong', TOKEN)).toBe(false);
  });

  it('compares the whole value, including the Bearer prefix', () => {
    expect(verifyFilloutAuth(TOKEN, TOKEN)).toBe(false);
    expect(verifyFilloutAuth(`bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(verifyFilloutAuth(`Bearer ${TOKEN} `, TOKEN)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyFilloutAuth(null, TOKEN)).toBe(false);
  });

  it('fails closed when no token is configured', () => {
    expect(verifyFilloutAuth('Bearer ', '')).toBe(false);
    expect(verifyFilloutAuth('Bearer undefined', undefined)).toBe(false);
  });
});

describe('parseFilloutPayload', () => {
  it('recognises a full submission', () => {
    const s = makeSubmission();
    expect(parseFilloutPayload(s as unknown as Record<string, unknown>)).toEqual({
      kind: 'submission',
      submission: s,
    });
  });

  it('unwraps { submission: {...} }', () => {
    const s = makeSubmission();
    expect(parseFilloutPayload({ submission: s })).toEqual({ kind: 'submission', submission: s });
  });

  it('treats a body without questions as an Advanced mode mapped body', () => {
    const mapped = { submissionId: 'abc', email: 'grace@example.com' };
    expect(parseFilloutPayload(mapped)).toEqual({ kind: 'mapped', fields: mapped });
    expect(dedupeKey({ kind: 'mapped', fields: mapped })).toBe('abc');
  });

  it('maps answers by question id', () => {
    expect(answersById(makeSubmission().questions)).toEqual({
      nameQ: 'Ada Lovelace',
      emailQ: 'ada@example.com',
    });
  });
});

describe('POST /webhooks/fillout', () => {
  it('returns 200 for an authenticated full submission', async () => {
    const s = makeSubmission();
    const res = await POST(makeRequest(s));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(s.submissionId),
      expect.objectContaining({ emailQ: 'ada@example.com' })
    );
  });

  it('returns 200 for an authenticated mapped body', async () => {
    const res = await POST(
      makeRequest({ submissionId: 'mapped-1', name: 'Grace Hopper', email: 'grace@example.com' })
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for a submission wrapped in { submission }', async () => {
    const res = await POST(makeRequest({ submission: makeSubmission() }));
    expect(res.status).toBe(200);
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await POST(makeRequest(makeSubmission(), null));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    const res = await POST(makeRequest(makeSubmission(), 'Bearer not-the-token'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for the bare token without the Bearer prefix', async () => {
    const res = await POST(makeRequest(makeSubmission(), TOKEN));
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing, so bad JSON without auth is 401', async () => {
    const res = await POST(makeRequest('{not json', null));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    const res = await POST(makeRequest('[1,2,3]'));
    expect(res.status).toBe(400);
  });

  it('returns 500 when FILLOUT_WEBHOOK_TOKEN is not set', async () => {
    delete process.env.FILLOUT_WEBHOOK_TOKEN;
    const res = await POST(makeRequest(makeSubmission()));
    expect(res.status).toBe(500);
  });

  it('acknowledges a repeated submissionId as a duplicate', async () => {
    const s = makeSubmission();
    expect(await (await POST(makeRequest(s))).json()).toEqual({ received: true });
    const res = await POST(makeRequest(s));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
  });

  it('processes an edited submission (new lastUpdatedAt) again', async () => {
    const s = makeSubmission();
    await POST(makeRequest(s));
    const res = await POST(makeRequest({ ...s, lastUpdatedAt: '2026-10-21T11:00:00.000Z' }));
    expect(await res.json()).toEqual({ received: true });
  });
});
