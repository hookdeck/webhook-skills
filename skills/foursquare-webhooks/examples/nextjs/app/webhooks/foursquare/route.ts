// Generated with: foursquare-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Fields used below; Movement SDK payloads carry more (see references/overview.md)
type FoursquareEvent = {
  eventType?: string;
  pilgrimVisitId?: string;
  journeyId?: string;
  placeEvent?: { venues?: { name?: string }[] };
  geofenceEvent?: { geofenceId?: string };
  [key: string]: unknown;
};

// Hash both sides so the buffers are always the same length
// (crypto.timingSafeEqual throws when lengths differ).
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();

/**
 * Verify the Pilgrim-Secret header on a Foursquare Movement SDK webhook.
 *
 * Foursquare does NOT sign payloads. Every request carries the secret from the
 * Developer Console's Pilgrim page, raw with no prefix, in `Pilgrim-Secret`.
 */
export function verifyPilgrimSecret(
  headerValue: string | null | undefined,
  expectedSecret: string | undefined
): boolean {
  if (!headerValue || !expectedSecret) return false;
  return crypto.timingSafeEqual(sha256(headerValue), sha256(expectedSecret));
}

function handleFoursquareEvent(event: FoursquareEvent) {
  switch (event.eventType) {
    case 'placeArrival': {
      const venue = event.placeEvent?.venues?.[0];
      console.log(`Arrival at ${venue?.name ?? 'unknown place'} (visit ${event.pilgrimVisitId})`);
      // TODO: Log the visit or send a notification
      break;
    }
    case 'placeDeparture': {
      const venue = event.placeEvent?.venues?.[0];
      console.log(`Departure from ${venue?.name ?? 'unknown place'} (visit ${event.pilgrimVisitId})`);
      // TODO: Close out the visit
      break;
    }
    case 'placeHistorical':
      console.log(`Historical visit ${event.pilgrimVisitId}`);
      // TODO: Backfill visit history
      break;
    case 'geofenceEnter':
    case 'geofenceDwell':
    case 'geofencePresence':
    case 'geofenceExit':
      console.log(`${event.eventType} for geofence ${event.geofenceEvent?.geofenceId}`);
      // TODO: Trigger location-based logic
      break;
    case 'journeysInProgress':
    case 'journeysApproaching':
    case 'journeysArrived':
    case 'journeysCompleted':
    case 'journeysCanceled':
      console.log(`${event.eventType} for journey ${event.journeyId}`);
      // TODO: Update trip state
      break;
    default:
      console.log(`Unhandled Foursquare event: ${event.eventType ?? 'unknown'}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.FOURSQUARE_PILGRIM_SECRET;

  // Fail closed: without a configured secret there is nothing to check.
  if (!secret) {
    console.error('FOURSQUARE_PILGRIM_SECRET is not set');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  if (!verifyPilgrimSecret(request.headers.get('pilgrim-secret'), secret)) {
    console.error('Foursquare Pilgrim-Secret verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read the raw text for any content type; parse JSON only after authenticating
  let event: FoursquareEvent;
  try {
    event = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  handleFoursquareEvent(event);

  return NextResponse.json({ received: true });
}
