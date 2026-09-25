// Generated with: sendgrid-inbound-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Test keys
//
// SendGrid signs with ECDSA on NIST P-256 (prime256v1) + SHA-256. That curve is
// derived from SendGrid's own documented security-policy response key
// (MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmgmjvPAR/...), which decodes to
// "ASN1 OID: prime256v1 / NIST CURVE: P-256".
//
// SENDGRID_INBOUND_PUBLIC_KEY is stored the way the API returns it: base64 DER
// SubjectPublicKeyInfo, with NO PEM armour.
// ---------------------------------------------------------------------------
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const PUBLIC_KEY_B64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

const wrong = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const WRONG_PUBLIC_KEY_B64 = wrong.publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64');

const SIGNATURE_HEADER = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP_HEADER = 'x-twilio-email-event-webhook-timestamp';
const BOUNDARY = 'xYzBoUnDaRy001a11447dc881e40b0537fe6d58';
const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

type RouteModule = typeof import('../app/webhooks/sendgrid-inbound/route');

// ---------------------------------------------------------------------------
// Multipart body builder
//
// Built as BYTES, not a template string, because attachments are binary and
// the whole point of these tests is that the signed bytes survive untouched.
// ---------------------------------------------------------------------------

interface Part {
  name: string;
  value: string | Buffer;
  filename?: string;
  type?: string;
}

function buildMultipart(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let header = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename) header += `; filename="${part.filename}"`;
    header += '\r\n';
    if (part.type) header += `Content-Type: ${part.type}\r\n`;
    header += '\r\n';
    chunks.push(Buffer.from(header, 'utf8'));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value, 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

// A real PNG header: 0x89 'P' 'N' 'G' … These bytes are NOT valid UTF-8, so any
// code path that stringifies the body corrupts them. That is the whole Inbound
// Parse gotcha in eleven bytes.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);

/** DEFAULT data format (send_raw: false), with two attachments. */
function defaultFormatBody(): Buffer {
  return buildMultipart([
    {
      name: 'headers',
      value:
        'From: Sender Name <sender@example.com>\r\n' +
        'Message-ID: <CABQbZKGSEWPBtYVn3W_JUb70n-Oe=fykq@mail.gmail.com>\r\n' +
        'Subject: Different File Types\r\n',
    },
    // Bare string that LOOKS like JSON and is not. JSON.parse throws on it.
    { name: 'dkim', value: '{@sendgrid.com : pass}' },
    { name: 'to', value: 'support@parse.example.com' },
    { name: 'from', value: 'Sender Name <sender@example.com>' },
    { name: 'subject', value: 'Different File Types' },
    { name: 'text', value: "Here's an email with multiple attachments" },
    {
      name: 'html',
      value: '<div dir="ltr">Here&#39;s an email<img src="cid:ii_1562e2169c132d83"></div>',
    },
    { name: 'sender_ip', value: '209.85.223.169' },
    // JSON string. envelope.to is a SINGLE-ELEMENT ARRAY.
    { name: 'envelope', value: '{"to":["support@parse.example.com"],"from":"sender@example.com"}' },
    // A COUNT, as a string — not a list.
    { name: 'attachments', value: '2' },
    {
      name: 'charsets',
      value: '{"to":"UTF-8","from":"UTF-8","subject":"UTF-8","text":"UTF-8","html":"UTF-8"}',
    },
    // Upper-case field name.
    { name: 'SPF', value: 'pass' },
    { name: 'spam_score', value: '0.011' },
    { name: 'spam_report', value: 'Spam detection software... 0.0 HTML_MESSAGE' },
    // Hyphenated field names.
    { name: 'content-ids', value: '{"ii_1562e2169c132d83":"attachment1"}' },
    {
      name: 'attachment-info',
      value:
        '{"attachment1":{"filename":"image.png","name":"image.png","type":"image/png","content-id":"ii_1562e2169c132d83"},' +
        '"attachment2":{"filename":"document.pdf","name":"document.pdf","type":"application/pdf"}}',
    },
    // Each attachment is its own multipart FILE part.
    { name: 'attachment1', value: PNG_BYTES, filename: 'image.png', type: 'image/png' },
    {
      name: 'attachment2',
      value: Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'),
      filename: 'document.pdf',
      type: 'application/pdf',
    },
  ]);
}

