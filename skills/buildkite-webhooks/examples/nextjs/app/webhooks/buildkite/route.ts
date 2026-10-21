// Generated with: buildkite-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Buildkite sends one of two headers, depending on the webhook's Token setting:
// - X-Buildkite-Token (default): the token in plain text
// - X-Buildkite-Signature: "timestamp=<unix>,signature=<hex>", where signature is
//   HMAC-SHA256 of "<timestamp>.<raw body>" keyed with the token
// https://buildkite.com/docs/apis/webhooks/pipelines

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseSignatureHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

function verifyBuildkite(rawBody: string, headers: Headers, token: string): boolean {
  if (!token) return false;

  const signatureHeader = headers.get('x-buildkite-signature');
  if (signatureHeader) {
    const { timestamp, signature } = parseSignatureHeader(signatureHeader);
    if (!timestamp || !signature) return false;

    const ts = Number(timestamp);
    if (!Number.isInteger(ts)) return false;
    // Buildkite suggests a short window (e.g. 5 minutes). It's opt-in here: off unless
    // BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS > 0.
    const tolerance = timestampToleranceSeconds();
    if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', token)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    return safeEqual(signature, expected);
  }

  // Token mode: constant-time compare of the plain-text header
  const tokenHeader = headers.get('x-buildkite-token');
  return !!tokenHeader && safeEqual(tokenHeader, token);
}

export async function POST(request: NextRequest) {
  const token = process.env.BUILDKITE_WEBHOOK_TOKEN;
  if (!token) {
    console.error('BUILDKITE_WEBHOOK_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook token not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing
  const rawBody = await request.text();

  if (!verifyBuildkite(rawBody, request.headers, token)) {
    console.error('Buildkite webhook verification failed');
    return NextResponse.json({ error: 'Invalid token or signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = request.headers.get('x-buildkite-event') || payload.event;

  switch (event) {
    case 'ping':
      console.log('Ping received');
      break;
    case 'build.scheduled':
    case 'build.running':
    case 'build.failing':
      console.log(`Build ${payload.build?.number} (${event})`);
      break;
    case 'build.finished':
      console.log(`Build ${payload.build?.number} finished: ${payload.build?.state}`);
      break;
    case 'job.started':
    case 'job.finished':
      console.log(`Job ${payload.job?.id} (${event})`);
      break;
    case 'agent.connected':
      console.log(`Agent connected: ${payload.agent?.name}`);
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }

  return NextResponse.json({ received: true });
}
