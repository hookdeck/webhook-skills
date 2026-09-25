// Generated with: formstack-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * A Formstack webhook payload is a FLAT map of field key -> value. The keys are the
 * FORM'S OWN field labels (or numeric field IDs, depending on the WebHook's
 * `postDataFieldKeys` setting), so the schema differs per form and cannot be typed
 * precisely. `FormID` and `UniqueID` are what the v2025 API reference's example
 * schema shows; nothing else is confirmed.
 */
export interface FormstackSubmission {
  FormID?: string;
  UniqueID?: string;
  [fieldKey: string]: unknown;
}

// `X-FS-Signature` is the DEFAULT header. The WebHook's "Custom HMAC Header" field
// overrides it — the Formstack help article: "If left blank, X-FS-Signature will be
// used as the HMAC header." Lowercase: header lookup is case-insensitive anyway.
const DEFAULT_SIGNATURE_HEADER = 'x-fs-signature';

function signatureHeaderName(): string {
  return (process.env.FORMSTACK_SIGNATURE_HEADER || DEFAULT_SIGNATURE_HEADER).toLowerCase();
}

/**
 * Verify a Formstack WebHook delivery.
 *
 * Formstack computes HMAC-SHA256 over the RAW request body bytes, keyed with the
 * per-WebHook "HMAC Key", rendered as LOWERCASE HEX. Nothing else is signed — no
 * timestamp, no nonce, no URL, no method.
 *
 * NOT FastSpring. FastSpring (fastspring.com, unrelated company) uses the same
 * `X-FS-Signature` header name with a BASE64 digest and an `events[]` envelope.
 *
 * Fails CLOSED: a missing key or missing header is a rejection, never an accept.
 */
export function verifyFormstackWebhook(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  hmacKey: string | undefined
): boolean {
  if (!signatureHeader || !hmacKey) return false;

  // Formstack sends `sha256=<hex>`; strip the prefix (a bare digest is tolerated too).
  const received = signatureHeader.trim().replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = crypto.createHmac('sha256', hmacKey).update(rawBody).digest('hex');

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Guard the length first — timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Read the RAW bytes first.
  //
  // THIS IS THE WHOLE BALLGAME for Formstack. The default content type is
  // `application/x-www-form-urlencoded` and the digest covers the RAW urlencoded bytes,
  // not a re-encoded form of the parsed dict. Calling request.formData() or
  // request.json() here would consume the stream and lose the exact bytes forever.
  const rawBody = await request.text();

  const headerName = signatureHeaderName();
  const signature = request.headers.get(headerName);

  if (!signature) {
    console.error(`Missing ${headerName} header`);
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  const hmacKey = process.env.FORMSTACK_HMAC_KEY;

  // FAIL CLOSED on misconfiguration. 500 (not 400) so the operator can tell
  // "my server is misconfigured" apart from "someone sent a bad signature".
  if (!hmacKey) {
    console.error('FORMSTACK_HMAC_KEY is not set — refusing to accept unverified webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // 1. Verify BEFORE parsing. The HMAC is the only credential Formstack sends (the
  //    WebHook Shared Secret is a separate, weaker, bearer-style token).
  if (!verifyFormstackWebhook(rawBody, signature, hmacKey)) {
    console.error('Formstack webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Parse only after the signature checks out. The content type is chosen per
  //    WebHook (`contentType`: `urlencoded` — the default — or `json`), and one endpoint
  //    is commonly pointed at several forms, so support both.
  const contentType = request.headers.get('content-type') ?? '';
  let fields: FormstackSubmission;

  try {
    fields = parseSubmission(rawBody, contentType);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // There is NO event type in a Formstack webhook — no event header, no event body
  // field, no event names. A WebHook fires on exactly one thing: a form submission.
  // The discriminator is the FORM.
  const formId = fields.FormID !== undefined ? String(fields.FormID) : undefined;
  const uniqueId = fields.UniqueID !== undefined ? String(fields.UniqueID) : undefined;

  console.log(`✓ Verified Formstack submission (FormID=${formId}, UniqueID=${uniqueId})`);

  // IDEMPOTENCY IS REQUIRED. Nothing but the body is signed — no timestamp, no nonce —
  // so a captured delivery replays indefinitely and no staleness check is possible.
  // Deduplicate on UniqueID, falling back to a hash of the raw body.
  const idempotencyKey =
    uniqueId || crypto.createHash('sha256').update(rawBody).digest('hex');

  // 3. Handle. Formstack publishes no retry policy or delivery timeout, so assume
  //    nothing: keep this fast and in production enqueue the work (after(), a queue,
  //    or Hookdeck) rather than doing it inline.
  try {
    handleSubmission(formId, fields, idempotencyKey);
  } catch (err) {
    console.error(`Error handling submission ${idempotencyKey}:`, err);
    // Still acknowledge — record the failure and reconcile out of band.
  }

  return NextResponse.json({ received: true });
}

/**
 * Parse the raw body according to the WebHook's configured content type.
 *
 * Never re-encode the result and hash it — the digest covers the bytes above.
 */
function parseSubmission(rawBody: string, contentType: string): FormstackSubmission {
  if (contentType.includes('application/json')) {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    return parsed as FormstackSubmission;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody)) as FormstackSubmission;
  }

  throw new Error(`Unsupported content type: ${contentType}`);
}

/**
 * Per-form handlers, keyed on FormID — NOT on an event type, because Formstack has none.
 *
 * Replace these IDs with your own forms'. Every key is optional: the payload shape is
 * whatever the form's fields are called, and a form editor can change it at any time.
 */
const FORM_HANDLERS: Record<string, (fields: FormstackSubmission, key: string) => void> = {
  // '1234567': handleContactForm,
  // '7654321': handleOrderForm,
};

function handleSubmission(
  formId: string | undefined,
  fields: FormstackSubmission,
  idempotencyKey: string
): void {
  // TODO: check idempotencyKey against your store and return early if already processed.

  const handler = formId ? FORM_HANDLERS[formId] : undefined;

  if (handler) {
    handler(fields, idempotencyKey);
    return;
  }

  // Default branch. A form you don't recognise is normal — someone may have pointed a
  // new form at this endpoint. Log it, don't fail, and never return non-2xx for it.
  const fieldKeys = Object.keys(fields).filter((k) => k !== 'FormID' && k !== 'UniqueID');
  console.log(`📝 Submission from form ${formId} with ${fieldKeys.length} field(s):`);
  for (const key of fieldKeys) {
    console.log(`   ${key} = ${formatValue(fields[key])}`);
  }

  // To find out exactly which fields a given form will send, ask Formstack:
  //   GET https://www.formstack.com/api/v2025/forms/{formId}/webhooks/openapi
  // It returns a generated OpenAPI schema for THAT form's webhook payload.
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// Formstack only ever POSTs. A GET is handy as a liveness probe while wiring up the WebHook.
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'formstack-webhooks' });
}
