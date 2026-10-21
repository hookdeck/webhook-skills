import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/gravity-forms/route';
import {
  dedupeKey,
  fieldValues,
  parseEntry,
  verifyGravityFormsSecret,
} from '../lib/gravity-forms';

// Gravity Forms issues no signing secret and signs nothing. The secret is a random
// value you generate (openssl rand -hex 32) and add to the webhook feed as the
// Request Header "X-Webhook-Secret". Tests send that header instead of a signature.
const SECRET = 'f3a1c9e7b5d2804611223344556677889900aabbccddeeff0011223344556677';

let counter = 0;
// "All Fields": the entry, keyed by field ID plus entry properties.
// Each call gets a fresh id because the route's dedupe Set is shared.
function makeEntry(): Record<string, string> {
  counter += 1;
  return {
    id: String(100 + counter),
    form_id: '3',
    date_created: '2026-10-21 10:15:30',
    source_url: 'https://example.com/contact/',
    '1': 'Ada Lovelace',
    '2': 'ada@example.com',
    '3.3': 'Ada',
    '3.6': 'Lovelace',
  };
}

function makeRequest(
  body: string,
  {
    headers = { 'X-Webhook-Secret': SECRET },
    contentType = 'application/json',
  }: { headers?: Record<string, string>; contentType?: string } = {}
) {
  return new NextRequest('http://localhost:3000/webhooks/gravity-forms', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

beforeEach(() => {
  process.env.GRAVITY_FORMS_WEBHOOK_SECRET = SECRET;
  delete process.env.GRAVITY_FORMS_WEBHOOK_HEADER;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyGravityFormsSecret', () => {
  it('accepts the exact secret', () => {
    expect(verifyGravityFormsSecret(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyGravityFormsSecret('wrong', SECRET)).toBe(false);
  });

  it('rejects a secret that differs in length or case', () => {
    expect(verifyGravityFormsSecret(`${SECRET}0`, SECRET)).toBe(false);
    expect(verifyGravityFormsSecret(SECRET.toUpperCase(), SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyGravityFormsSecret(null, SECRET)).toBe(false);
  });

  it('fails closed when no secret is configured', () => {
    expect(verifyGravityFormsSecret('', '')).toBe(false);
    expect(verifyGravityFormsSecret('undefined', undefined)).toBe(false);
  });
});

describe('parseEntry', () => {
  it('parses a JSON entry', () => {
    const entry = makeEntry();
    expect(parseEntry(JSON.stringify(entry), 'application/json')).toEqual(entry);
  });

  it('parses a urlencoded (FORM format) entry', () => {
    const entry = makeEntry();
    expect(
      parseEntry(new URLSearchParams(entry).toString(), 'application/x-www-form-urlencoded')
    ).toEqual(entry);
  });

  it('throws on a non-object JSON body', () => {
    expect(() => parseEntry('[1,2]', 'application/json')).toThrow();
  });

  it('extracts field values by field ID', () => {
    expect(fieldValues(makeEntry())).toEqual({
      '1': 'Ada Lovelace',
      '2': 'ada@example.com',
      '3.3': 'Ada',
      '3.6': 'Lovelace',
    });
  });

  it('builds a dedupe key from form_id and id, or null when unmapped', () => {
    expect(dedupeKey({ id: '7', form_id: '3' })).toBe('3:7');
    expect(dedupeKey({ '1': 'x' })).toBeNull();
  });
});

describe('POST /webhooks/gravity-forms', () => {
  it('returns 200 for an authenticated JSON entry', async () => {
    const res = await POST(makeRequest(JSON.stringify(makeEntry())));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for an authenticated urlencoded entry', async () => {
    const res = await POST(
      makeRequest(new URLSearchParams(makeEntry()).toString(), {
        contentType: 'application/x-www-form-urlencoded',
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a Select Fields body with no entry id', async () => {
    const res = await POST(makeRequest(JSON.stringify({ email: 'grace@example.com' })));
    expect(res.status).toBe(200);
  });

  it('returns 401 without the secret header', async () => {
    const res = await POST(makeRequest(JSON.stringify(makeEntry()), { headers: {} }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(
      makeRequest(JSON.stringify(makeEntry()), { headers: { 'X-Webhook-Secret': 'nope' } })
    );
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing, so a bad body without the secret is 401', async () => {
    const res = await POST(makeRequest('{not json', { headers: {} }));
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

  it('returns 500 when GRAVITY_FORMS_WEBHOOK_SECRET is not set', async () => {
    delete process.env.GRAVITY_FORMS_WEBHOOK_SECRET;
    const res = await POST(makeRequest(JSON.stringify(makeEntry())));
    expect(res.status).toBe(500);
  });

  it('honours GRAVITY_FORMS_WEBHOOK_HEADER', async () => {
    process.env.GRAVITY_FORMS_WEBHOOK_HEADER = 'X-Site-Token';
    const body = JSON.stringify(makeEntry());
    expect((await POST(makeRequest(body))).status).toBe(401);
    const good = await POST(makeRequest(body, { headers: { 'X-Site-Token': SECRET } }));
    expect(good.status).toBe(200);
  });

  it('acknowledges a repeated entry id as a duplicate', async () => {
    const body = JSON.stringify(makeEntry());
    expect(await (await POST(makeRequest(body))).json()).toEqual({ received: true });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
  });
});
