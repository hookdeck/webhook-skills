import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import querystring from 'querystring';
import { NextRequest } from 'next/server';

// The per-WebHook "HMAC Key" set in Formstack (API field `hmacSecret`). It is an
// arbitrary string with no vendor prefix — Formstack imposes no format on it.
const TEST_HMAC_KEY = 'fs_test_hmac_key_9f2b41c7';
const WRONG_HMAC_KEY = 'fs_test_hmac_key_deadbeef';

process.env.FORMSTACK_HMAC_KEY = TEST_HMAC_KEY;
delete process.env.FORMSTACK_SIGNATURE_HEADER;

// Import after env vars are set
import { POST, GET, verifyFormstackWebhook } from '../app/webhooks/formstack/route';

/** Sign a raw body exactly as Formstack does: HMAC-SHA256, LOWERCASE HEX. */
function sign(rawBody: string, key: string = TEST_HMAC_KEY): string {
  return crypto.createHmac('sha256', key).update(rawBody).digest('hex');
}

/** The FastSpring encoding, used only to prove we reject it. */
function signBase64(rawBody: string, key: string = TEST_HMAC_KEY): string {
  return crypto.createHmac('sha256', key).update(rawBody).digest('base64');
}

// A realistic urlencoded body: the DEFAULT Formstack content type. Note the exact
// escaping (`+` for spaces, `%40` for `@`) and key order — the digest covers these
// exact bytes.
const URLENCODED_BODY =
  'FormID=1234567&UniqueID=9876543210&Name=Jane+Smith&Email=jane%40example.com&Message=Hello+there';

// The same submission as JSON, matching the shape in the v2025 API reference's
// WebhookOpenApiDefinitionDto example.
const JSON_BODY = JSON.stringify({
  FormID: '1234567',
  UniqueID: '9876543210',
  Name: 'Jane Smith',
  Email: 'jane@example.com',
  Message: 'Hello there',
});

