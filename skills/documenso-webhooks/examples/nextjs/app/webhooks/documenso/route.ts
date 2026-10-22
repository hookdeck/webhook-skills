// Generated with: documenso-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDocumensoSecret } from '../../../lib/verify-documenso';

interface DocumensoWebhook {
  event?: string;
  payload?: { title?: string; envelopeId?: string; [key: string]: unknown };
  createdAt?: string;
  webhookEndpoint?: string;
}

function handleEvent(body: DocumensoWebhook): void {
  const { event, payload = {} } = body;

  switch (event) {
    case 'DOCUMENT_CREATED':
      console.log(`Document created: ${payload.title} (${payload.envelopeId})`);
      break;

    case 'DOCUMENT_SENT':
      console.log(`Document sent: ${payload.title}`);
      break;

    case 'DOCUMENT_OPENED':
      console.log(`Document opened: ${payload.title}`);
      break;

    case 'DOCUMENT_SIGNED':
      console.log(`Document signed: ${payload.title}`);
      // TODO: update the signer's status in your database
      break;

    case 'DOCUMENT_RECIPIENT_COMPLETED':
      console.log(`Recipient completed: ${payload.title}`);
      break;

    case 'DOCUMENT_COMPLETED':
      console.log(`Document completed: ${payload.title}`);
      // TODO: fetch the signed PDF and archive it
      break;

    case 'DOCUMENT_REJECTED':
      console.log(`Document rejected: ${payload.title}`);
      // TODO: notify the document owner
      break;

    case 'DOCUMENT_CANCELLED':
      console.log(`Document cancelled: ${payload.title}`);
      break;

    case 'DOCUMENT_REMINDER_SENT':
      console.log(`Reminder sent: ${payload.title}`);
      break;

    case 'RECIPIENT_EXPIRED':
      console.log(`Recipient signing deadline passed: ${payload.title}`);
      break;

    case 'TEMPLATE_CREATED':
    case 'TEMPLATE_UPDATED':
    case 'TEMPLATE_DELETED':
    case 'TEMPLATE_USED':
      console.log(`Template event ${event}: ${payload.title}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDocumensoSecret(request.headers.get('x-documenso-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(body as DocumensoWebhook);
  } catch (err) {
    console.error('Error handling Documenso event:', err);
    // A non-2xx makes Documenso retry the delivery.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
