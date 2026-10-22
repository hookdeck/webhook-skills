import { NextRequest, NextResponse } from 'next/server';
import { entityOf, verifyStoryblokWebhook } from '../../../lib/storyblok';

export async function POST(request: NextRequest) {
  // Raw body is required: the signature is computed over the exact bytes sent
  const body = await request.text();
  const signature = request.headers.get('webhook-signature');

  if (!verifyStoryblokWebhook(body, signature, process.env.STORYBLOK_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = `${entityOf(payload)}.${payload.action}`;

  switch (event) {
    case 'story.published':
      console.log(`Story published: ${payload.full_slug}`);
      // TODO: Rebuild the site or purge the cache for this slug (e.g. revalidatePath)
      break;

    case 'story.unpublished':
      console.log(`Story unpublished: ${payload.full_slug}`);
      // TODO: Remove the page from the site or search index
      break;

    case 'story.deleted':
      console.log(`Story deleted: ${payload.full_slug}`);
      // TODO: Remove the page and clean up
      break;

    case 'story.moved':
      console.log(`Story moved: ${payload.old_full_slug} -> ${payload.full_slug}`);
      // TODO: Add a redirect from the old slug
      break;

    case 'datasource.entries_updated':
    case 'datasource.entries_deleted':
      console.log(`Datasource ${payload.datasource_slug}: ${payload.action}`);
      // TODO: Refresh cached datasource entries
      break;

    case 'workflow.stage.changed':
      console.log(`Workflow ${payload.workflow_name} -> ${payload.workflow_stage_name}`);
      // TODO: Notify reviewers
      break;

    case 'release.merged':
      console.log(`Release ${payload.release_id} merged`);
      // TODO: Rebuild the site
      break;

    case 'pipeline.deployed':
      console.log(`Pipeline branch ${payload.branch_id} deployed`);
      // TODO: Trigger downstream deploys
      break;

    default:
      // asset.*, user.*, discussion.*, experiment.* and anything new
      console.log(`Unhandled event: ${event}`);
  }

  // Storyblok expects a 2xx with content-type: application/json and does not retry
  return NextResponse.json({ received: true, event });
}