/** RAW data format (send_raw: true): one `email` field with the whole MIME message. */
function rawFormatBody(): Buffer {
  return buildMultipart([
    { name: 'dkim', value: '{@sendgrid.com : pass}' },
    {
      name: 'email',
      value:
        'Received: by mx0032p1mdw1.sendgrid.net with SMTP id rOkt2xLLKV\r\n' +
        'Message-ID: <raw-format-message-id@mail.gmail.com>\r\n' +
        'Subject: Raw format\r\n' +
        'Content-Type: text/plain\r\n\r\n' +
        'The whole MIME message lives here.\r\n',
    },
    { name: 'to', value: 'billing@parse.example.com' },
    { name: 'from', value: 'sender@example.com' },
    { name: 'sender_ip', value: '209.85.214.45' },
    { name: 'envelope', value: '{"to":["billing@parse.example.com"],"from":"sender@example.com"}' },
    { name: 'subject', value: 'Raw format' },
    { name: 'charsets', value: '{"to":"UTF-8","from":"UTF-8","subject":"UTF-8"}' },
    { name: 'SPF', value: 'pass' },
  ]);
}

/** Sign exactly the way SendGrid does: timestamp bytes + raw body bytes. */
function sign(rawBody: Buffer, timestamp: string, key: crypto.KeyObject = privateKey): string {
  const signed = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]);
  return crypto.sign('sha256', signed, key).toString('base64');
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

/**
 * Load a fresh copy of the route with a specific environment.
 * The module reads its config once at import time, so each config needs its own
 * module instance.
 */
async function loadRoute(env: Record<string, string> = {}): Promise<RouteModule> {
  vi.resetModules();
  Object.assign(
    process.env,
    {
      SENDGRID_INBOUND_PUBLIC_KEY: PUBLIC_KEY_B64,
      SENDGRID_INBOUND_MAX_AGE_SECONDS: '',
      SENDGRID_INBOUND_REQUIRE_OAUTH: 'false',
      SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS: '',
    },
    env
  );
  return import('../app/webhooks/sendgrid-inbound/route');
}

