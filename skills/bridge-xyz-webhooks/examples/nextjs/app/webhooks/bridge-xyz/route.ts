// Generated with: bridge-xyz-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Reject events whose signature timestamp is older than this (replay protection).
const TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Verify a Bridge `X-Webhook-Signature` header.
 *
 * Header format: `t=<timestamp_ms>,v0=<base64_signature>`
 * Bridge signs with RSA-SHA256 over the SHA256 digest of `"<timestamp>.<rawBody>"`.
 * The digest is fed into an RSA-SHA256 verifier, which hashes it a SECOND time —
 * this matches Bridge's reference implementation exactly. Use the RAW body.
 */
export function verifyBridgeSignature(
  rawBody: string,
  header: string | null,
  publicKeyPem: string,
  toleranceMs: number = TOLERANCE_MS
): boolean {
  if (!header || !publicKeyPem) return false;

  // Parse "t=<ms>,v0=<base64>" — split each pair on the FIRST '=' only, because
  // the base64 signature can contain '=' padding.
  const parts: Record<string, string> = {};
  for (const pair of header.split(',')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    parts[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;

  // Replay protection: reject stale events.
  if (Date.now() - Number(timestamp) > toleranceMs) return false;

  // SHA256 digest of "<timestamp>.<rawBody>". createVerify('sha256') then hashes
  // this digest AGAIN as part of the RSA-SHA256 verification.
  const digest = crypto.createHash('sha256').update(`${timestamp}.${rawBody}`).digest();
  const verifier = crypto.createVerify('sha256');
  verifier.update(digest);
  verifier.end();

  try {
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch {
    return false; // malformed key or signature
  }
}

function getPublicKey(): string {
  // Stored single-line with \n escapes in the env var; convert back to newlines.
  return (process.env.BRIDGE_WEBHOOK_PUBLIC_KEY || '').replace(/\\n/g, '\n');
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification — do not JSON.parse first.
  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Webhook-Signature header' },
      { status: 400 }
    );
  }

  if (!verifyBridgeSignature(rawBody, signature, getPublicKey())) {
    // Return non-2xx so Bridge retries delivery.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Events are named "<category>.<action>", e.g. "customer.updated.status_transitioned".
  const eventType: string = event.event_type || event.type;

  switch (eventType) {
    case 'customer.created':
      console.log('Customer created:', event.event_object_id);
      // Your code: provision the account, begin onboarding
      break;

    case 'customer.updated.status_transitioned':
      console.log('Customer status changed:', event.event_object_id);
      // Your code: react to KYC approval/rejection, update customer state
      break;

    case 'kyc_link.updated.status_transitioned':
      console.log('KYC link status changed:', event.event_object_id);
      // Your code: track KYC/ToS completion, unblock onboarding
      break;

    case 'transfer.created':
      console.log('Transfer created:', event.event_object_id);
      // Your code: record the new transfer in your ledger
      break;

    case 'transfer.updated.status_transitioned':
      console.log('Transfer status changed:', event.event_object_id);
      // Your code: update payment status, trigger fulfillment on settlement
      break;

    case 'virtual_account.activity.created':
      console.log('Virtual account activity:', event.event_object_id);
      // Your code: reconcile incoming funds, credit a balance
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Acknowledge receipt quickly.
  return NextResponse.json({ received: true });
}
