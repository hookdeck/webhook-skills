// Generated with: terraform-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { getTriggers, verifyTerraformSignature, TerraformPayload } from '../../../lib/terraform';

export async function POST(request: NextRequest) {
  const token = process.env.TERRAFORM_NOTIFICATION_TOKEN;
  if (!token) {
    console.error('TERRAFORM_NOTIFICATION_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook token not configured' }, { status: 500 });
  }

  // Read the raw body once (any content type); needed for signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get('x-tfe-notification-signature');

  if (!verifyTerraformSignature(rawBody, signature, token)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verifying the raw body.
  let payload: TerraformPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const trigger of getTriggers(payload)) {
    handleTerraformEvent(trigger, payload);
  }

  // Any 2xx passes HCP Terraform's verification request (trigger "verification").
  return NextResponse.json({ received: true });
}

/**
 * Dispatch a single trigger. Do heavy work asynchronously after responding.
 */
function handleTerraformEvent(trigger: string, payload: TerraformPayload) {
  switch (trigger) {
    case 'verification':
      // Sent when you enable a configuration or click "Send a test".
      console.log('Verification request received');
      break;

    case 'run:created':
      console.log(`Run ${payload.run_id} created in ${payload.workspace_name}`);
      // TODO: Record the new run.
      break;

    case 'run:planning':
      console.log(`Run ${payload.run_id} is planning`);
      break;

    case 'run:needs_attention':
      console.log(`Run ${payload.run_id} needs attention: ${payload.run_url}`);
      // TODO: Notify an approver.
      break;

    case 'run:applying':
      console.log(`Run ${payload.run_id} is applying`);
      break;

    case 'run:completed':
      console.log(`Run ${payload.run_id} completed in ${payload.workspace_name}`);
      // TODO: Trigger downstream deploy steps.
      break;

    case 'run:errored':
      console.log(`Run ${payload.run_id} errored (${payload.notifications?.[0]?.run_status})`);
      // TODO: Alert on-call.
      break;

    case 'assessment:drifted':
      console.log(`Drift detected in ${payload.details?.workspace_name}`);
      // TODO: Open a drift ticket.
      break;

    case 'assessment:check_failure':
      console.log(`Continuous validation checks failed in ${payload.details?.workspace_name}`);
      break;

    case 'assessment:failed':
      console.log(`Health assessment failed in ${payload.details?.workspace_name}`);
      break;

    case 'workspace:auto_destroy_reminder':
    case 'workspace:auto_destroy_run_results':
    case 'workspace:deleted':
    case 'team:change_request':
      console.log(`Received ${trigger}`);
      break;

    default:
      console.log(`Unhandled trigger: ${trigger}`);
  }
}
