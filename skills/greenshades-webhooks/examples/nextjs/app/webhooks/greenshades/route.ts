// Generated with: greenshades-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyGreenshadesSignature, timestampWithinTolerance } from '../../../lib/greenshades';

// Subscribed event names come from Greenshades' webhook subscription API;
// the delivery body is not documented.
const eventLabels: Record<string, string> = {
  'payRun.completed': 'Pay run completed',
  'payRun.costReportingTransactions.completed': 'Cost reporting transactions completed',
  'payRun.payRecord.voided': 'Pay record voided',
  'payRun.payRecords.completed': 'Pay records completed',
  'paySchedule.updated': 'Pay schedule updated',
  'employee.added': 'Employee added',
  'employee.updated': 'Employee updated',
  'employee.directDeposit.updated': 'Direct deposit updated',
  'employee.paySchedule.updated': 'Employee pay schedule updated',
  'employee.earningCode.added': 'Earning code added',
  'employee.earningCode.updated': 'Earning code updated',
  'employee.earningCode.deleted': 'Earning code deleted'
};

// ILLUSTRATIVE: Greenshades does not document the delivery body, so which field
// carries the event name is unknown. Check a real delivery and adjust.
function getEventName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  const name = p.eventName ?? p.event ?? p.type ?? p.name;
  return typeof name === 'string' ? name : undefined;
}

async function handleWebhook(request: NextRequest) {
  const secret = process.env.GREENSHADES_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GREENSHADES_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes for every method and content type; a missing body is empty bytes
  const rawBody = Buffer.from(await request.arrayBuffer());
  const timestamp = request.headers.get('x-gs-timestamp');
  const signature = request.headers.get('x-gs-signature');

  // Verify first, for every method
  if (!verifyGreenshadesSignature(rawBody, timestamp, signature, secret)) {
    console.error('Greenshades signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const tolerance = Number(process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS) || 0;
  if (tolerance > 0 && !timestampWithinTolerance(timestamp as string, tolerance)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after the signature check
  let payload: unknown = null;
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  }

  const eventName = getEventName(payload);
  if (eventName && eventLabels[eventName]) {
    console.log(`${eventLabels[eventName]}:`, payload);
  } else {
    console.log(`Unhandled Greenshades event: ${eventName ?? 'unknown'}`);
  }

  return NextResponse.json({ received: true });
}

// Greenshades documents no HTTP method, so every method a sender might use is handled
export {
  handleWebhook as GET,
  handleWebhook as POST,
  handleWebhook as PUT,
  handleWebhook as PATCH,
  handleWebhook as DELETE
};
