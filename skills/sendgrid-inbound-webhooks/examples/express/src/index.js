// Generated with: sendgrid-inbound-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * TWILIO SENDGRID INBOUND PARSE.
 *
 * Receives INBOUND EMAIL. One HTTP POST per message, encoded as
 * multipart/form-data. This is NOT the SendGrid Event Webhook (delivered /
 * bounce / open / click, JSON array body) — the two features share the ECDSA
 * primitive and these two header names, and nothing else.
 *
 * There are NO vendor event types here. The only "event" is an email arriving,
 * and there is no `type` or `event` discriminator field on the payload. Route
 * on the recipient (envelope.to) instead.
 *
 *   SIGNING: ECDSA, NOT HMAC.
 *     curve   : NIST P-256 (prime256v1), SHA-256
 *     headers : X-Twilio-Email-Event-Webhook-Signature (base64)
 *               X-Twilio-Email-Event-Webhook-Timestamp (Unix seconds string)
 *     signs   : timestamp + RAW BODY BYTES, concatenated, no separator
 *     sig enc : base64 of an ASN.1/DER (r,s) SEQUENCE
 *     key     : base64 DER SubjectPublicKeyInfo — NOT PEM
 *
 *   The header names say "Event-Webhook" on Inbound Parse too. Verbatim from
 *   the docs, not a copy-paste error.
 *
 *   SIGNING IS OPT-IN. A Parse webhook with no security policy attached sends
 *   NO signature header at all. This handler therefore accepts unsigned
 *   requests ONLY when no public key is configured, and says so loudly. Once
 *   SENDGRID_INBOUND_PUBLIC_KEY is set it never falls back.
 */

/** Optional replay window in seconds. 0/unset disables the check. */
const MAX_AGE_SECONDS = Number(process.env.SENDGRID_INBOUND_MAX_AGE_SECONDS || 0);

/** Set true when the security policy includes an `oauth` block. */
const REQUIRE_OAUTH = String(process.env.SENDGRID_INBOUND_REQUIRE_OAUTH || '') === 'true';

/**
 * Load the verification key once at startup.
 *
 * SendGrid's docs: "You don't need to request the public key for each incoming
 * webhook. Doing so may introduce unnecessary latency and dependencies."
 *
 * Accepts either the raw base64 DER SPKI the API returns, or a PEM block if
 * you'd rather store it armoured. Returns null when unconfigured.
 *
 * @param {string|undefined} value
 * @returns {crypto.KeyObject|null}
 */
function loadPublicKey(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes('BEGIN PUBLIC KEY')) {
      return crypto.createPublicKey(trimmed);
    }
    // The common case: base64 DER SubjectPublicKeyInfo, no armour. Passing this
    // to a PEM-only loader throws — decode it to DER bytes instead.
    return crypto.createPublicKey({
      key: Buffer.from(trimmed.replace(/\s+/g, ''), 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (err) {
    console.error('SENDGRID_INBOUND_PUBLIC_KEY is not a usable public key:', err.message);
    return null;
  }
}

/**
 * Verify an Inbound Parse signature.
 *
 * @param {Buffer} rawBody  The EXACT bytes received. Not a string, not a
 *                          re-serialized form — see the warning in the docs.
 * @param {string|undefined} signature  X-Twilio-Email-Event-Webhook-Signature
 * @param {string|undefined} timestamp  X-Twilio-Email-Event-Webhook-Timestamp
 * @param {crypto.KeyObject|null} publicKey
 * @param {number} maxAgeSeconds  0 disables the freshness check
 * @returns {boolean}
 */
function verifyInboundParseSignature(
  rawBody,
  signature,
  timestamp,
  publicKey,
  maxAgeSeconds = MAX_AGE_SECONDS
) {
  // Fail closed. A missing header or an unloadable key is a rejection.
  if (!publicKey || !signature || !timestamp || !Buffer.isBuffer(rawBody)) return false;

  // Optional replay protection. The timestamp is a real Unix timestamp rather
  // than a nonce, so this is meaningful — but it is off by default so clock
  // skew never silently drops mail.
  if (maxAgeSeconds > 0) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > maxAgeSeconds) return false;
  }

  try {
    // Timestamp FIRST, then the raw body. Concatenated as bytes, no separator.
    const signed = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBody]);

    // crypto.verify defaults to dsaEncoding: 'der', which is exactly what
    // SendGrid sends. Do NOT split into r/s or convert to P1363/raw form.
    return crypto.verify('sha256', signed, publicKey, Buffer.from(signature, 'base64'));
  } catch {
    // Malformed base64, wrong key type, truncated DER — all are rejections,
    // never 500s. An uncaught throw here would make SendGrid retry forever.
    return false;
  }
}

