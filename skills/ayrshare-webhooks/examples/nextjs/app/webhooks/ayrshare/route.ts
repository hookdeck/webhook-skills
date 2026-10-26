// Generated with: ayrshare-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an Ayrshare webhook signature.
 *
 * `X-Authorization-Content-SHA256-V2` carries `v1=<hex>`; during the 24 h after a
 * secret rotation it carries `v1=<current>,v1=<previous>`. Only the raw body is
 * signed (the timestamp header is not), so there is no replay window to check.
 */
export function verifyAyrshareSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string
): boolean {
  if (!header || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let matched = false;

  for (const part of header.split(',')) {
    let candidate = part.trim();
    if (candidate.startsWith('v1=')) {
      candidate = candidate.slice(3);
    } else if (candidate.includes('=')) {
      continue; // entry with some other key: ignore
    }
    // Validate length and alphabet before decoding (Buffer.from silently drops bad characters)
    if (!HEX_SHA256.test(candidate)) continue;
    const sig = Buffer.from(candidate, 'hex');
    if (crypto.timingSafeEqual(sig, expected)) matched = true;
  }
  return matched;
}

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// The payload is verified but still untrusted: check each field's type before use.
function handleAyrshareEvent(event: JsonObject) {
  const action = event.action;
  const subAction = str(event.subAction);

  switch (action) {
    case 'scheduled': {
      const errors = Array.isArray(event.errors) ? event.errors.length : 0;
      if (subAction === 'tikTokPublished') {
        console.log(`TikTok post published: ${str(event.id)}`);
      } else {
        console.log(`Scheduled post ${str(event.id)}: ${str(event.status)} (${errors} errors)`);
      }
      // TODO: Update your post record from event.postIds / event.errors
      break;
    }
    case 'social':
      console.log(`Social account ${str(event.type)} on ${str(event.platform)}`);
      // TODO: On "unlink" with source "system", prompt the user to relink
      break;
    case 'messages': {
      const sender = isObject(event.senderDetails) ? str(event.senderDetails.name) : undefined;
      console.log(
        `Message ${subAction ?? 'event'} on ${str(event.platform)} from ${sender ?? str(event.senderId)}: ${str(event.message) ?? ''}`
      );
      // TODO: Store the message; dedupe on id + subAction
      break;
    }
    case 'comments': {
      const from = isObject(event.from) ? str(event.from.username) : undefined;
      console.log(`Comment on ${str(event.platform)} by ${from}: ${str(event.text)}`);
      // TODO: Reply or moderate the comment
      break;
    }
    case 'ads':
      console.log(`Ads event ${str(event.type)} on ${str(event.platform) ?? 'multiple platforms'}`);
      break;
    default:
      // mentions, batch, feed, automations, demo, suspended, ...
      console.log(`Unhandled Ayrshare action: ${str(action) ?? 'unknown'}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.AYRSHARE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AYRSHARE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as received: never re-serialize before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyAyrshareSignature(rawBody, request.headers.get('x-authorization-content-sha256-v2'), secret)) {
    console.error('Ayrshare signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(event)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // At-least-once delivery: dedupe on event.hookId (hold claims for 24 h+)
  console.log(`Ayrshare delivery hookId=${str(event.hookId)}`);
  handleAyrshareEvent(event);

  // Answer 200 within 15 s; Ayrshare retries 408/425/429 and 5xx, other 4xx are final
  return NextResponse.json({ received: true });
}
