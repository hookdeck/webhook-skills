// Generated with: datocms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDatoCmsRequest } from '../../../lib/verify-datocms';

interface DatoCmsPayload {
  entity_type?: string;
  event_type?: string;
  entity?: { id?: string; [key: string]: unknown };
  previous_entity?: unknown;
  [key: string]: unknown;
}

function handleEvent(payload: DatoCmsPayload): void {
  const { entity_type: entityType, event_type: eventType, entity } = payload;

  switch (`${entityType} ${eventType}`) {
    case 'item create':
      console.log(`Record created: ${entity?.id}`);
      // TODO: index the new record
      break;

    case 'item update':
      console.log(`Record updated: ${entity?.id}`);
      // TODO: diff payload.previous_entity against payload.entity
      break;

    case 'item delete':
      console.log(`Record deleted: ${entity?.id}`);
      // TODO: remove the record from external systems
      break;

    case 'item publish':
      console.log(`Record published: ${entity?.id}`);
      // TODO: trigger a site rebuild or sync published content
      break;

    case 'item unpublish':
      console.log(`Record unpublished: ${entity?.id}`);
      // TODO: remove the record from public search
      break;

    case 'item_type create':
    case 'item_type update':
    case 'item_type delete':
      console.log(`Model ${eventType}: ${entity?.id}`);
      // TODO: sync the schema
      break;

    case 'upload create':
    case 'upload update':
    case 'upload delete':
      console.log(`Upload ${eventType}: ${entity?.id}`);
      // TODO: sync the asset to your CDN
      break;

    case 'build_trigger deploy_started':
    case 'build_trigger deploy_succeeded':
    case 'build_trigger deploy_failed':
      console.log(`Build trigger ${eventType}: ${entity?.id}`);
      // TODO: post a deploy notification
      break;

    case 'environment deploy_started':
    case 'environment deploy_succeeded':
    case 'environment deploy_failed':
      console.log(`Environment ${eventType}: ${entity?.id}`);
      // TODO: post a deploy notification
      break;

    case 'maintenance_mode change':
      console.log('Maintenance mode changed');
      // TODO: pause integrations while maintenance mode is on
      break;

    case 'sso_user create':
      console.log(`SSO user added: ${entity?.id}`);
      // TODO: audit the new collaborator
      break;

    case 'cda_cache_tags invalidate':
      console.log('CDA cache tags invalidated');
      // TODO: purge your cache (payload.entity holds the tags)
      break;

    default:
      // Custom payloads may omit entity_type / event_type; acknowledge them anyway.
      console.log(`Unhandled event: ${entityType} ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDatoCmsRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted (custom payloads may not be JSON).
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as DatoCmsPayload);
  } catch (err) {
    console.error('Error handling DatoCMS event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
