// Generated with: fathom-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Fathom } from 'fathom-typescript';

// Subset of Fathom's Meeting object. transcript, default_summary, action_items
// and crm_matches are only present when the matching include_* option is enabled.
interface FathomMeeting {
  title: string;
  meeting_title: string | null;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  recorded_by: { name: string; email: string; email_domain: string; team: string | null };
  default_summary?: { template_name: string | null; markdown_formatted: string | null } | null;
  action_items?: Array<{
    description: string;
    completed: boolean;
    recording_timestamp: string;
    assignee: { name: string | null; email: string | null; team: string | null };
  }> | null;
  transcript?: Array<{ speaker: { display_name: string }; text: string; timestamp: string }> | null;
}

/**
 * Fathom sends one webhook type: the Meeting object, fired once when a
 * recording's content is ready. There is no event-type field to switch on.
 */
function handleMeeting(meeting: FathomMeeting, webhookId: string) {
  console.log(`Meeting ready: "${meeting.title}" (recording ${meeting.recording_id}, delivery ${webhookId})`);

  if (meeting.default_summary?.markdown_formatted) {
    console.log('Summary:', meeting.default_summary.markdown_formatted);
  }

  for (const item of meeting.action_items ?? []) {
    console.log(`Action item: ${item.description} (assignee: ${item.assignee?.email ?? 'unassigned'})`);
  }

  if (meeting.transcript) {
    console.log(`Transcript: ${meeting.transcript.length} lines`);
  }

  // TODO: Sync notes to your CRM, post the summary to Slack, create tasks, etc.
  // Deduplicate on webhookId: it stays the same when Fathom retries a delivery.
}

export async function POST(request: NextRequest) {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FATHOM_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' },
      { status: 400 }
    );
  }

  // Read the raw body - verification must run on the exact bytes Fathom sent
  const rawBody = await request.text();

  let meeting: FathomMeeting;
  try {
    // Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}"
    // and rejects timestamps more than 5 minutes old. Returns the parsed payload.
    meeting = Fathom.verifyWebhook(secret, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    }, rawBody) as FathomMeeting;
  } catch (err) {
    console.error('Fathom webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    handleMeeting(meeting, webhookId);
  } catch (err) {
    console.error('Error handling Fathom webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Return 2xx quickly - non-2xx responses and timeouts are retried
  return NextResponse.json({ received: true });
}
