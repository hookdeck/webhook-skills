// Generated with: voiceflow-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.VOICEFLOW_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('VOICEFLOW_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    // The project-level session webhook doesn't send these headers
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Voiceflow (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Voiceflow webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `type`; the details sit under `data`, and `time` is Unix ms
  const type: string = event.type;
  const data: Record<string, any> = event.data ?? {};
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Voiceflow webhook ${id}: ${type} (${event.resource})`);

  switch (type) {
    case 'organization.project.created':
      console.log('Project created:', data.projectID, data.projectMetadata?.name);
      break;
    case 'organization.project.deleted':
      console.log('Project deleted:', data.projectID, data.projectMetadata?.name);
      break;
    case 'organization.project.environment.created':
      console.log('Environment created:', data.createdProjectEnvironmentID, 'from', data.source?.environmentID);
      break;
    case 'organization.project.environment.published':
      console.log(
        'Environment published:',
        data.publishedProjectEnvironmentID,
        data.publishedVersionIDBefore,
        '->',
        data.publishedVersionIDAfter
      );
      break;
    case 'organization.project.environment.merged':
      console.log(
        'Environment merged:',
        data.sourceProjectEnvironmentID,
        '->',
        data.targetProjectEnvironmentID,
        'source removed:',
        data.sourceProjectEnvironmentRemoved
      );
      break;
    case 'organization.project.environment.deleted':
      console.log('Environment deleted:', data.deletedProjectEnvironmentID);
      break;
    default:
      // Return 200 for events you don't handle; the documented list may not be exhaustive
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
