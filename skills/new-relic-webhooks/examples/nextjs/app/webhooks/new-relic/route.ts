// Generated with: new-relic-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNewRelicRequest } from '../../../lib/verify-new-relic';

// Shape of the illustrative Handlebars template in references/setup.md.
// The real payload is whatever template you configure in the workflow. state is New Relic's
// issue life cycle state (CREATED, ACTIVATED, CLOSED); acknowledged is its isAcknowledged boolean.
interface NewRelicIssuePayload {
  issueId?: string;
  title?: string;
  state?: string;
  acknowledged?: boolean | string;
  priority?: string;
  issuePageUrl?: string;
  [key: string]: unknown;
}

function handleIssue(payload: NewRelicIssuePayload): void {
  const { issueId, title, priority, issuePageUrl } = payload;
  const state = String(payload.state || '').toUpperCase();
  const acknowledged = payload.acknowledged === true || payload.acknowledged === 'true';

  switch (state) {
    case 'CREATED':
    case 'ACTIVATED':
      if (acknowledged) {
        console.log(`Issue acknowledged: ${issueId} ${title}`);
        // TODO: mark the ticket as being worked
      } else {
        console.log(`Issue ${state.toLowerCase()}: ${issueId} ${title} (${priority}) ${issuePageUrl}`);
        // TODO: page on-call or open a ticket
      }
      break;

    case 'CLOSED':
      console.log(`Issue closed: ${issueId} ${title}`);
      // TODO: close the matching ticket
      break;

    default:
      console.log(`Unhandled state: ${payload.state}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNewRelicRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="new-relic"' } }
    );
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

  try {
    handleIssue(payload as NewRelicIssuePayload);
  } catch (err) {
    console.error('Error handling New Relic notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
