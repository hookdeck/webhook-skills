// Generated with: quickbooks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

type QuickBooksEvent = {
  id: string;
  type: string;
  entity: string;
  action: string;
  entityId: string;
  realmId: string;
  time: string;
  data: Record<string, unknown>;
};

/**
 * Verify a QuickBooks Online webhook signature.
 * Intuit sends base64(HMAC-SHA256(rawBody, verifierToken)) in the intuit-signature header.
 */
function verifyQuickBooksSignature(
  rawBody: string,
  signature: string | null,
  verifierToken: string | undefined
): boolean {
  if (!signature || !verifierToken) return false;

  const expected = crypto
    .createHmac('sha256', verifierToken)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// Legacy eventNotifications operations -> CloudEvents event names
const LEGACY_OPERATIONS: Record<string, string> = {
  Create: 'created',
  Update: 'updated',
  Delete: 'deleted',
  Merge: 'merged',
  Void: 'voided',
  Emailed: 'emailed',
};

/**
 * Normalize both payload shapes into a flat list of events:
 * - CloudEvents (current): top-level array, type = "qbo.{entity}.{event}.v1"
 * - Legacy: { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvents(payload: any): QuickBooksEvent[] | null {
  if (Array.isArray(payload)) {
    return payload.map((event) => {
      const [, entity = '', action = ''] = String(event.type ?? '').split('.');
      return {
        id: event.id,
        type: event.type,
        entity,
        action,
        entityId: event.intuitentityid,
        realmId: event.intuitaccountid,
        time: event.time,
        data: event.data ?? {},
      };
    });
  }

  if (payload && Array.isArray(payload.eventNotifications)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return payload.eventNotifications.flatMap((notification: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (notification.dataChangeEvent?.entities ?? []).map((entity: any) => {
        const name = String(entity.name ?? '').toLowerCase();
        const action = LEGACY_OPERATIONS[entity.operation] ?? String(entity.operation ?? '').toLowerCase();
        return {
          id: `${notification.realmId}-${entity.name}-${entity.id}-${entity.lastUpdated}`,
          type: `qbo.${name}.${action}.v1`,
          entity: name,
          action,
          entityId: entity.id,
          realmId: notification.realmId,
          time: entity.lastUpdated,
          data: entity.deletedId ? { deletedid: entity.deletedId } : {},
        };
      })
    );
  }

  return null;
}

function handleEvent(event: QuickBooksEvent) {
  const label = `${event.entity} ${event.entityId} (realm ${event.realmId})`;

  switch (event.action) {
    case 'created':
      console.log(`Created: ${label}`);
      // TODO: Fetch the record from the Accounting API and sync it
      break;

    case 'updated':
      console.log(`Updated: ${label}`);
      // TODO: Re-fetch the record and update your copy
      break;

    case 'deleted':
      console.log(`Deleted: ${label}`);
      // TODO: Remove or archive your copy
      break;

    case 'merged':
      console.log(`Merged: ${label}, removed ID ${event.data.deletedid}`);
      // TODO: Re-point references from data.deletedid to entityId
      break;

    case 'voided':
      console.log(`Voided: ${label}`);
      // TODO: Mark the transaction void
      break;

    case 'emailed':
      console.log(`Emailed: ${label}`);
      // TODO: Record that the document was sent
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  const signature = request.headers.get('intuit-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing intuit-signature header' }, { status: 400 });
  }

  if (!verifyQuickBooksSignature(rawBody, signature, process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN)) {
    console.error('QuickBooks webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after the signature is verified
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = normalizeEvents(payload);
  if (!events) {
    return NextResponse.json({ error: 'Unrecognized payload' }, { status: 400 });
  }

  // One notification can contain events for several companies (realm IDs).
  // Intuit expects a 200 within 3 seconds - in production, enqueue and return.
  events.forEach(handleEvent);

  return NextResponse.json({ received: true, count: events.length });
}