/** Build the NextRequest the route handler receives. */
function makeRequest(body: Buffer, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/webhooks/sendgrid-inbound', {
    method: 'POST',
    headers: { 'content-type': CONTENT_TYPE, ...headers },
    body: new Uint8Array(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('signature verification', () => {
  it('accepts a valid signature over a default-format body with binary attachments', async () => {
    const route = await loadRoute();
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it('accepts a valid signature over a raw-format (send_raw) body', async () => {
    const route = await loadRoute();
    const body = rawFormatBody();
    const ts = nowSeconds();

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(200);
  });

  it('rejects a signature made with a different key', async () => {
    const route = await loadRoute();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await route.POST(
      makeRequest(body, {
        [SIGNATURE_HEADER]: sign(body, ts, wrong.privateKey),
        [TIMESTAMP_HEADER]: ts,
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' });
  });

  it('rejects when the body is tampered with after signing', async () => {
    const route = await loadRoute();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    const signature = sign(body, ts);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Flip one byte inside the binary attachment.
    const tampered = Buffer.from(body);
    tampered[tampered.indexOf(PNG_BYTES)] ^= 0xff;

    const res = await route.POST(
      makeRequest(tampered, {
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: ts,
      }) as never
    );

    expect(res.status).toBe(400);
  });

  it('rejects when the timestamp is swapped for another value', async () => {
    const route = await loadRoute();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // The timestamp is part of the signed content.
    const res = await route.POST(
      makeRequest(body, {
        [SIGNATURE_HEADER]: sign(body, ts),
        [TIMESTAMP_HEADER]: String(Number(ts) - 1),
      }) as never
    );

    expect(res.status).toBe(400);
  });

  it('rejects when signature headers are absent but a public key is configured', async () => {
    const route = await loadRoute();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await route.POST(makeRequest(defaultFormatBody()) as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing signature headers' });
  });

  it('rejects malformed base64 in the signature header without throwing', async () => {
    const route = await loadRoute();
    const body = defaultFormatBody();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await route.POST(
      makeRequest(body, {
        [SIGNATURE_HEADER]: 'not-a-signature!!!',
        [TIMESTAMP_HEADER]: nowSeconds(),
      }) as never
    );

    expect(res.status).toBe(400);
  });

  it('returns 500, not 200, when a signed request arrives with no key configured', async () => {
    // Misconfiguration on our side — never silently accept.
    const route = await loadRoute({ SENDGRID_INBOUND_PUBLIC_KEY: '' });
    const body = defaultFormatBody();
    const ts = nowSeconds();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(500);
  });

  it('accepts unsigned requests only when no security policy is configured, and warns', async () => {
    // Signing is OPT-IN: with no policy attached, SendGrid sends no signature
    // header at all. That is a legitimate configuration, so accept it loudly.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route = await loadRoute({ SENDGRID_INBOUND_PUBLIC_KEY: '' });

    const res = await route.POST(makeRequest(defaultFormatBody()) as never);

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'));
  });

  it('405s a GET', async () => {
    const route = await loadRoute();
    const res = await route.GET();
    expect(res.status).toBe(405);
  });
});

describe('the raw-body gotcha', () => {
  it('a valid signature FAILS if the body is stringified before verification', async () => {
    // This reproduces the bug in the Node @sendgrid/eventwebhook helper, which
    // does `payload.toString()` internally. That helper is correct for the
    // Event Webhook's JSON body and WRONG for Inbound Parse: an attachment's
    // non-UTF-8 bytes each become U+FFFD, changing the SHA-256.
    const { verifyInboundParseSignature, loadPublicKey } = await loadRoute();
    const key = loadPublicKey(PUBLIC_KEY_B64);
    const body = defaultFormatBody();
    const ts = nowSeconds();
    const signature = sign(body, ts);

    // The correct path: raw bytes.
    expect(verifyInboundParseSignature(body, signature, ts, key)).toBe(true);

    // The broken path: bytes -> string -> bytes.
    const roundTripped = Buffer.from(body.toString('utf8'), 'utf8');
    expect(roundTripped.equals(body)).toBe(false); // lossy, and that is the point
    expect(verifyInboundParseSignature(roundTripped, signature, ts, key)).toBe(false);
  });

  it('accepts a base64 DER key and an equivalent PEM key identically', async () => {
    const { loadPublicKey, verifyInboundParseSignature } = await loadRoute();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    const signature = sign(body, ts);

    const fromDer = loadPublicKey(PUBLIC_KEY_B64);
    const fromPem = loadPublicKey(
      `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY_B64}\n-----END PUBLIC KEY-----\n`
    );

    expect(verifyInboundParseSignature(body, signature, ts, fromDer)).toBe(true);
    expect(verifyInboundParseSignature(body, signature, ts, fromPem)).toBe(true);
  });

  it('loadPublicKey returns null rather than throwing on garbage', async () => {
    const { loadPublicKey } = await loadRoute();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(loadPublicKey('not a key')).toBeNull();
    expect(loadPublicKey('')).toBeNull();
    expect(loadPublicKey(undefined)).toBeNull();
  });

  it('rejects a signature verified against the wrong public key', async () => {
    const { loadPublicKey, verifyInboundParseSignature } = await loadRoute();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    expect(
      verifyInboundParseSignature(body, sign(body, ts), ts, loadPublicKey(WRONG_PUBLIC_KEY_B64))
    ).toBe(false);
  });
});

describe('replay protection (opt-in)', () => {
  it('is disabled by default, so an old but validly signed request is accepted', async () => {
    const route = await loadRoute();
    const body = defaultFormatBody();
    const ts = String(Math.floor(Date.now() / 1000) - 86400);

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(200);
  });

  it('rejects a stale timestamp once a window is configured', async () => {
    const route = await loadRoute({ SENDGRID_INBOUND_MAX_AGE_SECONDS: '300' });
    const body = defaultFormatBody();
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(400);
  });

  it('accepts a fresh timestamp with a window configured', async () => {
    const route = await loadRoute({ SENDGRID_INBOUND_MAX_AGE_SECONDS: '300' });
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(200);
  });
});

describe('OAuth verification (RFC 6750 response contract)', () => {
  const oauthEnv = {
    SENDGRID_INBOUND_PUBLIC_KEY: '',
    SENDGRID_INBOUND_REQUIRE_OAUTH: 'true',
    SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS: 'good-token',
  };

  it('accepts a valid Bearer token', async () => {
    const route = await loadRoute(oauthEnv);
    const res = await route.POST(
      makeRequest(defaultFormatBody(), { authorization: 'Bearer good-token' }) as never
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 and a body containing "invalid_token" for a bad token', async () => {
    // SendGrid CACHES the access token. This exact string is what makes it
    // fetch a fresh one; a bare 401 leaves the stale token cached forever.
    const route = await loadRoute(oauthEnv);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route.POST(
      makeRequest(defaultFormatBody(), { authorization: 'Bearer stale-token' }) as never
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('invalid_token');
  });

  it('returns 400 and "invalid_request" when the Authorization header is absent', async () => {
    const route = await loadRoute(oauthEnv);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route.POST(makeRequest(defaultFormatBody()) as never);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('invalid_request');
  });

  it('returns 400 and "invalid_request" for a malformed Authorization header', async () => {
    const route = await loadRoute(oauthEnv);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route.POST(
      makeRequest(defaultFormatBody(), { authorization: 'Basic Zm9vOmJhcg==' }) as never
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('invalid_request');
  });

  it('maps the three RFC 6750 codes to 400 / 401 / 403', async () => {
    const { OAUTH_ERRORS } = await loadRoute();
    expect(OAUTH_ERRORS).toEqual({
      invalid_request: 400,
      invalid_token: 401,
      insufficient_scope: 403,
    });
  });

  it('hybrid: enforces both OAuth and the signature', async () => {
    const route = await loadRoute({ ...oauthEnv, SENDGRID_INBOUND_PUBLIC_KEY: PUBLIC_KEY_B64 });
    const body = defaultFormatBody();
    const ts = nowSeconds();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const bad = await route.POST(
      makeRequest(body, {
        authorization: 'Bearer good-token',
        [SIGNATURE_HEADER]: sign(body, ts, wrong.privateKey),
        [TIMESTAMP_HEADER]: ts,
      }) as never
    );
    expect(bad.status).toBe(400);

    const good = await route.POST(
      makeRequest(body, {
        authorization: 'Bearer good-token',
        [SIGNATURE_HEADER]: sign(body, ts),
        [TIMESTAMP_HEADER]: ts,
      }) as never
    );
    expect(good.status).toBe(200);
  });
});

describe('payload parsing', () => {
  it('parses the default format, keeping the attachment bytes intact', async () => {
    const { parseMultipart, normalizeInboundEmail } = await loadRoute();
    const { fields, files } = await parseMultipart(defaultFormatBody(), CONTENT_TYPE);
    const email = normalizeInboundEmail(fields, files);

    expect(email.isRaw).toBe(false);

    // envelope is a JSON STRING; envelope.to is a single-element ARRAY.
    expect(email.envelopeTo).toEqual(['support@parse.example.com']);
    expect(email.envelopeFrom).toBe('sender@example.com');

    // `SPF` is upper-case on the wire.
    expect(email.spf).toBe('pass');

    // `dkim` is NOT JSON — it must survive as the bare string it is.
    expect(email.dkim).toBe('{@sendgrid.com : pass}');
    expect(() => JSON.parse(email.dkim as string)).toThrow();

    // `attachments` is a COUNT, not a list.
    expect(email.attachmentCount).toBe(2);

    // Hyphenated field names, parsed from JSON strings.
    expect(email.attachmentInfo.attachment1.filename).toBe('image.png');
    expect(email.attachmentInfo.attachment1['content-id']).toBe('ii_1562e2169c132d83');
    expect(email.contentIds).toEqual({ ii_1562e2169c132d83: 'attachment1' });
    expect(email.charsets.text).toBe('UTF-8');

    // spam_check fields.
    expect(email.spamScore).toBe('0.011');
    expect(email.spamReport).toContain('Spam detection software');

    // The binary attachment round-trips byte-for-byte.
    const png = email.files.find((f) => f.field === 'attachment1')!;
    expect(png.type).toBe('image/png');
    expect(png.filename).toBe('image.png');
    expect(png.buffer.equals(PNG_BYTES)).toBe(true);
    expect(email.files).toHaveLength(2);
  });

  it('parses the raw format and exposes the MIME message', async () => {
    const { parseMultipart, normalizeInboundEmail } = await loadRoute();
    const { fields, files } = await parseMultipart(rawFormatBody(), CONTENT_TYPE);
    const email = normalizeInboundEmail(fields, files);

    expect(email.isRaw).toBe(true);
    expect(email.rawMime).toContain('Subject: Raw format');
    expect(email.envelopeTo).toEqual(['billing@parse.example.com']);

    // Raw mode has none of these fields.
    expect(email.headers).toBeUndefined();
    expect(email.text).toBeUndefined();
    expect(email.html).toBeUndefined();
    expect(email.attachmentInfo).toEqual({});
    expect(email.contentIds).toEqual({});
    expect(email.files).toHaveLength(0);
  });

  it('survives malformed JSON in the JSON-string fields', async () => {
    const { normalizeInboundEmail } = await loadRoute();
    const email = normalizeInboundEmail(
      { envelope: '{not json', charsets: '', 'attachment-info': 'nope' },
      []
    );
    expect(email.envelopeTo).toEqual([]);
    expect(email.charsets).toEqual({});
    expect(email.attachmentInfo).toEqual({});
  });

  it('there is no event-type field to switch on', async () => {
    const { parseMultipart } = await loadRoute();
    const { fields } = await parseMultipart(defaultFormatBody(), CONTENT_TYPE);
    // Inbound Parse has no event vocabulary — route on the recipient instead.
    expect(fields.event).toBeUndefined();
    expect(fields.type).toBeUndefined();
  });

  it('rejects a verified request whose multipart body is unparseable', async () => {
    const route = await loadRoute();
    const body = Buffer.from('this is not multipart at all', 'utf8');
    const ts = nowSeconds();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await route.POST(
      makeRequest(body, { [SIGNATURE_HEADER]: sign(body, ts), [TIMESTAMP_HEADER]: ts }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid multipart body' });
  });
});
