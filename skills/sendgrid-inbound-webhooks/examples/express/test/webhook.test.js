// Generated with: sendgrid-inbound-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

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

const SIGNATURE_HEADER = 'X-Twilio-Email-Event-Webhook-Signature';
const TIMESTAMP_HEADER = 'X-Twilio-Email-Event-Webhook-Timestamp';
const BOUNDARY = 'xYzBoUnDaRy001a11447dc881e40b0537fe6d58';
const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

// ---------------------------------------------------------------------------
// Multipart body builder
//
// Built as BYTES, not as a template string, because attachments are binary and
// the whole point of these tests is that the signed bytes survive untouched.
// ---------------------------------------------------------------------------

/**
 * @param {Array<{name: string, value: string|Buffer, filename?: string, type?: string}>} parts
 * @returns {Buffer}
 */
function buildMultipart(parts) {
  const chunks = [];
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

// A real PNG header: 0x89 'P' 'N' 'G' ... These bytes are NOT valid UTF-8, so
// any code path that stringifies the body corrupts them. That is the whole
// Inbound Parse gotcha in six bytes.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);

/** DEFAULT data format (send_raw: false), with two attachments. */
function defaultFormatBody() {
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
    {
      name: 'envelope',
      value: '{"to":["support@parse.example.com"],"from":"sender@example.com"}',
    },
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
function rawFormatBody() {
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
    {
      name: 'envelope',
      value: '{"to":["billing@parse.example.com"],"from":"sender@example.com"}',
    },
    { name: 'subject', value: 'Raw format' },
    { name: 'charsets', value: '{"to":"UTF-8","from":"UTF-8","subject":"UTF-8"}' },
    { name: 'SPF', value: 'pass' },
  ]);
}

/** Sign exactly the way SendGrid does: timestamp bytes + raw body bytes. */
function sign(rawBody, timestamp, key = privateKey) {
  const signed = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBody]);
  return crypto.sign('sha256', signed, key).toString('base64');
}

function nowSeconds() {
  return String(Math.floor(Date.now() / 1000));
}

/**
 * Load a fresh copy of the handler with a specific environment.
 * The module reads its config once at require time, so each config needs its
 * own module instance.
 */
function loadApp(env = {}) {
  jest.resetModules();
  const defaults = {
    SENDGRID_INBOUND_PUBLIC_KEY: PUBLIC_KEY_B64,
    SENDGRID_INBOUND_MAX_AGE_SECONDS: '',
    SENDGRID_INBOUND_REQUIRE_OAUTH: 'false',
    SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS: '',
  };
  Object.assign(process.env, defaults, env);
  return require('../src');
}

