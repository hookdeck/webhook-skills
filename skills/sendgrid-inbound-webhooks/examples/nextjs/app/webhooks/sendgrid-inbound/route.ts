// Generated with: sendgrid-inbound-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto, { KeyObject } from 'crypto';

/**
 * TWILIO SENDGRID INBOUND PARSE.
 *
 * Receives INBOUND EMAIL. One HTTP POST per message, encoded as
 * multipart/form-data. This is NOT the SendGrid Event Webhook (delivered /
 * bounce / open / click, JSON array body) — the two features share the ECDSA
 * primitive and these two header names, and nothing else.
 *
 * There are NO vendor event types here. The only "event" is an email arriving,
 * and there is no `type` or `event` discriminator on the payload. Route on the
 * recipient (envelope.to) instead.
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
 *   NO signature header at all. This route accepts unsigned requests ONLY when
 *   no public key is configured, and says so loudly. Once
 *   SENDGRID_INBOUND_PUBLIC_KEY is set it never falls back.
 */

export const runtime = 'nodejs'; // needs node:crypto
export const dynamic = 'force-dynamic';

const SIGNATURE_HEADER = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP_HEADER = 'x-twilio-email-event-webhook-timestamp';

/** Optional replay window in seconds. 0/unset disables the check. */
const MAX_AGE_SECONDS = Number(process.env.SENDGRID_INBOUND_MAX_AGE_SECONDS || 0);

/** Set true when the security policy includes an `oauth` block. */
const REQUIRE_OAUTH = String(process.env.SENDGRID_INBOUND_REQUIRE_OAUTH || '') === 'true';

export interface InboundAttachment {
  field: string;
  filename: string;
  type: string;
  size: number;
  buffer: Buffer;
}

export interface InboundEmail {
  /** True when the Parse Setting has send_raw: true. */
  isRaw: boolean;
  /** SMTP RCPT TO — a single-element array. Route on this. */
  envelopeTo: string[];
  envelopeFrom?: string;
  to?: string;
  from?: string;
  subject?: string;
  senderIp?: string;
  /** A BARE STRING like "{@sendgrid.com : pass}". Not JSON. */
  dkim?: string;
  /** The `SPF` field — upper-case on the wire. */
  spf?: string;
  /** Only present when the Parse Setting has spam_check: true. */
  spamScore?: string;
  spamReport?: string;
  charsets: Record<string, string>;
  /** Default format only. */
  headers?: string;
  text?: string;
  html?: string;
  /** Raw format only: the entire MIME message. */
  rawMime?: string;
  attachmentCount: number;
  attachmentInfo: Record<string, Record<string, string>>;
  /** CID -> multipart part name. */
  contentIds: Record<string, string>;
  files: InboundAttachment[];
}

/**
 * Load the verification key once per process.
 *
 * SendGrid's docs: "You don't need to request the public key for each incoming
 * webhook. Doing so may introduce unnecessary latency and dependencies."
 *
 * Accepts either the raw base64 DER SPKI the API returns, or PEM.
 */
