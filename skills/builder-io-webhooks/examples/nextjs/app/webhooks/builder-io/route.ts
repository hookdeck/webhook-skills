// Generated with: builder-io-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBuilderRequest } from '../../../lib/verify-builder-io';

interface BuilderPayload {
  operation?: string;
  modelName?: string;
  newValue?: { id?: string; [key: string]: unknown } | null;
  previousValue?: { id?: string; [key: string]: unknown } | null;
  [key: string]: unknown;
}

function handleEvent(payload: BuilderPayload): void {
  const { operation, modelName, newValue, previousValue } = payload;

  switch (operation) {
    case 'publish':
      console.log(`Published ${modelName}: ${newValue?.id}${previousValue ? '' : ' (first publish)'}`);
      // TODO: sync newValue to your database or bust the CDN cache
      break;

    case 'unpublish':
      console.log(`Unpublished ${modelName}: ${newValue?.id}`);
      // TODO: remove the entry from search or a CDN
      break;

    case 'archive':
      console.log(`Archived ${modelName}: ${newValue?.id}`);
      // TODO: hide or retire the entry downstream
      break;

    case 'delete':
      console.log(`Deleted ${modelName}: ${previousValue?.id}`);
      // TODO: delete the mirrored record (newValue is null)
      break;

    case 'scheduledStart':
      console.log(`Scheduled publish started for ${modelName}: ${newValue?.id}`);
      // TODO: warm caches for content going live
      break;

    case 'scheduledEnd':
      console.log(`Scheduled publish ended for ${modelName}: ${newValue?.id}`);
      // TODO: expire the content downstream
      break;

    default:
      console.log(`Unhandled operation: ${operation}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyBuilderRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
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
    handleEvent(payload as BuilderPayload);
  } catch (err) {
    console.error('Error handling Builder.io event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
