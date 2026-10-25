// Generated with: theirstack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyTheirStackWebhook } from '../../../lib/verify';

export async function POST(request: Request) {
  // Read the raw bytes for signature verification (any content type)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-theirstack-signature-256');

  // Verify first, parse second
  if (!verifyTheirStackWebhook(rawBody, signature, process.env.THEIRSTACK_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { id?: number; type?: string; payload?: any };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope: { id, type, payload }. The event name is in the body, not a header.
  const { id, type, payload } = event;
  console.log(`Received TheirStack event: ${type} (${id})`);

  switch (type) {
    case 'job.new':
      console.log('New job:', payload?.job_title, payload?.company_domain);
      // TODO: Add to CRM, alert sales, etc. Dedupe on payload.id.
      break;

    case 'company.new':
      console.log('New company:', payload?.name, payload?.domain);
      // TODO: Create a lead, enrich, etc.
      break;

    case 'job.closed':
      // Minimal payload: { id, closed_at }
      console.log('Job closed:', payload?.id, payload?.closed_at);
      // TODO: Mark the job as closed in your system.
      break;

    case 'tech.new':
      console.log('New technology detected for company');
      // TODO: Update technographic records (access is by request).
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Any 2xx acknowledges receipt; failures are retried hourly for 48 hours
  return NextResponse.json({ received: true });
}
