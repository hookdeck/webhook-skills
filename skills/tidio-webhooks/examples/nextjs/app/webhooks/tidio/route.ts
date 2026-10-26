// Generated with: tidio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const SIGNATURE_RE = /^[0-9a-fA-F]{64}$/;

// In-memory dedupe for the example; use a shared store (Redis, database) in production.
const processedWebhookIds = new Set<string>();

/**
 * Parse `x-tidio-signature: t=<unix seconds>,s=<hex>[,s=<hex>...]`.
 * The header is never trimmed or re-formatted: `t` is used exactly as sent.
 */
function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const item of header.split(',')) {
    const eq = item.indexOf('=');
    if (eq === -1) continue;
    const key = item.slice(0, eq);
    const value = item.slice(eq + 1);
    if (key === 't' && timestamp === undefined) timestamp = value;
    else if (key === 's') signatures.push(value);
  }
  return { timestamp, signatures };
}

/**
 * Signed bytes are `<raw body>_<t>`; the HMAC key is the secret's UTF-8 bytes;
 * the signature is hex HMAC-SHA256. Valid if ANY `s` matches.
 */
function verifyTidioSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string,
  toleranceSeconds = 0
): boolean {
  if (!header || !secret) return false;
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || signatures.length === 0) return false;

  // Opt-in replay window (t is Unix seconds). Off by default: Hookdeck retries
  // and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  const signedBytes = Buffer.concat([
    rawBody,
    Buffer.from('_', 'utf8'),
    Buffer.from(timestamp, 'latin1'),
  ]);
  const expected = Buffer.from(
    crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedBytes).digest('hex'),
    'utf8'
  );

  let valid = false;
  for (const signature of signatures) {
    if (!SIGNATURE_RE.test(signature)) continue; // exact length and alphabet first
    const candidate = Buffer.from(signature.toLowerCase(), 'utf8');
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) {
      valid = true;
    }
  }
  return valid;
}

function handleEvent(topic: string, content: Record<string, any>): void {
  switch (topic) {
    case 'contact.created':
    case 'contact.updated':
      console.log(`${topic}: contact ${content.id} (${content.email || 'no email'})`);
      break;
    case 'conversation.solved_by_operator':
    case 'conversation.solved_automatically':
      console.log(`${topic}: contact ${content.contact_id} at ${content.solved_at}`);
      break;
    case 'conversation.solved_by_lyro':
      console.log(`${topic}: contact ${content.contact_id}, reason ${content.reason}`);
      break;
    case 'ticket.created':
      console.log(`${topic}: ticket ${content.id} "${content.subject}" (${content.status})`);
      break;
    case 'ticket.status_updated':
      console.log(`${topic}: ticket ${content.id} is now ${content.status}`);
      break;
    case 'ticket.replied':
      console.log(`${topic}: ticket ${content.id}`);
      break;
    case 'customer_satisfaction.rated':
      console.log(`${topic}: ${content.type} rated ${content.score}/5`);
      break;
    default:
      console.log(`Unhandled Tidio topic: ${topic}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.TIDIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TIDIO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes for ANY content type: this is exactly what Tidio signed.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.TIDIO_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!verifyTidioSignature(rawBody, request.headers.get('x-tidio-signature'), secret, tolerance)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification.
  let event: { topic?: string; webhook_id?: string; content?: Record<string, any> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (event.webhook_id) {
    if (processedWebhookIds.has(event.webhook_id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    processedWebhookIds.add(event.webhook_id);
  }

  handleEvent(event.topic ?? '', event.content ?? {});
  return NextResponse.json({ received: true });
}
