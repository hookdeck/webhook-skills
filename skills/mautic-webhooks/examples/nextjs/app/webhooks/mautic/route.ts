import { NextRequest, NextResponse } from 'next/server';
import { verifyMauticWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body (text) for signature verification, whatever the content type
  const body = await request.text();
  const signature = request.headers.get('webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Webhook-Signature header' }, { status: 400 });
  }

  if (!verifyMauticWebhook(body, signature, process.env.MAUTIC_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is keyed by event type; each value is an array of events.
  // In queue mode one request can hold several types and several events per type.
  for (const [eventType, events] of Object.entries(payload)) {
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      handleEvent(eventType, event);
    }
  }

  return NextResponse.json({ received: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleEvent(eventType: string, event: any) {
  switch (eventType) {
    case 'mautic.lead_post_save_new':
      console.log('Contact identified:', event.contact?.id);
      // TODO: Sync new contact to CRM, etc.
      break;

    case 'mautic.lead_post_save_update':
      console.log('Contact updated:', event.contact?.id);
      break;

    case 'mautic.lead_post_delete':
      console.log('Contact deleted:', event.id);
      break;

    case 'mautic.lead_points_change':
      console.log('Points changed:', event.contact?.id, event.points?.old_points, '->', event.points?.new_points);
      break;

    case 'mautic.lead_channel_subscription_changed':
      console.log('Subscription changed:', event.channel, event.old_status, '->', event.new_status);
      break;

    case 'mautic.lead_company_change':
      console.log(event.added ? 'Contact added to company' : 'Contact removed from company');
      break;

    case 'mautic.company_post_save':
      console.log('Company saved:', event.company?.id);
      break;

    case 'mautic.company_post_delete':
      console.log('Company deleted:', event.id);
      break;

    case 'mautic.email_on_send':
      console.log('Email sent to contact:', event.contact?.id);
      break;

    case 'mautic.email_on_open':
      console.log('Email opened by contact:', event.contact?.id);
      break;

    case 'mautic.form_on_submit':
      console.log('Form submitted:', event.submission?.id);
      // TODO: Create a ticket, notify sales, etc.
      break;

    case 'mautic.page_on_hit':
      console.log('Page hit:', event.hit?.id);
      break;

    case 'mautic.sms_on_send':
      console.log('SMS sent:', event.smsId);
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }
}