/**
 * Validate an OAuth access token.
 *
 * When the security policy includes an `oauth` block, SendGrid performs a
 * client-credentials grant against the token_url YOU designated and sends the
 * result as `Authorization: Bearer <token>`. SendGrid does not interpret the
 * token — validating it is entirely your side of the contract.
 *
 * REPLACE THIS. A real implementation verifies a JWT against your issuer's
 * JWKS (checking iss / aud / exp / scope), or calls RFC 7662 introspection.
 * The env-var allowlist below exists only so the OAuth path is runnable and
 * testable out of the box.
 *
 * @param {string} token
 * @returns {{valid: boolean, insufficientScope?: boolean}}
 */
function validateAccessToken(token) {
  const accepted = String(process.env.SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return { valid: accepted.includes(token) };
}

/**
 * RFC 6750 §3.1 rejection.
 *
 * THE BODY STRING IS LOAD-BEARING. SendGrid caches its access token; a 4xx
 * whose body contains one of `invalid_request`, `invalid_token` or
 * `insufficient_scope` is the ONLY signal that makes it fetch a fresh one. A
 * bare 401 with an empty or custom body leaves the stale token cached and
 * every subsequent delivery fails identically.
 */
const OAUTH_ERRORS = {
  invalid_request: 400, // missing / duplicated / malformed token or parameter
  invalid_token: 401, // expired, revoked, malformed, otherwise invalid
  insufficient_scope: 403, // valid token, not enough privileges
};

function oauthError(res, code) {
  return res
    .status(OAUTH_ERRORS[code])
    .type('application/json')
    // The literal string must appear in the body. Keeping it in an `error`
    // field satisfies that and stays machine-readable for your own logs.
    .send(JSON.stringify({ error: code }));
}

/**
 * Check the Authorization header when an OAuth policy is in force.
 *
 * @returns {{ok: true} | {ok: false, code: keyof OAUTH_ERRORS}}
 */
function authorizeOAuth(req) {
  const header = req.headers['authorization'];
  if (!header) return { ok: false, code: 'invalid_request' };

  const match = /^Bearer\s+(\S+)$/i.exec(String(header));
  if (!match) return { ok: false, code: 'invalid_request' };

  const result = validateAccessToken(match[1]);
  if (result.insufficientScope) return { ok: false, code: 'insufficient_scope' };
  if (!result.valid) return { ok: false, code: 'invalid_token' };
  return { ok: true };
}

/**
 * Parse the multipart body — AFTER verification, never before.
 *
 * Node 18+ ships a standards-compliant multipart parser behind the global
 * `Response`, so this needs no busboy/multer dependency and, crucially, it
 * runs on bytes we already verified rather than on a stream we consumed early.
 *
 * @param {Buffer} rawBody
 * @param {string} contentType  The original Content-Type, boundary included
 * @returns {Promise<{fields: Record<string,string>, files: Array<{field:string,filename:string,type:string,size:number,buffer:Buffer}>}>}
 */
async function parseMultipart(rawBody, contentType) {
  const form = await new Response(rawBody, {
    headers: { 'content-type': contentType },
  }).formData();

  const fields = {};
  const files = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      fields[name] = value;
    } else {
      files.push({
        field: name,
        filename: value.name,
        type: value.type,
        size: value.size,
        buffer: Buffer.from(await value.arrayBuffer()),
      });
    }
  }
  return { fields, files };
}

/** JSON.parse that never throws — malformed mail is routine on an inbound address. */
function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Normalise both payload formats into one shape.
 *
 * DEFAULT (send_raw: false): headers, dkim, content-ids, to, text, html, from,
 *   sender_ip, spam_report, envelope, attachments, subject, spam_score,
 *   attachment-info, charsets, SPF
 * RAW (send_raw: true): dkim, email, to, from, sender_ip, spam_report,
 *   envelope, subject, spam_score, charsets, SPF
 *
 * Both can arrive at the same endpoint — the flag lives in the Parse Setting
 * and can be flipped without touching this code. Detect it from the payload.
 */
