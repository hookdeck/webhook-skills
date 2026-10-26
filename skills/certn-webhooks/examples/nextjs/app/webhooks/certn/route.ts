// Generated with: certn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// When signing is enabled, Certn adds a Certn-Signature header to every delivery (one line):
//   t=<unix seconds>, v1=<hex>[, v1=<hex>]
// Each v1 is HMAC-SHA256 (hex) of "<t>.<request body as text>", keyed with the signing secret as UTF-8.
// Several v1 values are sent while a rolled secret is still active (48 hours).
// https://docs.certn.co/api/guides/use-the-api/webhooks

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set CERTN_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`CERTN_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',' and trim each part; keep t and every v1, ignore other schemes.
function parseSignatureHeader(header: string): { t?: string; v1: string[] } {
  let t: string | undefined;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const p = part.trim();
    const i = p.indexOf('=');
    if (i <= 0) continue;
    const key = p.slice(0, i).trim();
    const value = p.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyCertn(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) return false;

  if (!/^\d+$/.test(t)) return false;
  // Certn suggests rejecting old timestamps. It's opt-in here: off unless
  // CERTN_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', secret) // signing secret as UTF-8, not decoded
      .update(`${t}.${rawBody}`)
      .digest('hex')
  );
  // Accept if any v1 matches. Check it is exactly 64 hex chars first, then compare the
  // lowercase hex strings as equal-length Buffers in constant time.
  return v1.some(
    (sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected)
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.CERTN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CERTN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();

  if (!verifyCertn(rawBody, request.headers.get('certn-signature'), secret)) {
    console.error('Certn webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let applicant: any;
  try {
    applicant = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Certn has no event types: the body is the applicant (report) object, posted as results
  // become available. Dispatch on report_status (for example IN_PROGRESS or COMPLETE).
  switch (applicant.report_status) {
    case 'COMPLETE':
      console.log(`Applicant ${applicant.id} report complete: result ${applicant.result}`);
      break;
    case 'IN_PROGRESS':
      console.log(`Applicant ${applicant.id} report in progress`);
      break;
    default:
      console.log(`Unhandled report_status: ${applicant.report_status}`);
  }

  return NextResponse.json({ received: true });
}
