// Generated with: onfleet-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

type VerifyResult = { valid: true } | { valid: false; error: string };

// Onfleet sends a flat object. Fields irrelevant to a trigger arrive as null,
// and `data` may be {} — treat everything as optional.
interface OnfleetEvent {
  triggerId?: number;
  triggerName?: string;
  time?: number; // ms epoch
  taskId?: string | null;
  workerId?: string | null;
  adminId?: string | null;
  actionContext?: { type?: string; id?: string; source?: string } | null;
  data?: {
    task?: {
      id?: string;
      container?: { type?: string } | null;
      completionDetails?: { failureReason?: string } | null;
      delayTime?: number | null;
    } | null;
    worker?: { id?: string } | null;
    dispatch?: { id?: string } | null;
    routePlan?: { id?: string } | null;
  } | null;
  etaSeconds?: number; // SECONDS, fractional (not ms)
  distance?: number; // meters
  delay?: number; // seconds
  status?: number | string; // workerDuty: 0/1; taskBatchCreateJobCompleted: string
  tasksCreated?: number;
  tasksErrored?: number;
  dispatchId?: string | null;
  routePlanId?: string | null;
  recipient?: { id?: string } | null;
  from?: string;
}

/**
 * Verify the X-Onfleet-Signature header.
 *
 * Algorithm: HMAC-SHA512, lowercase hex digest
 * Key:       the org-wide webhook secret, HEX-DECODED to bytes
 * Signed:    the raw request body, nothing else (no timestamp, no prefix)
 *
 * The key must be Buffer.from(secret, 'hex'). Passing the secret string
 * straight to createHmac produces a well-formed digest that never matches.
 */
export function verifyOnfleetSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null,
  secretHex: string
): VerifyResult {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Onfleet-Signature header' };
  }

  const expected = crypto
    .createHmac('sha512', Buffer.from(secretHex, 'hex'))
    .update(rawBody)
    .digest('hex');

  // Onfleet's docs say to compare the hex strings. Normalise case defensively.
  const received = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const computed = Buffer.from(expected, 'utf8');

  // timingSafeEqual throws on unequal lengths, so check first.
  if (received.length !== computed.length) {
    return { valid: false, error: 'Invalid signature' };
  }
  if (!crypto.timingSafeEqual(received, computed)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// Buffer.from(str, 'hex') silently stops at the first non-hex character, so a
// mis-pasted secret would yield a short key instead of an error. Check it.
function isValidHexSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length % 2 === 0 && HEX_PATTERN.test(secret);
}

export function handleOnfleetEvent(event: OnfleetEvent): void {
  const taskId = event.taskId ?? event.data?.task?.id ?? null;
  const workerId = event.workerId ?? event.data?.worker?.id ?? null;

  switch (event.triggerName) {
    // Task lifecycle (data.task)
    case 'taskStarted':
      console.log('Task started:', taskId);
      break;
    case 'taskEta':
      // etaSeconds is SECONDS and fractional; every other time field is ms.
      console.log('Task ETA:', taskId, 'eta seconds:', event.etaSeconds);
      break;
    case 'taskArrival':
      console.log('Worker arriving:', taskId, 'distance (m):', event.distance);
      break;
    case 'taskCompleted':
      console.log('Task completed:', taskId);
      break;
    case 'taskFailed':
      console.log('Task failed:', taskId, event.data?.task?.completionDetails?.failureReason);
      break;
    case 'taskCreated':
      // Does not fire for dashboard task imports or for clones (see taskCloned).
      console.log('Task created:', taskId);
      break;
    case 'taskUpdated':
      console.log('Task updated:', taskId);
      break;
    case 'taskDeleted':
      console.log('Task deleted:', taskId);
      break;
    case 'taskAssigned':
      console.log('Task assigned:', taskId, 'container:', event.data?.task?.container?.type);
      break;
    case 'taskUnassigned':
      console.log('Task unassigned:', taskId);
      break;
    case 'taskDelayed':
      console.log('Task delayed:', taskId, 'delay (s):', event.delay);
      break;
    case 'taskCloned':
      console.log('Task cloned:', taskId);
      break;
    // The trigger table names id 30 `predictedTaskDelay`; the published sample
    // payload carries `taskPredictedDelay`. Accept both (or route on triggerId 30).
    case 'predictedTaskDelay':
    case 'taskPredictedDelay':
      console.log('Predicted task delay:', taskId, 'delayTime:', event.data?.task?.delayTime);
      break;

    // Workers (data.worker)
    case 'workerDuty':
      // status: 0 = off-duty, 1 = on-duty
      console.log('Worker duty changed:', workerId, 'status:', event.status);
      break;
    case 'workerCreated':
      console.log('Worker created:', workerId);
      break;
    case 'workerDeleted':
      console.log('Worker deleted:', workerId);
      break;
    case 'workerUpdated':
      console.log('Worker updated:', workerId);
      break;

    // SMS (top-level fields, data is {})
    case 'smsRecipientResponseMissed':
      console.log('Missed SMS response from:', event.from);
      break;
    case 'SMSRecipientOptOut':
      console.log('Recipient opted out of SMS:', event.recipient?.id);
      break;

    // Jobs (large payloads)
    case 'autoDispatchJobCompleted':
      console.log('Auto-dispatch completed:', event.dispatchId ?? event.data?.dispatch?.id);
      break;
    case 'taskBatchCreateJobCompleted':
      console.log('Batch create completed:', event.status, 'created:', event.tasksCreated, 'errored:', event.tasksErrored);
      break;
    case 'routeOptimizationJobCompleted':
      console.log('Route optimization completed:', event.dispatchId);
      break;

    // Route plans (data.routePlan, data.worker)
    case 'routePlanCreated':
    case 'routePlanStarted':
    case 'routePlanCompleted':
    case 'routePlanUpdated':
    case 'routePlanUnassigned':
    case 'routePlanAssigned':
    case 'routePlanDelayed':
      console.log(`${event.triggerName}:`, event.routePlanId, 'worker:', workerId);
      break;

    default:
      // Onfleet adds triggers over time: log and acknowledge, don't error.
      console.log(`Unhandled Onfleet trigger: ${event.triggerName} (id ${event.triggerId})`);
  }
}

// Validation handshake: Onfleet sends GET ?check=<random_string> when the
// webhook is created. Echo the value as plain text with a 200 (204 is
// rejected). This request is not signed — do not verify it.
export async function GET(request: NextRequest) {
  const check = request.nextUrl.searchParams.get('check');
  if (check === null) {
    return new NextResponse('Missing check parameter', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new NextResponse(check, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// Event delivery: POST, signed. Verify against the raw body bytes.
export async function POST(request: NextRequest) {
  const secret = process.env.ONFLEET_WEBHOOK_SECRET;
  if (!isValidHexSecret(secret)) {
    // Fail closed: never accept unverified deliveries.
    console.error('ONFLEET_WEBHOOK_SECRET is missing or not a hex string; rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes; do not call request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const verification = verifyOnfleetSignature(
    rawBody,
    request.headers.get('x-onfleet-signature'),
    secret
  );

  if (!verification.valid) {
    console.error('Onfleet webhook verification failed:', verification.error);
    return NextResponse.json({ error: `Webhook Error: ${verification.error}` }, { status: 400 });
  }

  let event: OnfleetEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Acknowledge first, then process: Onfleet times out at 10 seconds.
  // after() runs the callback once the response has been sent.
  after(() => {
    try {
      handleOnfleetEvent(event);
    } catch (err) {
      console.error('Error processing Onfleet event:', err);
    }
  });

  return NextResponse.json({ received: true });
}
