// Generated with: socure-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySocureRequest } from '../../../lib/verify-socure';

interface SocureData {
  id?: string;
  eval_id?: string;
  decision?: string;
  [key: string]: unknown;
}

interface SocurePayload {
  event_id?: string;
  event_at?: string;
  event_type?: string;
  data?: SocureData;
  [key: string]: unknown;
}

function handleEvent(payload: SocurePayload): void {
  const { event_id, event_type, data } = payload;

  switch (event_type) {
    case 'evaluation_completed':
      console.log(`Evaluation completed: ${data?.eval_id} decision=${data?.decision}`);
      // TODO: act on data.decision (ACCEPT / REVIEW / REJECT)
      break;

    case 'evaluation_paused':
      console.log(`Evaluation paused: ${data?.eval_id}`);
      // TODO: send the user to step-up (DocV, OTP) and resume the evaluation
      break;

    case 'reevaluation':
      console.log(`Case reevaluated: ${data?.eval_id}`);
      // TODO: refresh the stored decision
      break;

    case 'workflow_execution_failed':
      console.log(`Workflow execution failed: ${data?.eval_id}`);
      // TODO: alert and retry the evaluation
      break;

    case 'decision_update':
      console.log(`Decision updated: ${data?.eval_id}`);
      // TODO: sync the reviewer's new decision
      break;

    case 'fraud_confirming':
      console.log(`Fraud status confirmed: ${data?.eval_id}`);
      // TODO: record the fraud / non-fraud label
      break;

    case 'review_case_assigned':
      console.log(`Case assigned: ${data?.id}`);
      // TODO: notify the reviewer
      break;

    case 'review_case_unassigned':
      console.log(`Case unassigned: ${data?.id}`);
      // TODO: return the case to the queue
      break;

    case 'case_status_updated':
      console.log(`Case status updated: ${data?.id}`);
      // TODO: sync the case status and sub-status
      break;

    case 'case_notes_added':
      console.log(`Case notes added: ${data?.id}`);
      // TODO: sync the notes
      break;

    case 'case_attachment_added':
      console.log(`Case attachment added: ${data?.id}`);
      // TODO: sync the attachments
      break;

    case 'watchlist_notification_monitored_search_updated':
      console.log(`Watchlist monitoring updated: ${data?.id}`);
      // TODO: review the monitored entity
      break;

    case 'case_management_notification_case_closure':
      console.log(`Watchlist case closed: ${data?.id}`);
      // TODO: close the matching case
      break;

    default:
      console.log(`Unhandled event: ${event_type} (${event_id})`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySocureRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
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
    handleEvent(payload as SocurePayload);
  } catch (err) {
    console.error('Error handling Socure event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
