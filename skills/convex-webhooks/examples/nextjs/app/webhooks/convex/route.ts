// Generated with: convex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { parseEvents, verifySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes are required for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing x-webhook-signature header' }, { status: 401 });
  }
  if (!verifySignature(rawBody, signature, process.env.CONVEX_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events;
  try {
    events = parseEvents(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // There is no event header: each event in the batch carries its own `topic`
  for (const event of events) {
    switch (event?.topic) {
      case 'verification':
        console.log('Log stream verified:', event.message);
        break;
      case 'console':
        console.log(`[${event.log_level}] ${event.function?.path}: ${event.message}`);
        break;
      case 'function_execution':
        console.log(
          `${event.function?.type} ${event.function?.path} ${event.status} in ${event.execution_time_ms}ms`
        );
        break;
      case 'audit_log':
        console.log('Audit log:', event.audit_log_action);
        break;
      case 'scheduler_stats':
        console.log(`Scheduler lag ${event.lag_seconds}s, ${event.num_running_jobs} running jobs`);
        break;
      case 'current_storage_usage':
        console.log('Storage usage: documents', event.total_document_size_bytes, 'bytes');
        break;
      default:
        console.log('Unhandled topic:', event?.topic);
    }
  }

  return NextResponse.json({ received: true });
}