function buildRequest(
  rawBody: string,
  signature?: string,
  contentType = 'application/x-www-form-urlencoded',
  headerName = 'X-FS-Signature'
): NextRequest {
  const headers = new Headers({ 'content-type': contentType });
  if (signature !== undefined) {
    headers.set(headerName, signature);
  }
  return new NextRequest('https://example.com/webhooks/formstack', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('verifyFormstackWebhook', () => {
  it('accepts a valid lowercase hex digest over a urlencoded body', () => {
    expect(verifyFormstackWebhook(URLENCODED_BODY, sign(URLENCODED_BODY), TEST_HMAC_KEY)).toBe(true);
  });

  it('accepts a valid digest over a JSON body', () => {
    expect(verifyFormstackWebhook(JSON_BODY, sign(JSON_BODY), TEST_HMAC_KEY)).toBe(true);
  });

  it('accepts a Buffer body identically to a string body', () => {
    const buf = Buffer.from(URLENCODED_BODY, 'utf8');
    expect(verifyFormstackWebhook(buf, sign(URLENCODED_BODY), TEST_HMAC_KEY)).toBe(true);
  });

  it('accepts a `sha256=`-prefixed digest', () => {
    expect(
      verifyFormstackWebhook(URLENCODED_BODY, `sha256=${sign(URLENCODED_BODY)}`, TEST_HMAC_KEY)
    ).toBe(true);
  });

  it('strips the prefix case-insensitively', () => {
    expect(
      verifyFormstackWebhook(URLENCODED_BODY, `SHA256=${sign(URLENCODED_BODY)}`, TEST_HMAC_KEY)
    ).toBe(true);
  });

  it('accepts an uppercase hex digest (case is normalised)', () => {
    expect(
      verifyFormstackWebhook(URLENCODED_BODY, sign(URLENCODED_BODY).toUpperCase(), TEST_HMAC_KEY)
    ).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(
      verifyFormstackWebhook(URLENCODED_BODY, `  sha256=${sign(URLENCODED_BODY)}  `, TEST_HMAC_KEY)
    ).toBe(true);
  });

  it('rejects a digest computed with a different key', () => {
    expect(
      verifyFormstackWebhook(URLENCODED_BODY, sign(URLENCODED_BODY, WRONG_HMAC_KEY), TEST_HMAC_KEY)
    ).toBe(false);
  });

  it('rejects a digest computed over a different body', () => {
    expect(verifyFormstackWebhook(URLENCODED_BODY, sign('FormID=999'), TEST_HMAC_KEY)).toBe(false);
  });

  // Guards against importing FastSpring's scheme — same header name, base64 digest.
  it('rejects a base64 digest of the same body (Formstack is hex, FastSpring is base64)', () => {
    expect(verifyFormstackWebhook(URLENCODED_BODY, signBase64(URLENCODED_BODY), TEST_HMAC_KEY)).toBe(
      false
    );
  });

  it('rejects a truncated digest without throwing on length mismatch', () => {
    const truncated = sign(URLENCODED_BODY).slice(0, 20);
    expect(() => verifyFormstackWebhook(URLENCODED_BODY, truncated, TEST_HMAC_KEY)).not.toThrow();
    expect(verifyFormstackWebhook(URLENCODED_BODY, truncated, TEST_HMAC_KEY)).toBe(false);
  });

  // FAIL CLOSED. Signing is optional in Formstack, which makes an "accept when
  // unconfigured" fallback tempting. It must never exist.
  it('fails closed when no key is configured', () => {
    expect(verifyFormstackWebhook(URLENCODED_BODY, sign(URLENCODED_BODY), undefined)).toBe(false);
    expect(verifyFormstackWebhook(URLENCODED_BODY, sign(URLENCODED_BODY), '')).toBe(false);
  });

  it('fails closed when no signature header is present', () => {
    expect(verifyFormstackWebhook(URLENCODED_BODY, null, TEST_HMAC_KEY)).toBe(false);
    expect(verifyFormstackWebhook(URLENCODED_BODY, '', TEST_HMAC_KEY)).toBe(false);
  });
});

describe('the raw-body trap for urlencoded payloads', () => {
  // This is the single most likely place a Formstack implementation goes wrong.
  it('rejects a digest computed over a RE-ENCODED parsed body', () => {
    const parsed = Object.fromEntries(new URLSearchParams(URLENCODED_BODY));
    // Serializers disagree about how to escape a space: the wire bytes used `+`, and
    // Node's stdlib querystring emits `%20`. Same fields, different bytes.
    const reEncoded = querystring.stringify(parsed);

    expect(reEncoded).not.toBe(URLENCODED_BODY);
    expect(sign(reEncoded)).not.toBe(sign(URLENCODED_BODY));
    expect(verifyFormstackWebhook(URLENCODED_BODY, sign(reEncoded), TEST_HMAC_KEY)).toBe(false);
  });

  it('rejects a digest computed over a reordered body with identical fields', () => {
    const reordered =
      'Message=Hello+there&Email=jane%40example.com&Name=Jane+Smith&UniqueID=9876543210&FormID=1234567';
    expect(Object.fromEntries(new URLSearchParams(reordered))).toEqual(
      Object.fromEntries(new URLSearchParams(URLENCODED_BODY))
    );
    expect(verifyFormstackWebhook(URLENCODED_BODY, sign(reordered), TEST_HMAC_KEY)).toBe(false);
  });

  it('rejects a digest computed over a re-serialized JSON body', () => {
    const reSerialized = JSON.stringify(JSON.parse(JSON_BODY), null, 2);
    expect(verifyFormstackWebhook(JSON_BODY, sign(reSerialized), TEST_HMAC_KEY)).toBe(false);
  });
});

describe('POST /webhooks/formstack', () => {
  it('accepts a signed urlencoded submission (the default content type)', async () => {
    const res = await POST(buildRequest(URLENCODED_BODY, sign(URLENCODED_BODY)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed JSON submission', async () => {
    const res = await POST(buildRequest(JSON_BODY, sign(JSON_BODY), 'application/json'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a `sha256=`-prefixed delivery', async () => {
    const res = await POST(buildRequest(URLENCODED_BODY, `sha256=${sign(URLENCODED_BODY)}`));

    expect(res.status).toBe(200);
  });

  it('accepts a payload whose field keys are numeric field IDs', async () => {
    // postDataFieldKeys: field_ids — the format you should use when labels may repeat.
    const body = 'FormID=1234567&UniqueID=9876543211&12345678=Jane+Smith&12345679=jane%40example.com';
    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
  });

  it('accepts a submission with no UniqueID (falls back to a body hash for idempotency)', async () => {
    const body = 'FormID=1234567&Name=Jane+Smith';
    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
  });

  it('accepts a submission from an unrecognised form', async () => {
    // No event types exist; the discriminator is FormID, and an unknown form must
    // still get a 2xx.
    const body = 'FormID=555&UniqueID=1&Anything=Goes';
    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects an invalid signature with 400', async () => {
    const res = await POST(buildRequest(URLENCODED_BODY, sign(URLENCODED_BODY, WRONG_HMAC_KEY)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a missing signature header with 400', async () => {
    const res = await POST(buildRequest(URLENCODED_BODY));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing signature header' });
  });

  it('rejects a tampered body with 400', async () => {
    const tampered = URLENCODED_BODY.replace('Jane+Smith', 'Mallory');
    const res = await POST(buildRequest(tampered, sign(URLENCODED_BODY)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a base64 digest with 400', async () => {
    const res = await POST(buildRequest(URLENCODED_BODY, signBase64(URLENCODED_BODY)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('rejects invalid JSON that is correctly signed with 400', async () => {
    const body = 'not json at all';
    const res = await POST(buildRequest(body, sign(body), 'application/json'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid payload' });
  });

  it('rejects an unsupported content type with 400', async () => {
    const body = 'plain text body';
    const res = await POST(buildRequest(body, sign(body), 'text/plain'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid payload' });
  });
});

describe('fail-closed configuration', () => {
  afterEach(() => {
    process.env.FORMSTACK_HMAC_KEY = TEST_HMAC_KEY;
  });

  it('returns 500 rather than accepting when FORMSTACK_HMAC_KEY is unset', async () => {
    delete process.env.FORMSTACK_HMAC_KEY;

    const res = await POST(buildRequest(URLENCODED_BODY, sign(URLENCODED_BODY)));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
  });

  it('returns 500 rather than accepting when FORMSTACK_HMAC_KEY is empty', async () => {
    process.env.FORMSTACK_HMAC_KEY = '';

    const res = await POST(buildRequest(URLENCODED_BODY, sign(URLENCODED_BODY)));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
  });
});

describe('custom HMAC header', () => {
  // The WebHook's "Custom HMAC Header" field overrides X-FS-Signature. Hardcoding the
  // header name breaks the moment someone fills that field in.
  afterEach(() => {
    delete process.env.FORMSTACK_SIGNATURE_HEADER;
  });

  it('reads the digest from the configured header name', async () => {
    process.env.FORMSTACK_SIGNATURE_HEADER = 'x-my-custom-sig';

    const res = await POST(
      buildRequest(
        URLENCODED_BODY,
        sign(URLENCODED_BODY),
        'application/x-www-form-urlencoded',
        'X-My-Custom-Sig'
      )
    );

    expect(res.status).toBe(200);
  });

  it('ignores the default header once a custom one is configured', async () => {
    process.env.FORMSTACK_SIGNATURE_HEADER = 'x-my-custom-sig';

    const res = await POST(buildRequest(URLENCODED_BODY, sign(URLENCODED_BODY)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing signature header' });
  });

  it('is case-insensitive about the configured name', async () => {
    process.env.FORMSTACK_SIGNATURE_HEADER = 'X-My-Custom-Sig';

    const res = await POST(
      buildRequest(
        URLENCODED_BODY,
        sign(URLENCODED_BODY),
        'application/x-www-form-urlencoded',
        'x-my-custom-sig'
      )
    );

    expect(res.status).toBe(200);
  });
});

describe('GET /webhooks/formstack', () => {
  it('returns ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', endpoint: 'formstack-webhooks' });
  });
});

// Two real deliveries captured from a Formstack Forms WebHook on 2026-09-25, byte for
// byte. These are the only vectors here that Formstack signed rather than this suite:
// they pin the digest format (HMAC-SHA256, lowercase hex, `sha256=`-prefixed) to what
// Formstack actually sends. The HMAC Key was `test` for the first and `test1` for the
// second, while the Shared Secret stayed `test` — which is why `HandshakeKey=test`
// appears in both bodies.
const CAPTURED_DELIVERIES = [
  {
    hmacKey: 'test',
    body: 'FormID=6606394&UniqueID=1500877919&HandshakeKey=test',
    signature: 'sha256=54bc5cf9f57b9a1083c7e53d734cb0586933146ba6b2150e888a827dfb468ea7',
  },
  {
    hmacKey: 'test1',
    body: 'FormID=6606394&UniqueID=1500878955&HandshakeKey=test',
    signature: 'sha256=30dff7f180b6d69eab397a5d51719474df490b730514c253e8b5832d3b51b970',
  },
];

describe('real captured Formstack deliveries', () => {
  it.each(CAPTURED_DELIVERIES)('verifies the delivery signed with HMAC Key $hmacKey', ({ hmacKey, body, signature }) => {
    expect(verifyFormstackWebhook(body, signature, hmacKey)).toBe(true);
  });

  it('rejects the second delivery under the first key (the key change is visible)', () => {
    const [first, second] = CAPTURED_DELIVERIES;
    expect(verifyFormstackWebhook(second.body, second.signature, first.hmacKey)).toBe(false);
  });

  it('accepts the captured delivery end to end with its own content type', async () => {
    const { hmacKey, body, signature } = CAPTURED_DELIVERIES[1];
    const saved = process.env.FORMSTACK_HMAC_KEY;
    process.env.FORMSTACK_HMAC_KEY = hmacKey;
    try {
      const res = await POST(buildRequest(body, signature, 'application/x-www-form-urlencoded; charset=utf-8'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    } finally {
      process.env.FORMSTACK_HMAC_KEY = saved;
    }
  });
});
