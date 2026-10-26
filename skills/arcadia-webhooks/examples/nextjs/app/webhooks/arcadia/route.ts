// Generated with: arcadia-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyArcadiaRequest } from '../../../lib/verify-arcadia';

interface ArcadiaPayload {
  id?: string;
  eventType?: string;
  resource?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  [key: string]: unknown;
}

// In-memory de-duplication on the payload id. Use a durable store in production.
const seen = new Set<string>();

function handleEvent(payload: ArcadiaPayload): void {
  const { eventType, resource, data } = payload;

  switch (eventType) {
    case 'STATUS_CHANGE':
      console.log(`Status change on ${resource}: ${data?.id}`);
      // TODO: if data.isCustomerActionRequired, prompt the user to fix the connection
      break;

    case 'NEW_DATA_AVAILABLE':
      console.log(`New data available for ${resource}: ${data?.id}`);
      // TODO: fetch the new data for data.accounts
      break;

    case 'EXISTING_DATA_UPDATED':
      console.log(`Existing data updated for ${resource}: ${data?.id}`);
      // TODO: re-sync the affected records
      break;

    case 'DATA_DELETED':
      console.log(`Data deleted (${resource}): ${data?.businessUnitId}`);
      // TODO: remove or move local copies (data.movedToBusinessUnitId)
      break;

    case 'BUSINESS_UNIT_ASSIGNMENT':
      console.log(`Business unit assignment (${resource})`);
      // TODO: update ownership of data.account
      break;

    case 'REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS':
      console.log(`Credential validated: ${data?.id}`);
      // TODO: mark the connection ready
      break;

    case 'REAL_TIME_CREDENTIAL_VALIDATION_FAILURE':
      console.log(`Credential validation failed: ${data?.id}`);
      // TODO: ask the user to re-enter their utility credentials
      break;

    case 'MFA_CHALLENGE_METHOD':
      console.log(`MFA method needed for credential ${data?.credential?.id}`);
      // TODO: show data.verificationMethods and submit the choice
      break;

    case 'MFA_CHALLENGE_CODE':
      console.log(`MFA code needed for credential ${data?.credential?.id}`);
      // TODO: prompt the user for the code
      break;

    default:
      console.log(`Unhandled eventType: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyArcadiaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Arcadia webhook header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const event = payload as ArcadiaPayload;
  if (event.id && seen.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Arcadia event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.id) seen.add(event.id);
  return NextResponse.json({ received: true });
}