/** POST a pre-built body with the given headers. */
function post(app, body, headers = {}) {
  const req = request(app)
    .post('/webhooks/sendgrid-inbound')
    .set('Content-Type', CONTENT_TYPE);
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(body);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('signature verification', () => {
  it('accepts a valid signature over a default-format body with binary attachments', async () => {
    const { app } = loadApp();
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a valid signature over a raw-format (send_raw) body', async () => {
    const { app } = loadApp();
    const body = rawFormatBody();
    const ts = nowSeconds();

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(200);
  });

  it('rejects a signature made with a different key', async () => {
    const { app } = loadApp();
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts, wrong.privateKey),
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects when the body is tampered with after signing', async () => {
    const { app } = loadApp();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    const signature = sign(body, ts);

    // Flip one byte inside the binary attachment.
    const tampered = Buffer.from(body);
    tampered[tampered.indexOf(PNG_BYTES)] ^= 0xff;

    const res = await post(app, tampered, {
      [SIGNATURE_HEADER]: signature,
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(400);
  });

  it('rejects when the timestamp is swapped for another value', async () => {
    const { app } = loadApp();
    const body = defaultFormatBody();
    const ts = nowSeconds();

    // The timestamp is part of the signed content, so substituting it must fail.
    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: String(Number(ts) - 1),
    });

    expect(res.status).toBe(400);
  });

  it('rejects when signature headers are absent but a public key is configured', async () => {
    const { app } = loadApp();

    const res = await post(app, defaultFormatBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing signature headers');
  });

  it('rejects malformed base64 in the signature header without throwing', async () => {
    const { app } = loadApp();
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: 'not-a-signature!!!',
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('returns 500, not 200, when a signed request arrives with no key configured', async () => {
    // Misconfiguration on our side — never silently accept.
    const { app } = loadApp({ SENDGRID_INBOUND_PUBLIC_KEY: '' });
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(500);
  });

  it('accepts unsigned requests only when no security policy is configured, and warns', async () => {
    // Signing is OPT-IN: with no policy attached, SendGrid sends no signature
    // header at all. That is a legitimate configuration, so accept it loudly.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = loadApp({ SENDGRID_INBOUND_PUBLIC_KEY: '' });

    const res = await post(app, defaultFormatBody());

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'));
  });
});

describe('the raw-body gotcha', () => {
  it('a valid signature FAILS if the body is stringified before verification', () => {
    // This reproduces the bug in the Node @sendgrid/eventwebhook helper, which
    // does `payload.toString()` internally. That helper is correct for the
    // Event Webhook's JSON body and WRONG for Inbound Parse: an attachment's
    // non-UTF-8 bytes each become U+FFFD, changing the SHA-256.
    const { verifyInboundParseSignature, loadPublicKey } = loadApp();
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

  it('accepts a base64 DER key and an equivalent PEM key identically', () => {
    const { loadPublicKey, verifyInboundParseSignature } = loadApp();
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

  it('loadPublicKey returns null rather than throwing on garbage', () => {
    const { loadPublicKey } = loadApp();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(loadPublicKey('not a key')).toBeNull();
    expect(loadPublicKey('')).toBeNull();
    expect(loadPublicKey(undefined)).toBeNull();
  });

  it('rejects a signature verified against the wrong public key', () => {
    const { loadPublicKey, verifyInboundParseSignature } = loadApp();
    const body = defaultFormatBody();
    const ts = nowSeconds();
    expect(
      verifyInboundParseSignature(body, sign(body, ts), ts, loadPublicKey(WRONG_PUBLIC_KEY_B64))
    ).toBe(false);
  });
});

describe('replay protection (opt-in)', () => {
  it('is disabled by default, so an old but validly signed request is accepted', async () => {
    const { app } = loadApp();
    const body = defaultFormatBody();
    const ts = String(Math.floor(Date.now() / 1000) - 86400);

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(200);
  });

  it('rejects a stale timestamp once a window is configured', async () => {
    const { app } = loadApp({ SENDGRID_INBOUND_MAX_AGE_SECONDS: '300' });
    const body = defaultFormatBody();
    const ts = String(Math.floor(Date.now() / 1000) - 3600);

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });

    expect(res.status).toBe(400);
  });

  it('accepts a fresh timestamp with a window configured', async () => {
    const { app } = loadApp({ SENDGRID_INBOUND_MAX_AGE_SECONDS: '300' });
    const body = defaultFormatBody();
    const ts = nowSeconds();

    const res = await post(app, body, {
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });

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
    const { app } = loadApp(oauthEnv);
    const res = await post(app, defaultFormatBody(), { Authorization: 'Bearer good-token' });
    expect(res.status).toBe(200);
  });

  it('returns 401 and a body containing "invalid_token" for a bad token', async () => {
    // SendGrid CACHES the access token. This exact string is what makes it
    // fetch a fresh one; a bare 401 leaves the stale token cached forever.
    const { app } = loadApp(oauthEnv);
    const res = await post(app, defaultFormatBody(), { Authorization: 'Bearer stale-token' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('invalid_token');
  });

  it('returns 400 and "invalid_request" when the Authorization header is absent', async () => {
    const { app } = loadApp(oauthEnv);
    const res = await post(app, defaultFormatBody());
    expect(res.status).toBe(400);
    expect(res.text).toContain('invalid_request');
  });

  it('returns 400 and "invalid_request" for a malformed Authorization header', async () => {
    const { app } = loadApp(oauthEnv);
    const res = await post(app, defaultFormatBody(), { Authorization: 'Basic Zm9vOmJhcg==' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('invalid_request');
  });

  it('maps the three RFC 6750 codes to 400 / 401 / 403', () => {
    const { OAUTH_ERRORS } = loadApp();
    expect(OAUTH_ERRORS).toEqual({
      invalid_request: 400,
      invalid_token: 401,
      insufficient_scope: 403,
    });
  });

  it('hybrid: enforces both OAuth and the signature', async () => {
    const { app } = loadApp({
      ...oauthEnv,
      SENDGRID_INBOUND_PUBLIC_KEY: PUBLIC_KEY_B64,
    });
    const body = defaultFormatBody();
    const ts = nowSeconds();

    // Good token, bad signature.
    const bad = await post(app, body, {
      Authorization: 'Bearer good-token',
      [SIGNATURE_HEADER]: sign(body, ts, wrong.privateKey),
      [TIMESTAMP_HEADER]: ts,
    });
    expect(bad.status).toBe(400);

    // Good token, good signature.
    const good = await post(app, body, {
      Authorization: 'Bearer good-token',
      [SIGNATURE_HEADER]: sign(body, ts),
      [TIMESTAMP_HEADER]: ts,
    });
    expect(good.status).toBe(200);
  });
});

describe('payload parsing', () => {
  it('parses the default format, keeping the attachment bytes intact', async () => {
    const { parseMultipart, normalizeInboundEmail } = loadApp();
    const body = defaultFormatBody();
    const { fields, files } = await parseMultipart(body, CONTENT_TYPE);
    const email = normalizeInboundEmail(fields, files);

    expect(email.isRaw).toBe(false);

    // envelope is a JSON STRING; envelope.to is a single-element ARRAY.
    expect(email.envelopeTo).toEqual(['support@parse.example.com']);
    expect(email.envelopeFrom).toBe('sender@example.com');

    // `SPF` is upper-case on the wire.
    expect(email.spf).toBe('pass');

    // `dkim` is NOT JSON — it must survive as the bare string it is.
    expect(email.dkim).toBe('{@sendgrid.com : pass}');
    expect(() => JSON.parse(email.dkim)).toThrow();

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
    const png = email.files.find((f) => f.field === 'attachment1');
    expect(png.type).toBe('image/png');
    expect(png.filename).toBe('image.png');
    expect(png.buffer.equals(PNG_BYTES)).toBe(true);
    expect(email.files).toHaveLength(2);
  });

  it('parses the raw format and exposes the MIME message', async () => {
    const { parseMultipart, normalizeInboundEmail } = loadApp();
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
    const { normalizeInboundEmail } = loadApp();
    const email = normalizeInboundEmail(
      { envelope: '{not json', charsets: '', 'attachment-info': 'nope' },
      []
    );
    expect(email.envelopeTo).toEqual([]);
    expect(email.charsets).toEqual({});
    expect(email.attachmentInfo).toEqual({});
  });

  it('there is no event-type field to switch on', async () => {
    const { parseMultipart } = loadApp();
    const { fields } = await parseMultipart(defaultFormatBody(), CONTENT_TYPE);
    // Inbound Parse has no event vocabulary — route on the recipient instead.
    expect(fields.event).toBeUndefined();
    expect(fields.type).toBeUndefined();
  });
});

describe('endpoint behaviour', () => {
  it('serves a health check', async () => {
    const { app } = loadApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('404s an unknown path', async () => {
    const { app } = loadApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });

  it('rejects a verified request whose multipart body is unparseable', async () => {
    const { app } = loadApp();
    const body = Buffer.from('this is not multipart at all', 'utf8');
    const ts = nowSeconds();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/webhooks/sendgrid-inbound')
      .set('Content-Type', CONTENT_TYPE)
      .set(SIGNATURE_HEADER, sign(body, ts))
      .set(TIMESTAMP_HEADER, ts)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid multipart body');
  });
});
