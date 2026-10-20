// Generated with: reducto-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Body of Reducto's async.update webhook
type ReductoJobUpdate = {
  status: 'Completed' | 'Failed' | string;
  job_id: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const secret = process.env.REDUCTO_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body — do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    const wh = new Webhook(secret);
    // As of svix 2.x verify() returns undefined, so the payload is parsed below.
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    console.error('Webhook verification failed:', msg);
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified — only now is it safe to parse.
  let payload: ReductoJobUpdate;
  try {
    payload = JSON.parse(rawBody) as ReductoJobUpdate;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Reducto sends one Svix event type (async.update); branch on job status.
  const { status, job_id: jobId, metadata } = payload;
  console.log(`Received Reducto webhook: job ${jobId} ${status} (svix-id ${svixId})`);

  switch (status) {
    case 'Completed':
      // Results are not in the webhook — fetch them with the Reducto API,
      // e.g. await client.job.retrieve(jobId). Respond within 15s; queue heavy work.
      console.log('Job completed:', { jobId, metadata });
      break;
    case 'Failed':
      console.log('Job failed:', { jobId, metadata });
      break;
    default:
      console.log('Unhandled job status:', status);
  }

  return NextResponse.json({ received: true, status, job_id: jobId }, { status: 200 });
}
