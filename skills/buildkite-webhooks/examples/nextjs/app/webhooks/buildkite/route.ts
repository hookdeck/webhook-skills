// Generated with: buildkite-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Buildkite sends one of two headers, depending on the webhook's Token setting:
// - X-Buildkite-Token (default): the token in plain text
// - X-Buildkite-Signature: "timestamp=<unix>,signature=<hex>", where signature is
//   HMAC-SHA256 of "<timestamp>.<raw body>" keyed with the token
// https://buildkite.com/docs/apis/webhooks/pipelines

// Buildkite suggests rejecting old timestamps (e.g. 5 minutes) to defend against replay.
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

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
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
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
