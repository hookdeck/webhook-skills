// Generated with: pulumi-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Pulumi Cloud signs a delivery only when the webhook has a shared secret. The
// Pulumi-Webhook-Signature header is the bare lowercase hex HMAC-SHA256 of the raw request body,
// keyed with the secret's UTF-8 bytes. Nothing else (no timestamp, no id) is signed.
// https://www.pulumi.com/docs/deployments/concepts/webhooks/
function verifyPulumi(rawBody: Buffer, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.PULUMI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PULUMI_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, read before any JSON parsing and whatever the Content-Type is
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyPulumi(rawBody, request.headers.get('pulumi-webhook-signature'), secret)) {
    console.error('Pulumi webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // The body has no event name: the Pulumi-Webhook-Kind header says which kind of event it is
  const kind = request.headers.get('pulumi-webhook-kind');
  const where = `${event.projectName}/${event.stackName}`;

  switch (kind) {
    case 'stack':
      // event.action says what happened to the stack (for example created)
      console.log(`Stack ${event.action}: ${where}`);
      break;
    case 'stack_update':
      // event.kind is the operation (update, refresh, ...), event.result is succeeded or failed
      console.log(`Stack update (${event.kind}) ${event.result}: ${where} ${event.updateUrl}`);
      break;
    case 'stack_preview':
      console.log(`Stack preview (${event.kind}) ${event.result}: ${where} ${event.updateUrl}`);
      break;
    case 'deployment':
      // event.status is the deployment state (for example running)
      console.log(`Deployment ${event.version} ${event.operation} ${event.status}: ${where}`);
      break;
    case 'drift_detection':
      console.log(`Drift detection ${event.status} (drift detected: ${event.driftDetected}): ${where}`);
      break;
    case 'drift_remediation':
      console.log(`Drift remediation ${event.status}: ${where}`);
      break;
    default:
      // Includes policy_violation: log it, or add a case for it
      console.log(`Unhandled event kind: ${kind}`);
  }

  return NextResponse.json({ received: true });
}
