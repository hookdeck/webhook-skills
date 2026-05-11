import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify HubSpot v3 webhook signature.
 *
 * signed_content = method + URI + raw body + X-HubSpot-Request-Timestamp
 * signature      = base64(HMAC-SHA256(signed_content, app_client_secret))
 */
export function verifyHubSpotWebhook(args: {
  method: string;
  uri: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
}): boolean {
  const { method, uri, rawBody, timestamp, signature, secret } = args;
  if (!signature || !timestamp || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const signedContent = `${method}${uri}${rawBody}${timestamp}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface HubSpotEvent {
  eventId?: number;
  subscriptionId?: number;
  portalId?: number;
  occurredAt?: number;
  subscriptionType?: string;
  objectId?: number;
  propertyName?: string;
  propertyValue?: unknown;
  changeSource?: string;
  changeFlag?: string;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signature = request.headers.get('x-hubspot-signature-v3');
  const timestamp = request.headers.get('x-hubspot-request-timestamp');

  // Reconstruct the URI HubSpot signed. Behind a proxy, NextRequest.url reflects
  // the incoming forwarded URL. Use the forwarded host/proto if present.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const host = forwardedHost ?? request.headers.get('host') ?? new URL(request.url).host;
  const proto = forwardedProto ?? new URL(request.url).protocol.replace(':', '');
  const path = new URL(request.url).pathname + new URL(request.url).search;
  const uri = `${proto}://${host}${path}`;

  const valid = verifyHubSpotWebhook({
    method: request.method,
    uri,
    rawBody,
    timestamp,
    signature,
    secret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
  });

  if (!valid) {
    console.error('HubSpot signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let events: HubSpotEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const event of events) {
    switch (event.subscriptionType) {
      case 'contact.creation':
        console.log('New contact:', event.objectId);
        break;

      case 'contact.propertyChange':
        console.log('Contact property changed:', event.objectId, event.propertyName, '->', event.propertyValue);
        break;

      case 'contact.deletion':
        console.log('Contact deleted:', event.objectId);
        break;

      case 'company.creation':
        console.log('New company:', event.objectId);
        break;

      case 'company.propertyChange':
        console.log('Company property changed:', event.objectId, event.propertyName);
        break;

      case 'deal.creation':
        console.log('New deal:', event.objectId);
        break;

      case 'deal.propertyChange':
        console.log('Deal property changed:', event.objectId, event.propertyName, '->', event.propertyValue);
        break;

      case 'ticket.creation':
        console.log('New ticket:', event.objectId);
        break;

      default:
        console.log('Unhandled event:', event.subscriptionType);
    }
  }

  return NextResponse.json({ received: true });
}
