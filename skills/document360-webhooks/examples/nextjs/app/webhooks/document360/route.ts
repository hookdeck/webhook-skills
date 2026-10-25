// Generated with: document360-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDocument360Request } from '../../../lib/verify-document360';

// Payload keys are display labels with spaces, e.g. "Knowledge base name".
interface Document360Payload {
  Event?: string;
  'Article name'?: string;
  [key: string]: unknown;
}

function handleEvent(payload: Document360Payload): void {
  const event = payload['Event'];
  const article = payload['Article name'];

  switch (event) {
    case 'Article published':
      console.log(`Article published: ${article}`);
      // TODO: notify the docs team or refresh a search index
      break;

    case 'Article created':
      console.log(`Article created: ${article}`);
      // TODO: add the article to a content tracker
      break;

    case 'Article deleted':
      console.log(`Article deleted: ${article}`);
      // TODO: purge cache entries for every language in payload['Slugs']
      break;

    case 'Article settings saved':
      console.log(`Article settings saved: ${article}`);
      // TODO: re-sync article metadata
      break;

    case 'Article workflow status updated':
      console.log(`Article workflow status updated: ${article}`);
      // TODO: trigger the downstream review step
      break;

    case 'Extension token deleted':
      console.log(`Extension token deleted: ${payload['Extension']}`);
      // TODO: alert the integration owner
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

async function handleWebhook(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDocument360Request(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  // Read as text so any content type is accepted.
  const raw = await request.text();
  if (raw.trim() === '') {
    // Empty body: nothing to dispatch, but the sender is authenticated.
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Document360Payload);
  } catch (err) {
    console.error('Error handling Document360 event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Document360's "Request method" dropdown offers POST or PUT, so handle both.
export async function POST(request: NextRequest) {
  return handleWebhook(request);
}

export async function PUT(request: NextRequest) {
  return handleWebhook(request);
}
