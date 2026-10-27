import { NextRequest, NextResponse } from 'next/server';
import { verifyOnshapeSignature, isTimestampFresh } from '../../../lib/onshape';

// Handle a verified Onshape event, dispatching on the body's `event` field
function handleOnshapeEvent(event: any) {
  switch (event.event) {
    case 'webhook.register':
    case 'webhook.ping':
    case 'webhook.unregister':
      // Sent automatically when a webhook is registered, pinged or removed.
      // Returning 200 is all that is needed.
      console.log(`Onshape ${event.event} for webhook ${event.webhookId}`);
      break;

    case 'onshape.model.lifecycle.changed':
      console.log(`Model changed in document ${event.documentId} (element ${event.elementId})`);
      // TODO: Refresh your copy of the model / re-run exports
      break;

    case 'onshape.model.translation.complete':
      console.log(`Translation ${event.translationId} complete in document ${event.documentId}`);
      // TODO: Download the translated file
      break;

    case 'onshape.document.lifecycle.created':
      console.log(`Document created: ${event.documentId}`);
      // TODO: Register the document in your system
      break;

    case 'onshape.document.lifecycle.statechange':
      console.log(`Document ${event.documentId} state: ${event.documentState}`);
      // TODO: Archive or remove data when the state is TRASH or DELETED
      break;

    case 'onshape.revision.created':
      console.log(`Revision created in document ${event.documentId}`);
      // TODO: Sync the release / revision
      break;

    case 'onshape.comment.create':
      console.log(`Comment ${event.commentId} created in document ${event.documentId}`);
      // TODO: Fetch the comment via the REST API and notify
      break;

    case 'onshape.user.lifecycle.updateappsettings':
      console.log(`App settings updated for user ${event.userId} (client ${event.clientId})`);
      // TODO: Re-read the user's app settings
      break;

    default:
      console.log(`Unhandled Onshape event: ${event.event}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ONSHAPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ONSHAPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-onshape-webhook-signature-primary');
  const timestamp = request.headers.get('x-onshape-webhook-timestamp');

  // Raw bytes, whatever the content type - never re-serialize before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Only the primary signature is verified; the -secondary header is ignored
  if (!timestamp || !verifyOnshapeSignature(rawBody, timestamp, signature, secret)) {
    console.error('Onshape webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const tolerance = Number(process.env.ONSHAPE_WEBHOOK_TOLERANCE_SECONDS) || 0;
  if (!isTimestampFresh(timestamp, tolerance)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Retries resend the same event: de-duplicate on event.messageId
  handleOnshapeEvent(event);

  return NextResponse.json({ received: true });
}
