// Generated with: alchemy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Alchemy Notify webhook signature.
 *
 * Alchemy signs the RAW request body with HMAC-SHA256 (hex) using the
 * per-webhook signing key and sends it in the `X-Alchemy-Signature` header.
 * There is no `sha256=` prefix and no timestamp.
 */
export function verifyAlchemySignature(
  rawBody: string,
  signature: string | null,
  signingKey: string
): boolean {
  if (!signature) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false; // different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('x-alchemy-signature');

  // Verify the signature before trusting anything in the payload
  if (!verifyAlchemySignature(rawBody, signature, process.env.ALCHEMY_SIGNING_KEY!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const payload = JSON.parse(rawBody);
  const { type, id, webhookId, event } = payload;

  console.log(`Received ${type} event (id: ${id}, webhook: ${webhookId})`);

  // Dispatch on the webhook type
  switch (type) {
    case 'ADDRESS_ACTIVITY':
      for (const activity of event?.activity ?? []) {
        console.log(
          `Address activity on ${event.network}: ${activity.value} ${activity.asset} ` +
            `${activity.fromAddress} -> ${activity.toAddress} (${activity.hash})`
        );
      }
      // TODO: credit balances, detect deposits, update accounting, etc.
      break;

    // DEPRECATED 2026-08-30: no longer documented by Alchemy and not accepted by the
    // Notify API's create-webhook endpoint. Kept so webhooks created before that date
    // keep working; don't wire new integrations to it.
    case 'MINED_TRANSACTION':
      console.log(`Mined tx on ${event?.network}: ${event?.transaction?.hash}`);
      // TODO: confirm sends, advance order status, unlock features, etc.
      break;

    // DEPRECATED 2026-08-30: see MINED_TRANSACTION above.
    case 'DROPPED_TRANSACTION':
      console.log(`Dropped tx on ${event?.network}: ${event?.transaction?.hash}`);
      // TODO: resubmit with higher gas, alert the user, roll back UI, etc.
      break;

    case 'NFT_ACTIVITY':
      for (const activity of event?.activity ?? []) {
        console.log(
          `NFT activity on ${event.network}: contract ${activity.contractAddress} ` +
            `token ${activity.erc721TokenId ?? activity.tokenId} ` +
            `${activity.fromAddress} -> ${activity.toAddress}`
        );
      }
      // TODO: update marketplace feed, track ownership, mint alerts, etc.
      break;

    // DEPRECATED 2026-08-30: see MINED_TRANSACTION above.
    case 'NFT_METADATA_UPDATE':
      console.log(
        `NFT metadata update on ${event?.network}: ${event?.contractAddress} #${event?.tokenId}`
      );
      // TODO: refresh cached media/attributes, re-index the collection, etc.
      break;

    case 'GRAPHQL':
      console.log('Custom Webhook (GraphQL) matched:', JSON.stringify(event?.data ?? {}));
      // TODO: handle your Custom Webhook query results
      break;

    default:
      console.log(`Unhandled webhook type: ${type}`);
  }

  // Acknowledge receipt quickly; do heavy work asynchronously
  return NextResponse.json({ received: true });
}
