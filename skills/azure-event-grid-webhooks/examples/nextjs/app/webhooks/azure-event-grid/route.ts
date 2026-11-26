// Generated with: azure-event-grid-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';

import {
  SUBSCRIPTION_DELETED_EVENT_TYPE,
  authenticate,
  findValidationCode,
  handleAbuseProtection,
  normalizeEvents,
} from '../../../lib/eventgrid';

// jsonwebtoken and jwks-rsa need Node crypto and the network, so this route
// must run on the Node.js runtime (not Edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Event Grid treats ONLY 200, 201, 202, 203 and 204 as successful deliveries.
// The validation handshake is stricter still: it must be 200 — "HTTP 202
// Accepted isn't recognized as a valid Event Grid subscription validation
// response" — so this handler answers 200 everywhere.
const ACK_STATUS = 200;

/**
 * CloudEvents v1.0 abuse-protection preflight.
 *
 * This fires INSTEAD OF the SubscriptionValidationEvent when the event
 * subscription uses `--event-delivery-schema cloudeventschemav1_0`.
 */
export async function OPTIONS(request: Request) {
  const requestOrigin = request.headers.get('webhook-request-origin');
  const result = handleAbuseProtection(requestOrigin);
  console.log(
    'CloudEvents abuse-protection preflight from',
    requestOrigin || '(no WebHook-Request-Origin)',
    '->',
    result.status
  );
  return new NextResponse(null, { status: result.status, headers: result.headers });
}

export async function POST(request: Request) {
  // Event Grid does not sign the body, so there is no raw-body requirement:
  // parsing first is safe here in a way it never is for an HMAC provider.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Event Grid schema => JSON array. CloudEvents schema => single JSON object.
  const events = normalizeEvents(body);
  if (!events) {
    return NextResponse.json({ error: 'Invalid Event Grid payload' }, { status: 400 });
  }

  // The handshake arrives as an array containing ONLY the validation event.
  const validationCode = findValidationCode(events);

  // Authenticate before answering anything, including the handshake. For the
  // handshake specifically, withholding the 200 is how validation is failed on
  // purpose for a subscription we do not recognise.
  const auth = await authenticate((name) => request.headers.get(name), {
    // Event Grid replays every query parameter from the subscription's endpoint
    // URL on each delivery, so a secret can ride there instead of in a header.
    getQueryParam: (name) => new URL(request.url).searchParams.get(name),
    isValidation: validationCode !== null,
  });
  if (!auth.ok) {
    console.warn('Rejected Event Grid request:', auth.status, auth.error);
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (validationCode) {
    console.log('Subscription validation handshake for:', auth.subscriptionName);
    // Single JSON OBJECT (not an array), HTTP 200, within 30 seconds.
    // The documented field name is camelCase `validationResponse`; Microsoft's
    // own C#/JS samples emit PascalCase `ValidationResponse`.
    return NextResponse.json({ validationResponse: validationCode }, { status: 200 });
  }

  // Retry signal: `aeg-delivery-count` is the number of attempts for this event.
  const deliveryCount = Number(request.headers.get('aeg-delivery-count') || 1);
  if (deliveryCount > 1) {
    console.log('Retry delivery, attempt', deliveryCount);
  }
  console.log('aeg-event-type:', request.headers.get('aeg-event-type'));

  for (const event of events) {
    // Delivery is at-least-once and unordered: de-duplicate on the event id.
    // Your code: if (await alreadyProcessed(event.id)) continue;
    console.log(`[${event.schema}] ${event.type} ${event.id} subject=${event.subject}`);

    switch (event.type) {
      case SUBSCRIPTION_DELETED_EVENT_TYPE:
        // data.eventSubscriptionId is the Azure resource ID of the deleted
        // event subscription. Also flagged by `aeg-event-type: SubscriptionDeletion`.
        console.log('Event subscription deleted:', event.data?.eventSubscriptionId);
        break;

      case 'Microsoft.Storage.BlobCreated':
        // Published by Azure Blob Storage, not by Event Grid itself.
        console.log('Blob created:', event.data?.url);
        break;

      case 'Microsoft.Storage.BlobDeleted':
        console.log('Blob deleted:', event.data?.url);
        break;

      case 'Microsoft.Resources.ResourceWriteSuccess':
        console.log('Resource write succeeded:', event.subject);
        break;

      default:
        // Event Grid is a broker: most event types belong to the publishing
        // service or to your own custom topic. Route on your own types here.
        console.log('Unhandled event type:', event.type);
    }
  }

  // Acknowledge fast. Event Grid waits 30 seconds for a response; exceeding it
  // queues the message for retry. Do slow work asynchronously.
  return NextResponse.json({ received: events.length }, { status: ACK_STATUS });
}
