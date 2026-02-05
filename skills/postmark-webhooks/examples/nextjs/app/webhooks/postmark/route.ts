import { NextRequest, NextResponse } from 'next/server';

// Postmark event type definitions
interface PostmarkEvent {
  RecordType: 'Bounce' | 'SpamComplaint' | 'Open' | 'Click' | 'Delivery' | 'SubscriptionChange';
  MessageID: string;
  ServerID: number;
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
  Email: string;
  ReceivedAt: string;
  Platform?: string;
  UserAgent?: string;
}

interface ClickEvent extends PostmarkEvent {
  RecordType: 'Click';
  Email: string;
  ClickedAt: string;
  OriginalLink: string;
  ClickLocation?: string;
  Platform?: string;
  UserAgent?: string;
}

interface DeliveryEvent extends PostmarkEvent {
  RecordType: 'Delivery';
  Email: string;
  DeliveredAt: string;
  Details?: string;
}

interface SubscriptionChangeEvent extends PostmarkEvent {
  RecordType: 'SubscriptionChange';
  Email: string;
  ChangedAt: string;
  SuppressionReason?: string;
}

type WebhookEvent = BounceEvent | SpamComplaintEvent | OpenEvent | ClickEvent | DeliveryEvent | SubscriptionChangeEvent;

export async function POST(request: NextRequest) {
  try {
    // Verify authentication token
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (token !== process.env.POSTMARK_WEBHOOK_TOKEN) {
      console.error('Invalid webhook token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the webhook payload
    const event: WebhookEvent = await request.json();

    // Validate payload structure
    if (!event.RecordType || !event.MessageID) {
      console.error('Invalid payload structure:', event);
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Process the event
    console.log(`Received ${event.RecordType} event for message ${event.MessageID}`);

    switch (event.RecordType) {
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

      default:
        console.log(`Unknown event type: ${event.RecordType}`);
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
  console.log(`Email opened: ${event.Email}`);
  console.log(`  Opened at: ${event.ReceivedAt}`);
  if (event.Platform) console.log(`  Platform: ${event.Platform}`);
  if (event.UserAgent) console.log(`  User Agent: ${event.UserAgent}`);

  // In a real application:
  // - Track engagement metrics
  // - Update last activity timestamp
  // - Trigger engagement-based automation
}

async function handleClick(event: ClickEvent) {
  console.log(`Link clicked: ${event.Email}`);
  console.log(`  Clicked at: ${event.ClickedAt}`);
  console.log(`  Link: ${event.OriginalLink}`);
  if (event.ClickLocation) console.log(`  Click location: ${event.ClickLocation}`);

  // In a real application:
  // - Track click-through rates
  // - Log user behavior
  // - Trigger click-based automation
}

async function handleDelivery(event: DeliveryEvent) {
  console.log(`Email delivered: ${event.Email}`);
  console.log(`  Delivered at: ${event.DeliveredAt}`);
  console.log(`  Server: ${event.ServerID}`);

  // In a real application:
  // - Update delivery status
  // - Log successful delivery
  // - Clear any retry flags
}

async function handleSubscriptionChange(event: SubscriptionChangeEvent) {
  console.log(`Subscription change: ${event.Email}`);
  console.log(`  Changed at: ${event.ChangedAt}`);
  if (event.SuppressionReason) console.log(`  Suppression reason: ${event.SuppressionReason}`);

  // In a real application:
  // - Update subscription preferences
  // - Log for compliance
  // - Trigger preference center update
}