export function loadPublicKey(value: string | undefined): KeyObject | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes('BEGIN PUBLIC KEY')) {
      return crypto.createPublicKey(trimmed);
    }
    // The common case: base64 DER SubjectPublicKeyInfo, no armour. A PEM-only
    // loader throws on this value — decode it to DER bytes instead.
    return crypto.createPublicKey({
      key: Buffer.from(trimmed.replace(/\s+/g, ''), 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (err) {
    console.error(
      'SENDGRID_INBOUND_PUBLIC_KEY is not a usable public key:',
      (err as Error).message
    );
    return null;
  }
}

const publicKey = loadPublicKey(process.env.SENDGRID_INBOUND_PUBLIC_KEY);

/**
 * Verify an Inbound Parse signature.
 *
 * @param rawBody  The EXACT bytes received — not a string, not a re-serialized
 *                 form. See the WARNING in SendGrid's docs.
 */
export function verifyInboundParseSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  key: KeyObject | null,
  maxAgeSeconds: number = MAX_AGE_SECONDS
): boolean {
  // Fail closed. A missing header or an unloadable key is a rejection.
  if (!key || !signature || !timestamp || !Buffer.isBuffer(rawBody)) return false;

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

    // crypto.verify defaults to dsaEncoding: 'der', exactly what SendGrid
    // sends. Do NOT split into r/s or convert to P1363/raw form.
    return crypto.verify('sha256', signed, key, Buffer.from(signature, 'base64'));
  } catch {
    // Malformed base64, wrong key type, truncated DER — all rejections, never
    // 500s. An uncaught throw would make SendGrid retry forever.
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
 * JWKS (iss / aud / exp / scope), or calls RFC 7662 introspection. The env-var
 * allowlist exists only so the OAuth path is runnable and testable.
 */
export function validateAccessToken(token: string): {
  valid: boolean;
  insufficientScope?: boolean;
} {
  const accepted = String(process.env.SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return { valid: accepted.includes(token) };
}

/**
 * RFC 6750 §3.1 rejection codes.
 *
 * THE BODY STRING IS LOAD-BEARING. SendGrid caches its access token; a 4xx
 * whose body contains one of these literals is the ONLY signal that makes it
 * fetch a fresh one. A bare 401 with an empty or custom body leaves the stale
 * token cached and every subsequent delivery fails identically.
 */
export const OAUTH_ERRORS = {
  invalid_request: 400, // missing / duplicated / malformed token or parameter
  invalid_token: 401, // expired, revoked, malformed, otherwise invalid
  insufficient_scope: 403, // valid token, not enough privileges
} as const;

type OAuthErrorCode = keyof typeof OAUTH_ERRORS;

function oauthError(code: OAuthErrorCode): NextResponse {
  // The literal string must appear in the body. Keeping it in an `error` field
  // satisfies that and stays machine-readable for your own logs.
  return NextResponse.json({ error: code }, { status: OAUTH_ERRORS[code] });
}

function authorizeOAuth(req: NextRequest): { ok: true } | { ok: false; code: OAuthErrorCode } {
  const header = req.headers.get('authorization');
  if (!header) return { ok: false, code: 'invalid_request' };

  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return { ok: false, code: 'invalid_request' };

  const result = validateAccessToken(match[1]);
  if (result.insufficientScope) return { ok: false, code: 'insufficient_scope' };
  if (!result.valid) return { ok: false, code: 'invalid_token' };
  return { ok: true };
}

/**
 * Parse the multipart body — AFTER verification, never before.
 *
 * `new Response(buf, { headers }).formData()` is a standards-compliant
 * multipart parser built into Node 18+, so this needs no busboy/multer and,
 * crucially, runs on bytes we already verified rather than on a stream we
 * consumed early.
 */
export async function parseMultipart(
  rawBody: Buffer,
  contentType: string
): Promise<{ fields: Record<string, string>; files: InboundAttachment[] }> {
  const form = await new Response(new Uint8Array(rawBody), {
    headers: { 'content-type': contentType },
  }).formData();

  const fields: Record<string, string> = {};
  const files: InboundAttachment[] = [];
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
function parseJsonField<T>(value: string | undefined, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
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
export function normalizeInboundEmail(
  fields: Record<string, string>,
  files: InboundAttachment[]
): InboundEmail {
  // The presence of `email` is the reliable raw-mode tell.
  const isRaw = fields.email !== undefined;

  // NOTE THE MIXED CONVENTIONS. `SPF` is upper-case; `content-ids` and
  // `attachment-info` are hyphenated, so they need bracket access.
  const envelope = parseJsonField<{ to?: string[]; from?: string }>(fields.envelope, {});

  return {
    isRaw,
    // envelope.to is a SINGLE-ELEMENT ARRAY of the SMTP RCPT TO address. Route
    // on this — the `to` header field can differ (BCC, aliases, forwarding).
    envelopeTo: Array.isArray(envelope.to) ? envelope.to : [],
    envelopeFrom: envelope.from,
    to: fields.to,
    from: fields.from,
    subject: fields.subject,
    senderIp: fields.sender_ip,
    // A BARE STRING like "{@sendgrid.com : pass}". Looks like JSON, is NOT
    // valid JSON. Never JSON.parse it.
    dkim: fields.dkim,
    spf: fields.SPF,
    spamScore: fields.spam_score,
    spamReport: fields.spam_report,
    charsets: parseJsonField<Record<string, string>>(fields.charsets, {}),
    headers: fields.headers,
    text: fields.text,
    html: fields.html,
    // Raw-format only: the whole MIME message. Decompose with a MIME parser
    // such as `mailparser` if you need the parts.
    rawMime: fields.email,
    // `attachments` is a COUNT (a string like "2"), not a list. The files
    // themselves are separate parts named attachment1, attachment2… The
    // documented example is 1-based; the prose says X ranges from 0. Don't
    // hardcode a start index — iterate the keys.
    attachmentCount:
      fields.attachments !== undefined ? Number(fields.attachments) : files.length,
    attachmentInfo: parseJsonField<Record<string, Record<string, string>>>(
      fields['attachment-info'],
      {}
    ),
    // CID -> part name. Use it to rewrite `cid:` references in `html`.
    contentIds: parseJsonField<Record<string, string>>(fields['content-ids'], {}),
    files,
  };
}

/**
 * POST /webhooks/sendgrid-inbound
 *
 * THE RAW BODY IS READ FIRST, BEFORE ANYTHING PARSES IT.
 *
 * SendGrid's docs warn under an explicit WARNING that frameworks which
 * auto-parse multipart data break signature validation, and instruct: "Do not
 * parse or modify the request body before validating the signature. Use the
 * raw request body exactly as it was received."
 *
 * Calling `await req.formData()` first is unrecoverable — the raw bytes are
 * not retained and verification can never succeed afterwards.
 */
export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());

  // --- OAuth path (independent of signature verification) -------------------
  if (REQUIRE_OAUTH) {
    const auth = authorizeOAuth(req);
    if (!auth.ok) {
      console.error(`SendGrid Inbound Parse OAuth rejection: ${auth.code}`);
      return oauthError(auth.code);
    }
  }

  // --- Signature path -------------------------------------------------------
  const signature = req.headers.get(SIGNATURE_HEADER);
  const timestamp = req.headers.get(TIMESTAMP_HEADER);

  if (publicKey) {
    // A key is configured, so signing is expected. Do not fall back.
    if (!signature || !timestamp) {
      console.error('Missing Inbound Parse signature headers while a public key is configured');
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
    }
    if (!verifyInboundParseSignature(rawBody, signature, timestamp, publicKey)) {
      console.error('SendGrid Inbound Parse signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  } else if (signature) {
    // Signed requests are arriving but we cannot check them — a
    // misconfiguration on our side, not a bad request from SendGrid. 500 makes
    // that visible and gets the delivery retried.
    console.error(
      'Received a signed Inbound Parse request but SENDGRID_INBOUND_PUBLIC_KEY is not set'
    );
    return NextResponse.json({ error: 'Webhook public key not configured' }, { status: 500 });
  } else if (!REQUIRE_OAUTH) {
    // Genuinely unsigned: no security policy attached to the Parse Setting. A
    // valid SendGrid configuration, but anyone who learns your URL can POST.
    console.warn(
      '⚠️  Accepting an UNVERIFIED Inbound Parse request — no security policy is configured. ' +
        'Attach a signature or OAuth policy: see references/setup.md'
    );
  }

  // --- Only now is it safe to parse ----------------------------------------
  let parsed: { fields: Record<string, string>; files: InboundAttachment[] };
  try {
    parsed = await parseMultipart(rawBody, req.headers.get('content-type') || '');
  } catch (err) {
    console.error('Verified request had an unparseable multipart body:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const email = normalizeInboundEmail(parsed.fields, parsed.files);

  /**
   * IDEMPOTENCY KEY.
   *
   * Inbound Parse carries no delivery id header, so derive one from the
   * message. The RFC 5322 Message-ID is the natural candidate and is stable
   * across redeliveries; fall back to a hash of the raw body when absent.
   */
  const idempotencyKey = messageIdFrom(email) || sha256(rawBody);

  console.log(
    `✓ Inbound email for ${email.envelopeTo.join(', ') || email.to} ` +
      `(${email.isRaw ? 'raw' : 'default'} format, ${email.attachmentCount} attachment(s), ` +
      `key ${idempotencyKey})`
  );

  try {
    await handleInboundEmail(email, idempotencyKey);
  } catch (err) {
    // Returning 5xx here would make SendGrid retry. Decide deliberately: for
    // a transient failure that is what you want; for a permanent one it is a
    // retry loop. Acknowledging and queueing the work is usually safer.
    console.error(`Error handling inbound email ${idempotencyKey}:`, err);
  }

  return NextResponse.json({ received: true });
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

/** Pull Message-ID out of the header blob (default format) or MIME (raw format). */
function messageIdFrom(email: InboundEmail): string | null {
  const source = email.headers || email.rawMime || '';
  const match = /^Message-ID:\s*(.+)$/im.exec(source);
  return match ? match[1].trim() : null;
}

/**
 * Dispatch.
 *
 * THERE ARE NO EVENT TYPES. Do not write `switch (payload.event)` — there is
 * no such field. Route on the recipient: envelope.to[0] is the SMTP RCPT TO,
 * i.e. the address SendGrid actually delivered to.
 */
async function handleInboundEmail(email: InboundEmail, idempotencyKey: string): Promise<void> {
  // TODO: check idempotencyKey against your store and return early if seen.

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

  // In raw mode there is no `text`/`html` — only the full MIME string.
  if (email.isRaw) {
    console.log(`   raw MIME message, ${String(email.rawMime).length} bytes`);
  } else {
    console.log(`   text: ${(email.text || '').slice(0, 80)}`);
  }

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
  // say nothing about whether the HTTP request came from SendGrid.
  if (email.spf && email.spf !== 'pass') {
    console.warn(`   ⚠️  SPF result: ${email.spf}`);
  }
  if (email.spamScore !== undefined && Number(email.spamScore) >= 5) {
    console.warn(`   ⚠️  spam_score ${email.spamScore} — likely spam`);
  }
}

/** SendGrid only ever POSTs here. */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
