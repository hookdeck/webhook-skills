import { NextRequest, NextResponse } from 'next/server';

// Postmark event type definitions
interface PostmarkEvent {
  RecordType: 'Bounce' | 'SpamComplaint' | 'Open' | 'Click' | 'Delivery' | 'SubscriptionChange';
  MessageID: string;
  // Open and Click events don't include ServerID
  ServerID?: number;
  MessageStream?: string;
  Tag?: string;
  Metadata?: Record<string, any>;
}

interface BounceEvent extends PostmarkEvent {
  RecordType: 'Bounce';
  Email: string;
  Type: string;
  TypeCode: number;
  Description: string;
  Details: string;
  BouncedAt: string;
  DumpAvailable: boolean;
  Inactive: boolean;
  CanActivate: boolean;
  Subject?: string;
}

interface SpamComplaintEvent extends PostmarkEvent {
  RecordType: 'SpamComplaint';
  Email: string;
  BouncedAt: string;
}

interface OpenEvent extends PostmarkEvent {
  RecordType: 'Open';
  Recipient: string;
  ReceivedAt: string;
  Platform?: string;
  UserAgent?: string;
}

interface ClickEvent extends PostmarkEvent {
  RecordType: 'Click';
  Recipient: string;
  ReceivedAt: string;
  OriginalLink: string;
  ClickLocation?: string;
  Platform?: string;
  UserAgent?: string;
}

interface DeliveryEvent extends PostmarkEvent {
  RecordType: 'Delivery';
  Recipient: string;
  DeliveredAt: string;
  Details?: string;
}

// MessageID is null for manual suppressions (Origin Customer or Admin) and reactivations
interface SubscriptionChangeEvent extends Omit<PostmarkEvent, 'MessageID'> {
  MessageID: string | null;
  RecordType: 'SubscriptionChange';
  Recipient: string;
  ChangedAt: string;
  SuppressionReason?: string;
}

// Inbound webhooks have no RecordType or ServerID
interface InboundEvent {
  MessageID: string;
  MessageStream?: string;
  From: string;
  FromFull: { Email: string; Name: string; MailboxHash: string };
  Subject: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Tag?: string;
}

type WebhookEvent = BounceEvent | SpamComplaintEvent | OpenEvent | ClickEvent | DeliveryEvent | SubscriptionChangeEvent | InboundEvent;

export async function POST(request: NextRequest) {
  try {
    // Verify authentication token
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const expectedToken = process.env.POSTMARK_WEBHOOK_TOKEN;

    // Fail closed: never accept a request when no token is configured
    if (!expectedToken || token !== expectedToken) {
      console.error('Invalid webhook token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the webhook payload. Malformed JSON is a 400, not a 500:
    // Postmark retries 5xx responses, and a bad body won't parse next time either.
    let event: WebhookEvent;
    try {
      event = await request.json();
    } catch {
      console.error('Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Valid JSON that isn't an object (e.g. null or a string) can't be an event
    if (typeof event !== 'object' || event === null) {
      console.error('Invalid payload structure:', event);
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Validate payload structure
    // Inbound webhooks have no RecordType, so identify them by FromFull
    const recordType = 'RecordType' in event
      ? event.RecordType
      : 'FromFull' in event
        ? 'Inbound'
        : undefined;

    // MessageID is null on SubscriptionChange events for manual suppressions
    // and reactivations. Postmark drops any event that gets a 4xx, so rejecting
    // those would lose them for good. (Postmark publishes no SMTP API Error
    // payload, so whether it always has a MessageID is unverified.)
    const messageIdRequired = recordType !== 'SubscriptionChange';

    if (!recordType || (messageIdRequired && !event.MessageID)) {
      console.error('Invalid payload structure:', event);
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Process the event
    console.log(`Received ${recordType} event for message ${event.MessageID}`);

    switch (recordType) {
      case 'Bounce':
        await handleBounce(event as BounceEvent);
        break;

      case 'SpamComplaint':
        await handleSpamComplaint(event as SpamComplaintEvent);
        break;

      case 'Open':
        await handleOpen(event as OpenEvent);
        break;

      case 'Click':
        await handleClick(event as ClickEvent);
        break;

      case 'Delivery':
        await handleDelivery(event as DeliveryEvent);
        break;

      case 'SubscriptionChange':
        await handleSubscriptionChange(event as SubscriptionChangeEvent);
        break;

      case 'Inbound':
        await handleInbound(event as InboundEvent);
        break;

      default:
        console.log(`Unknown event type: ${recordType}`);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Event handlers
async function handleBounce(event: BounceEvent) {
  console.log(`Bounce: ${event.Email}`);
  console.log(`  Type: ${event.Type}`);
  console.log(`  Description: ${event.Description}`);
  console.log(`  Bounced at: ${event.BouncedAt}`);

  // In a real application:
  // - Mark email as undeliverable in your database
  // - Update contact status
  // - Trigger re-engagement workflow
}

async function handleSpamComplaint(event: SpamComplaintEvent) {
  console.log(`Spam complaint: ${event.Email}`);
  console.log(`  Complained at: ${event.BouncedAt}`);

  // In a real application:
  // - Remove from all mailing lists immediately
  // - Log for compliance tracking
  // - Update sender reputation metrics
}

async function handleOpen(event: OpenEvent) {
  console.log(`Email opened: ${event.Recipient}`);
  console.log(`  Opened at: ${event.ReceivedAt}`);
  if (event.Platform) console.log(`  Platform: ${event.Platform}`);
  if (event.UserAgent) console.log(`  User Agent: ${event.UserAgent}`);

  // In a real application:
  // - Track engagement metrics
  // - Update last activity timestamp
  // - Trigger engagement-based automation
}

async function handleClick(event: ClickEvent) {
  console.log(`Link clicked: ${event.Recipient}`);
  console.log(`  Clicked at: ${event.ReceivedAt}`);
  console.log(`  Link: ${event.OriginalLink}`);
  if (event.ClickLocation) console.log(`  Click location: ${event.ClickLocation}`);

  // In a real application:
  // - Track click-through rates
  // - Log user behavior
  // - Trigger click-based automation
}

async function handleDelivery(event: DeliveryEvent) {
  console.log(`Email delivered: ${event.Recipient}`);
  console.log(`  Delivered at: ${event.DeliveredAt}`);
  console.log(`  Server: ${event.ServerID}`);

  // In a real application:
  // - Update delivery status
  // - Log successful delivery
  // - Clear any retry flags
}

async function handleSubscriptionChange(event: SubscriptionChangeEvent) {
  console.log(`Subscription change: ${event.Recipient}`);
  console.log(`  Changed at: ${event.ChangedAt}`);
  if (event.SuppressionReason) console.log(`  Suppression reason: ${event.SuppressionReason}`);

  // In a real application:
  // - Update subscription preferences
  // - Log for compliance
  // - Trigger preference center update
}

async function handleInbound(event: InboundEvent) {
  console.log(`Inbound email from: ${event.From}`);
  console.log(`  Subject: ${event.Subject}`);

  // In a real application:
  // - Match the reply to a conversation
  // - Parse the content and attachments
  // - Trigger automated responses
}