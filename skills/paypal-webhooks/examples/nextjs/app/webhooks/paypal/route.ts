// Generated with: paypal-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// Cert cache — keyed by paypal-cert-url. Exported so tests can preload.
export const certCache = new Map<string, string>();

async function fetchCert(certUrl: string): Promise<string> {
  // SECURITY: only trust certificates served from paypal.com hosts.
  const host = new URL(certUrl).hostname;
  if (host !== 'paypal.com' && !host.endsWith('.paypal.com')) {
    throw new Error(`Untrusted cert URL host: ${host}`);
  }
  const cached = certCache.get(certUrl);
  if (cached) return cached;
  const res = await fetch(certUrl);
  if (!res.ok) throw new Error(`Failed to fetch cert: ${res.status}`);
  const pem = await res.text();
  certCache.set(certUrl, pem);
  return pem;
}

export async function verifyPayPalWebhook(
  headers: Headers,
  rawBody: Buffer,
  webhookId: string
): Promise<boolean> {
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const transmissionSig = headers.get('paypal-transmission-sig');
  const certUrl = headers.get('paypal-cert-url');

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl) {
    return false;
  }

  const crc = zlib.crc32(rawBody);
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;

  let cert: string;
  try {
    cert = await fetchCert(certUrl);
  } catch {
    return false;
  }

  const verifier = crypto.createVerify('SHA256');
  verifier.update(message);
  verifier.end();
  try {
    return verifier.verify(cert, transmissionSig, 'base64');
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('PAYPAL_WEBHOOK_ID is not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // CRITICAL: read raw bytes — CRC-32 of the body is part of the signed message.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const valid = await verifyPayPalWebhook(request.headers, rawBody, webhookId);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event_type?: string; id?: string; resource?: { id?: string; dispute_id?: string } };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      console.log('Capture completed:', event.resource?.id);
      break;
    case 'PAYMENT.CAPTURE.REFUNDED':
      console.log('Capture refunded:', event.resource?.id);
      break;
    case 'PAYMENT.SALE.COMPLETED':
      console.log('Sale completed:', event.resource?.id);
      break;
    case 'CHECKOUT.ORDER.APPROVED':
      console.log('Order approved:', event.resource?.id);
      break;
    case 'BILLING.SUBSCRIPTION.CREATED':
      console.log('Subscription created:', event.resource?.id);
      break;
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      console.log('Subscription activated:', event.resource?.id);
      break;
    case 'BILLING.SUBSCRIPTION.CANCELLED':
      console.log('Subscription cancelled:', event.resource?.id);
      break;
    case 'CUSTOMER.DISPUTE.CREATED':
      console.log('Dispute opened:', event.resource?.dispute_id);
      break;
    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }

  return NextResponse.json({ received: true });
}
