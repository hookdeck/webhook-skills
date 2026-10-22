// Generated with: strapi-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyStrapiRequest } from '../../../lib/verify-strapi';

interface StrapiPayload {
  event?: string;
  model?: string;
  entry?: { documentId?: string; [key: string]: unknown };
  media?: { name?: string; [key: string]: unknown };
  workflow?: { stages?: { from?: { name?: string }; to?: { name?: string } } };
  release?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: StrapiPayload, headers: Headers): void {
  // The body's `event` matches the X-Strapi-Event header.
  const event = payload.event || headers.get('x-strapi-event');

  switch (event) {
    case 'entry.create':
      console.log(`Entry created: ${payload.model} ${payload.entry?.documentId}`);
      // TODO: index the new entry (payload.entry)
      break;

    case 'entry.update':
      console.log(`Entry updated: ${payload.model} ${payload.entry?.documentId}`);
      // TODO: refresh caches or search index
      break;

    case 'entry.delete':
      console.log(`Entry deleted: ${payload.model} ${payload.entry?.documentId}`);
      // TODO: remove the entry downstream (payload only carries the entry's own fields)
      break;

    case 'entry.publish':
      console.log(`Entry published: ${payload.model} ${payload.entry?.documentId}`);
      // TODO: trigger a site rebuild or revalidate the page
      break;

    case 'entry.unpublish':
      console.log(`Entry unpublished: ${payload.model} ${payload.entry?.documentId}`);
      // TODO: take the page down
      break;

    case 'entry.draft-discard':
      console.log(`Draft discarded: ${payload.model} ${payload.entry?.documentId}`);
      // TODO: refresh previews
      break;

    case 'media.create':
      console.log(`Media created: ${payload.media?.name}`);
      // TODO: sync the file (payload.media.url, payload.media.formats)
      break;

    case 'media.update':
      console.log(`Media updated: ${payload.media?.name}`);
      // TODO: refresh the cached file
      break;

    case 'media.delete':
      console.log(`Media deleted: ${payload.media?.name}`);
      // TODO: purge the file from your CDN
      break;

    case 'review-workflows.updateEntryStage': {
      // Enterprise only. This envelope carries `entity` and `workflow`, not `entry`.
      const stages = payload.workflow?.stages;
      console.log(`Review stage changed: ${stages?.from?.name} -> ${stages?.to?.name}`);
      // TODO: notify reviewers
      break;
    }

    case 'releases.publish':
      // Growth and Enterprise. This envelope carries `release`, not `entry`.
      console.log(`Release published: ${payload.release?.name}`);
      // TODO: trigger a deployment
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyStrapiRequest(request.headers)) {
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
    handleEvent(payload as StrapiPayload, request.headers);
  } catch (err) {
    console.error('Error handling Strapi event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
