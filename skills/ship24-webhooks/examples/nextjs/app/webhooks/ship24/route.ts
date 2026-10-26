// Generated with: ship24-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyShip24Request } from '../../../lib/verify-ship24';

interface Ship24Tracking {
  metadata: { generatedAt?: string; messageId?: string; topic?: string };
  tracker?: { trackingNumber?: string; [key: string]: unknown };
  events?: Array<{ status?: string; occurrenceDatetime?: string; [key: string]: unknown }>;
  data?: { status?: string; content?: { type?: string; text?: string | null; downloadUrl?: string }; [key: string]: unknown };
  [key: string]: unknown;
}

// In-memory dedupe for the example. Use a shared store (Redis, a database unique key) in production.
const processedMessageIds = new Set<string>();

function handleTracking(tracking: Ship24Tracking): void {
  const { metadata, tracker } = tracking;

  switch (metadata.topic) {
    case 'tracking/events': {
      const event = (tracking.events ?? [])[0];
      console.log(`Tracking update for ${tracker?.trackingNumber}: ${event?.status}`);
      // TODO: compare event.occurrenceDatetime with the latest stored event before changing
      // shipment status, because messages can arrive out of order
      break;
    }

    case 'tracking/pod': {
      const { data } = tracking;
      console.log(`Proof of delivery for ${tracker?.trackingNumber}: ${data?.status}`);
      // TODO: if data.status is "found", store data.content.text or download
      // data.content.downloadUrl (valid for 7 days)
      break;
    }

    default:
      console.log(`Unhandled topic: ${metadata.topic}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyShip24Request(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization bearer secret' }, { status: 401 });
  }

  // request.text() reads the body whatever the content type is.
  let payload: { trackings?: unknown };
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const trackings = payload?.trackings;
  if (
    !Array.isArray(trackings) ||
    !trackings.every((t) => t && typeof t.metadata === 'object' && t.metadata !== null)
  ) {
    return NextResponse.json(
      { error: 'Expected { trackings: [...] } with metadata on each item' },
      { status: 400 }
    );
  }

  try {
    // trackings holds one item unless the account groups updates, so always loop.
    for (const tracking of trackings as Ship24Tracking[]) {
      const { messageId } = tracking.metadata;
      if (messageId && processedMessageIds.has(messageId)) {
        console.log(`Duplicate message ${messageId}, skipping`);
        continue;
      }
      handleTracking(tracking);
      if (messageId) processedMessageIds.add(messageId);
    }
  } catch (err) {
    console.error('Error handling Ship24 message:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 }); // Ship24 retries non-2xx
  }

  return NextResponse.json({ received: true });
}
