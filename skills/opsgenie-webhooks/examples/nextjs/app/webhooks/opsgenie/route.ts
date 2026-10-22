// Generated with: opsgenie-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOpsgenieRequest } from '../../../lib/verify-opsgenie';

interface OpsgeniePayload {
  action?: string;
  alert?: Record<string, any>;
  source?: { name?: string; type?: string };
  [key: string]: any;
}

function handleAction(payload: OpsgeniePayload): void {
  const { action } = payload;
  const alert = payload.alert ?? {};
  const id = alert.alertId;

  switch (action) {
    case 'Create':
      console.log(`Alert created: ${id} ${alert.message}`);
      // TODO: open a ticket or post to chat (alert.tags, alert.teams, alert.recipients)
      break;

    case 'Acknowledge':
      console.log(`Alert acknowledged: ${id}`);
      // TODO: mark the ticket as in progress (alert.username)
      break;

    case 'UnAcknowledge':
      console.log(`Alert unacknowledged: ${id}`);
      // TODO: reopen the ticket
      break;

    case 'AddNote':
      console.log(`Note added: ${id}`);
      // TODO: sync alert.note as a comment
      break;

    case 'AddTags':
      console.log(`Tags added: ${id} ${alert.addedTags}`);
      // TODO: sync alert.addedTags (comma-separated)
      break;

    case 'RemoveTags':
      console.log(`Tags removed: ${id} ${alert.removedTags}`);
      // TODO: sync alert.removedTags (comma-separated)
      break;

    case 'Close':
      console.log(`Alert closed: ${id}`);
      // TODO: resolve the ticket
      break;

    case 'AssignOwnership':
      console.log(`Ownership assigned: ${id} -> ${alert.owner}`);
      // TODO: assign the ticket to alert.owner
      break;

    case 'TakeOwnership':
      console.log(`Ownership taken: ${id}`);
      // TODO: assign the ticket to alert.username
      break;

    case 'Delete':
      console.log(`Alert deleted: ${id}`);
      // TODO: remove or archive the ticket
      break;

    case 'Escalate':
      // The Escalate payload carries only alert.alertId plus escalationName and escalationNotify.
      console.log(`Alert escalated: ${id} (${payload.escalationName})`);
      // TODO: notify payload.escalationNotify
      break;

    case 'UpdatePriority':
      console.log(`Priority updated: ${id} ${alert.oldPriority} -> ${alert.priority}`);
      // TODO: sync alert.priority
      break;

    case 'UpdateDescription':
      console.log(`Description updated: ${id}`);
      // TODO: sync alert.description
      break;

    case 'UpdateMessage':
      console.log(`Message updated: ${id}`);
      // TODO: sync alert.message
      break;

    case 'AddTeam':
      console.log(`Team added: ${id} ${alert.team}`);
      // TODO: notify alert.team
      break;

    case 'AddRecipient':
      console.log(`Recipient added: ${id} ${alert.recipient}`);
      // TODO: notify alert.recipient
      break;

    default:
      // Custom alert actions send their own name as `action`.
      console.log(`Custom or unhandled action: ${action}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyOpsgenieRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
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
    handleAction(payload as OpsgeniePayload);
  } catch (err) {
    console.error('Error handling Opsgenie action:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
