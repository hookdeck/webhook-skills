// Generated with: cloudentity-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCloudentityRequest } from '../../../lib/verify-cloudentity';

interface AuditEvent {
  event_id?: string;
  type?: string;
  event_type?: string;
  action?: string;
  [key: string]: unknown;
}

// The docs give identifiers as subject.action (user.created) and say the payload
// carries subject_action (user_created). Normalise so either form matches.
function eventName(auditEvent: AuditEvent): string | undefined {
  const raw = auditEvent.type || auditEvent.event_type || auditEvent.action;
  return typeof raw === 'string' ? raw.toLowerCase().replace(/\./g, '_') : undefined;
}

function handleEvent(auditEvent: AuditEvent): void {
  const name = eventName(auditEvent);

  switch (name) {
    case 'user_created':
      console.log(`User created (event ${auditEvent.event_id})`);
      // TODO: create the matching record in your CRM
      break;

    case 'user_updated':
      console.log(`User updated (event ${auditEvent.event_id})`);
      // TODO: sync profile changes
      break;

    case 'user_deleted':
      console.log(`User deleted (event ${auditEvent.event_id})`);
      // TODO: deprovision the user downstream
      break;

    case 'user_authenticated':
      console.log(`User authenticated (event ${auditEvent.event_id})`);
      // TODO: record the sign-in
      break;

    case 'group_created':
      console.log(`Group created (event ${auditEvent.event_id})`);
      // TODO: mirror the group
      break;

    case 'login_failed':
      console.log(`Login failed (event ${auditEvent.event_id})`);
      // TODO: feed your SIEM or alerting
      break;

    case 'consent_revoked':
      console.log(`Consent revoked (event ${auditEvent.event_id})`);
      // TODO: stop processing data covered by the consent
      break;

    case 'client_created':
      console.log(`Client created (event ${auditEvent.event_id})`);
      // TODO: audit the new application
      break;

    default:
      console.log(`Unhandled event: ${name}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyCloudentityRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing X-API-Key' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // SecureAuth sends audit events in batches: { "audit_events": [ ... ] }
  const events = (payload as { audit_events?: unknown } | null)?.audit_events;
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'Expected an audit_events array' }, { status: 400 });
  }

  try {
    for (const auditEvent of events) {
      handleEvent((auditEvent || {}) as AuditEvent);
    }
  } catch (err) {
    console.error('Error handling Cloudentity events:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
