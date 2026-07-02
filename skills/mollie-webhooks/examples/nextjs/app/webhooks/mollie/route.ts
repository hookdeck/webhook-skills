// Generated with: mollie-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createMollieClient, type MollieClient } from '@mollie/api-client';

// Mollie webhooks are NOT signed. Mollie POSTs an application/x-www-form-urlencoded
// body with a single `id` (e.g. tr_xxx) and NO status. We fetch the payment from
// the Mollie API to read its authoritative status — the "fetch-to-confirm" pattern.

let client: MollieClient | undefined;

function mollie(): MollieClient {
  if (!client) {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) throw new Error('MOLLIE_API_KEY is not set');
    client = createMollieClient({ apiKey });
  }
  return client;
}

// Returns the payment, or null for an unknown/deleted id (Mollie API 404).
// Re-throws transient errors so the caller can respond 500 and let Mollie retry.
async function fetchPayment(id: string) {
  try {
    return await mollie().payments.get(id);
  } catch (err) {
    if (err && (err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

// Act on the authoritative status. Keep this idempotent — Mollie may call the
// webhook more than once for the same status.
function handlePayment(payment: { id: string; status: string }) {
  switch (payment.status) {
    case 'paid':
      console.log(`Payment ${payment.id} paid`);
      // TODO: fulfill the order, send a receipt
      break;
    case 'authorized':
      console.log(`Payment ${payment.id} authorized (capture to collect)`);
      break;
    case 'canceled':
      console.log(`Payment ${payment.id} canceled`);
      break;
    case 'expired':
      console.log(`Payment ${payment.id} expired`);
      break;
    case 'failed':
      console.log(`Payment ${payment.id} failed`);
      break;
    case 'pending':
      console.log(`Payment ${payment.id} pending`);
      break;
    case 'open':
      console.log(`Payment ${payment.id} still open`);
      break;
    default:
      console.log(`Payment ${payment.id} has unhandled status: ${payment.status}`);
  }
}

export async function POST(request: NextRequest) {
  // Mollie sends application/x-www-form-urlencoded, NOT JSON.
  const form = await request.formData();
  const id = form.get('id');

  if (!id || typeof id !== 'string') {
    // Not a valid Mollie webhook.
    return new NextResponse('Missing id', { status: 400 });
  }

  let payment;
  try {
    payment = await fetchPayment(id);
  } catch (err) {
    // Mollie API unreachable / errored — return 500 so Mollie retries later.
    console.error(`Failed to fetch payment ${id}:`, (err as Error).message);
    return new NextResponse('Could not fetch payment', { status: 500 });
  }

  if (!payment) {
    // Unknown/deleted id — acknowledge so Mollie stops retrying.
    return new NextResponse('OK', { status: 200 });
  }

  handlePayment(payment);
  return new NextResponse('OK', { status: 200 });
}
