// Generated with: salsa-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Salsa delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique event identifier
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's `signatureSecret` after its `whsec_` prefix.
// Hookdeck's Salsa source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
// ---------------------------------------------------------------------------

interface SalsaEvent {
  data: {
    type: string; // e.g. "Employer.created"
    attributes: Record<string, any>; // event-specific; attributes.category is LIFECYCLE or NOTIFICATION
  };
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers: webhook-* first, svix-* when webhook-id is
 * absent. Returns them under the webhook-* names the library expects, or null
 * if any is missing.
 */
function resolveSignatureHeaders(headers: Headers): SignatureHeaders | null {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a Salsa delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 */
function verifySalsaWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SALSA_WEBHOOK_SECRET as string
): SalsaEvent {
  return new Webhook(secret).verify(rawBody, headers) as SalsaEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Salsa's body carries no event id, but webhook-id is the same when an event is
// resent after a failure.
const processedMessageIds = new Set<string>();

function handleEvent(event: SalsaEvent): void {
  // Body shape: { data: { type: "Employer.created", attributes: { ... } } }
  const { type, attributes = {} } = event.data || ({} as Partial<SalsaEvent['data']>);

  switch (type) {
    // --- Employers ---------------------------------------------------------
    case 'Employer.created':
    case 'Employer.updated':
      console.log(`${type}: employer ${attributes.employerId} (external id ${attributes.externalId})`);
      break;
    case 'Employer.onboardingStatus':
      console.log(`Employer onboarding status changed: ${attributes.employerId}`);
      break;

    // --- Workers -----------------------------------------------------------
    case 'Worker.created':
    case 'Worker.updated':
      console.log(`${type}: worker for employer ${attributes.employerId}`);
      break;
    case 'Worker.onboardingStatus':
      console.log(`Worker onboarding status changed for employer ${attributes.employerId}`);
      break;

    // --- Payroll runs ------------------------------------------------------
    case 'PayrollRun.awaitingInput':
      // Salsa needs compensation data for the listed workers before the run can proceed.
      console.log(`Payroll run awaiting input for employer ${attributes.employerId}`);
      break;
    case 'PayrollRun.statusChanged':
      console.log(`Payroll run status changed for employer ${attributes.employerId}`);
      break;

    // --- Notifications (attributes.category === 'NOTIFICATION') ------------
    case 'Notification.workerPayday':
      // Sent on the day the worker is paid (1pm or 11pm UTC). Not sent in the
      // sandbox for Direct Deposit workers.
      console.log(`Worker payday notification for employer ${attributes.employerId}`);
      break;
    case 'Notification.employerPayrollRunConfirmation':
      console.log(`Payroll run confirmed for employer ${attributes.employerId}`);
      break;

    // --- Documents and accounting -----------------------------------------
    case 'Document.uploaded':
      console.log(`Document uploaded for employer ${attributes.employerId}`);
      break;
    case 'AccountingConfiguration.created':
    case 'AccountingConfiguration.updated':
      console.log(`${type}: employer ${attributes.employerId}`);
      break;

    default:
      // Salsa documents more than 70 event types; the list may not be exhaustive.
      console.log(`Unhandled Salsa event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SALSA_WEBHOOK_SECRET) {
    console.error('SALSA_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: SalsaEvent;
  try {
    event = verifySalsaWebhook(rawBody, headers);
  } catch (err) {
    console.error('Salsa webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // A resent event keeps its webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Salsa event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