function normalizeInboundEmail(fields, files) {
  // The presence of `email` is the reliable raw-mode tell.
  const isRaw = fields.email !== undefined;

  // NOTE THE MIXED CONVENTIONS. `SPF` is upper-case; `content-ids` and
  // `attachment-info` are hyphenated, so they need bracket access.
  const envelope = parseJsonField(fields.envelope, {});

  return {
    isRaw,

    // envelope.to is a SINGLE-ELEMENT ARRAY of the SMTP RCPT TO address. This
    // is what you route on — the `to` header field can differ (BCC, aliases,
    // forwarding) and is for display.
    envelopeTo: Array.isArray(envelope.to) ? envelope.to : [],
    envelopeFrom: envelope.from,

    to: fields.to,
    from: fields.from,
    subject: fields.subject,
    senderIp: fields.sender_ip,

    // `dkim` is a BARE STRING like "{@sendgrid.com : pass}". It looks like JSON
    // and is NOT valid JSON. Never JSON.parse it.
    dkim: fields.dkim,
    spf: fields.SPF,

    // Only present when the Parse Setting has spam_check: true.
    spamScore: fields.spam_score,
    spamReport: fields.spam_report,

    charsets: parseJsonField(fields.charsets, {}),

    // Default-format only.
    headers: fields.headers,
    text: fields.text,
    html: fields.html,

    // Raw-format only: the entire MIME message (headers + body + base64
    // attachments) as one string. Decompose it with a MIME parser such as
    // `mailparser` if you need the parts.
    rawMime: fields.email,

    // `attachments` is a COUNT (a string like "2"), not a list. The files
    // themselves are separate multipart parts named attachment1, attachment2…
    // The documented example is 1-based; the prose says X ranges from 0. Don't
    // hardcode a start index — iterate the keys.
    attachmentCount: fields.attachments !== undefined ? Number(fields.attachments) : files.length,
    attachmentInfo: parseJsonField(fields['attachment-info'], {}),

    // CID -> part name, e.g. {"ii_1562e2169c132d83":"attachment1"}. Use it to
    // rewrite `cid:` references in `html` to your own storage URLs.
    contentIds: parseJsonField(fields['content-ids'], {}),

    files,
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const publicKey = loadPublicKey(process.env.SENDGRID_INBOUND_PUBLIC_KEY);

/**
 * SendGrid Inbound Parse endpoint.
 *
 * express.raw() hands the handler a Buffer of the exact bytes SendGrid sent.
 * The docs warn, under an explicit WARNING: "Some web frameworks automatically
 * parse multipart data and separate file uploads from the rest of the request
 * body. This can break signature validation. […] Do not parse or modify the
 * request body before validating the signature."
 *
 * So: NEVER mount express.urlencoded(), express.json(), or a bare multer() on
 * this route. The 30mb limit matches SendGrid's advised maximum message size —
 * the express.raw() default of 100kb rejects almost every real email that has
 * an attachment.
 */
app.post(
  '/webhooks/sendgrid-inbound',
  express.raw({ type: 'multipart/form-data', limit: '30mb' }),
  async (req, res) => {
    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      console.error(
        'Raw body missing — is a body parser mounted before this route? ' +
          'Signature verification needs the exact bytes SendGrid sent.'
      );
      return res.status(400).json({ error: 'Raw body unavailable' });
    }

    // --- OAuth path (independent of signature verification) -----------------
    if (REQUIRE_OAUTH) {
      const auth = authorizeOAuth(req);
      if (!auth.ok) {
        console.error(`SendGrid Inbound Parse OAuth rejection: ${auth.code}`);
        return oauthError(res, auth.code);
      }
    }

    // --- Signature path -----------------------------------------------------
    const signature = req.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];

    if (publicKey) {
      // A key is configured, so signing is expected. Do not fall back.
      if (!signature || !timestamp) {
        console.error('Missing Inbound Parse signature headers while a public key is configured');
        return res.status(400).json({ error: 'Missing signature headers' });
      }
      if (!verifyInboundParseSignature(rawBody, signature, timestamp, publicKey)) {
        console.error('SendGrid Inbound Parse signature verification failed');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else if (signature) {
      // Signed requests are arriving but we cannot check them — that is a
      // misconfiguration on our side, not a bad request from SendGrid. 500
      // makes the distinction visible in logs and gets the delivery retried.
      console.error(
        'Received a signed Inbound Parse request but SENDGRID_INBOUND_PUBLIC_KEY is not set'
      );
      return res.status(500).json({ error: 'Webhook public key not configured' });
    } else if (!REQUIRE_OAUTH) {
      // Genuinely unsigned: no security policy is attached to the Parse
      // Setting. This is a valid SendGrid configuration, but anyone who learns
      // your URL can POST to it.
      console.warn(
        '⚠️  Accepting an UNVERIFIED Inbound Parse request — no security policy is configured. ' +
          'Attach a signature or OAuth policy: see references/setup.md'
      );
    }

    // --- Only now is it safe to parse --------------------------------------
    let parsed;
    try {
      parsed = await parseMultipart(rawBody, req.headers['content-type'] || '');
    } catch (err) {
      console.error('Verified request had an unparseable multipart body:', err.message);
      return res.status(400).json({ error: 'Invalid multipart body' });
    }

    const email = normalizeInboundEmail(parsed.fields, parsed.files);

    /**
     * IDEMPOTENCY KEY.
     *
     * Inbound Parse carries no delivery id header, so derive one from the
     * message itself. The RFC 5322 Message-ID is the natural candidate and is
     * stable across redeliveries of the same message; fall back to a hash of
     * the raw body when the header is absent or mail is being forged.
     */
    const idempotencyKey = messageIdFrom(email) || sha256(rawBody);

    console.log(
      `✓ Inbound email for ${email.envelopeTo.join(', ') || email.to} ` +
        `(${email.isRaw ? 'raw' : 'default'} format, ${email.attachmentCount} attachment(s), ` +
        `key ${idempotencyKey})`
    );

    // Acknowledge fast — SendGrid is holding a mail transaction open.
    res.status(200).json({ received: true });

    setImmediate(() => {
      try {
        handleInboundEmail(email, idempotencyKey);
      } catch (err) {
        console.error(`Error handling inbound email ${idempotencyKey}:`, err);
      }
    });
  }
);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

/** Pull Message-ID out of the raw header blob (default format) or MIME (raw format). */
function messageIdFrom(email) {
  const source = email.headers || email.rawMime || '';
  const match = /^Message-ID:\s*(.+)$/im.exec(source);
  return match ? match[1].trim() : null;
}

/**
 * Dispatch.
 *
 * THERE ARE NO EVENT TYPES. Do not write `switch (payload.event)` — there is
 * no such field. Route on the recipient instead: envelope.to[0] is the SMTP
 * RCPT TO, i.e. the address SendGrid actually delivered to.
 */
function handleInboundEmail(email, idempotencyKey) {
  // TODO: check idempotencyKey against your store and return early if seen.
  //   if (await store.has(idempotencyKey)) return;

  const recipient = email.envelopeTo[0] || email.to || '';
  const mailbox = String(recipient).split('@')[0].toLowerCase();

  switch (mailbox) {
    case 'support':
      console.log(`🎫 Support mail from ${email.from}: ${email.subject}`);
      break;
    case 'billing':
      console.log(`💳 Billing mail from ${email.from}: ${email.subject}`);
      break;
    default:
      console.log(`📥 Mail for ${recipient || '(unknown)'} from ${email.from}: ${email.subject}`);
  }

  // Body. In raw mode there is no `text`/`html` — only the full MIME string.
  if (email.isRaw) {
    console.log(`   raw MIME message, ${String(email.rawMime).length} bytes`);
  } else {
    console.log(`   text: ${(email.text || '').slice(0, 80)}`);
  }

  // Attachments. `attachment-info` maps the multipart part names to metadata;
  // each part arrives as its own file with its own Content-Type.
  for (const file of email.files) {
    const info = email.attachmentInfo[file.field] || {};
    const cid = info['content-id']; // hyphenated inside the JSON too
    console.log(
      `   📎 ${file.field}: ${info.filename || file.filename} ` +
        `(${info.type || file.type}, ${file.size} bytes)${cid ? ` cid=${cid}` : ''}`
    );
    // TODO: stream file.buffer to object storage; for inline images, rewrite
    // the matching `cid:` reference in email.html using email.contentIds.
  }

  // Sender authentication results describe the EMAIL, not the webhook. They
  // tell you whether to trust the message; they say nothing about whether the
  // HTTP request came from SendGrid.
  if (email.spf && email.spf !== 'pass') {
    console.warn(`   ⚠️  SPF result: ${email.spf}`);
  }
  if (email.spamScore !== undefined && Number(email.spamScore) >= 5) {
    console.warn(`   ⚠️  spam_score ${email.spamScore} — likely spam`);
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler. express.raw() rejects oversized bodies here.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    console.error('Inbound Parse body exceeded the configured limit:', err.message);
    return res.status(413).json({ error: 'Payload too large' });
  }
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`SendGrid Inbound Parse server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sendgrid-inbound`);
    if (!publicKey && !REQUIRE_OAUTH) {
      console.warn('⚠️  No security policy configured — requests will be accepted UNVERIFIED');
      console.warn('   Set SENDGRID_INBOUND_PUBLIC_KEY, or SENDGRID_INBOUND_REQUIRE_OAUTH=true');
    }
  });
}

module.exports = {
  app,
  server,
  loadPublicKey,
  verifyInboundParseSignature,
  normalizeInboundEmail,
  parseMultipart,
  OAUTH_ERRORS,
};
