// Generated with: copper-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCopperRequest } from '../../../lib/verify-copper';

const TYPES = ['lead', 'person', 'company', 'opportunity', 'project', 'task', 'activity_log'];
const EVENTS = ['new', 'update', 'delete'];

interface CopperPayload {
  ids: number[];
  type: string;
  event: string;
  subscription_id?: number;
  updated_attributes?: Record<string, unknown>;
  timestamp?: string;
  // Key/value pairs from the subscription's optional `secret` object are merged in at the top level.
  [key: string]: unknown;
}

function handleEvent(payload: CopperPayload): void {
  const { ids, type, event } = payload;

  // Dispatch on type + event.
  switch (`${type}.${event}`) {
    case 'person.new':
      console.log(`New person(s): ${ids.join(', ')}`);
      // TODO: fetch GET /people/{id} and sync to your system
      break;

    case 'person.update':
      console.log(`Person(s) updated: ${ids.join(', ')}`, payload.updated_attributes || {});
      // TODO: apply payload.updated_attributes
      break;

    case 'opportunity.update':
      console.log(`Opportunity(ies) updated: ${ids.join(', ')}`);
      // TODO: check stage / status changes
      break;

    case 'lead.delete':
      console.log(`Lead(s) deleted: ${ids.join(', ')}`);
      // TODO: remove the leads downstream
      break;

    default:
      if (TYPES.includes(type) && EVENTS.includes(event)) {
        console.log(`Copper ${type} ${event}: ${ids.join(', ')}`);
        // TODO: handle company, project, task and activity_log records
      } else {
        console.log(`Unhandled event: ${type}.${event}`);
      }
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyCopperRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const p = payload as Partial<CopperPayload> | null;
  if (
    !p || typeof p !== 'object' || Array.isArray(p) ||
    !Array.isArray(p.ids) || typeof p.type !== 'string' || typeof p.event !== 'string'
  ) {
    return NextResponse.json({ error: 'Expected an object with ids, type and event' }, { status: 400 });
  }

  try {
    handleEvent(p as CopperPayload);
  } catch (err) {
    console.error('Error handling Copper event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
