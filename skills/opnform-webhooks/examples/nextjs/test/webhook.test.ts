import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// OpnForm webhook secrets are chosen by the user (12+ characters); this one is only for tests
const SECRET = 'test_opnform_secret_5f0c1a7e';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.OPNFORM_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/opnform/route'));
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.OPNFORM_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Based on the submission sample in OpnForm's webhook docs
const payload = {
  form_id: 123,
  form_title: 'Contact Form',
  form_slug: 'contact-form',
  submission_id: 456,
  edit_link: 'https://opnform.com/forms/contact-form?submission_id=example',
  submission: { Name: 'Jane Doe' },
  data: { 'field-id': { value: 'Jane Doe', name: 'Name', type: 'text' } },
  meta: { attribution: { utm_source: 'newsletter', utm_campaign: 'summer-launch' } },
};
const body = JSON.stringify(payload);

const digest = (b: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(b).digest('hex');
// Matches OpnForm's header format: sha256=<hex>
const sign = (b: string, secret = SECRET) => `sha256=${digest(b, secret)}`;

function send(
  b: string,
  signature?: string,
  contentType = 'application/json'
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return POST(
    new NextRequest('http://localhost/webhooks/opnform', { method: 'POST', headers, body: b })
  );
}

describe('OpnForm webhook', () => {
  it('accepts a valid sha256= signature', async () => {
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the bare digest without the prefix', async () => {
    expect((await send(body, digest(body))).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    expect((await send(body, `sha256=${digest(body).toUpperCase()}`)).status).toBe(200);
  });

  it('verifies any content type against the raw bytes', async () => {
    expect((await send(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes, not a re-serialized body', async () => {
    const pretty = JSON.stringify(payload, null, 2);
    expect((await send(pretty, sign(pretty))).status).toBe(200);
    expect((await send(pretty, sign(body))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await send(body)).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await send(body, '')).status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    expect((await send(body, sign(body, 'another_secret_value'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const tampered = JSON.stringify({ ...payload, submission_id: 457 });
    expect((await send(tampered, sign(body))).status).toBe(401);
  });

  it.each([
    ['prefix only', 'sha256='],
    ['too short', 'sha256=abcd'],
    ['too long', `sha256=${digest(body)}00`],
    ['non-hex characters', `sha256=${'z'.repeat(64)}`],
    ['wrong prefix', `sha1=${digest(body)}`],
    ['base64 digest', `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('base64')}`],
  ])('rejects a malformed signature (%s)', async (_name, header) => {
    expect((await send(body, header)).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.OPNFORM_WEBHOOK_SECRET;
    expect((await send(body, sign(body))).status).toBe(500);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    expect((await send('not json', sign('not json'))).status).toBe(400);
  });

  it.each([['an array', '[1,2]'], ['null', 'null'], ['a string', '"hi"']])(
    'returns 400 when the signed JSON is %s',
    async (_name, raw) => {
      expect((await send(raw, sign(raw))).status).toBe(400);
    }
  );

  it('does not 500 on wrong-typed fields', async () => {
    const odd = JSON.stringify({
      form_id: { a: 1 },
      form_title: 42,
      submission_id: [1],
      submission: 'a string',
      data: [],
      meta: 'x',
    });
    expect((await send(odd, sign(odd))).status).toBe(200);
  });

  it('does not 500 on an empty object', async () => {
    expect((await send('{}', sign('{}'))).status).toBe(200);
  });
});
