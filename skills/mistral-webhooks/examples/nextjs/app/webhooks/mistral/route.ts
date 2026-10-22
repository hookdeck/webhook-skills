import { NextRequest, NextResponse } from 'next/server';
import { verifyMistralWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get('x-mistral-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing x-mistral-signature header' }, { status: 400 });
  }

  if (!verifyMistralWebhook(rawBody, signature, process.env.MISTRAL_WEBHOOK_SECRET)) {
    console.error('Mistral webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: { event?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data = payload.data ?? {};

  // Retries can deliver the same event twice: dedupe on session_id + event in production
  switch (payload.event) {
    case 'call_started':
      console.log(`Call started: ${data.session_id} (agent ${data.agent_id})`);
      // TODO: open a call record
      break;

    case 'call_ended':
      console.log(`Call ended: ${data.session_id} after ${data.duration_seconds}s`);
      // transcript is best effort and may be null
      // TODO: store transcript, update CRM
      break;

    case 'call_failed':
      console.log(`Call failed: ${data.session_id} (${data.error})`);
      // TODO: alert, track failure
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  // Acknowledge quickly; Mistral times out after 10 seconds
  return NextResponse.json({ status: 'ok' });
}
