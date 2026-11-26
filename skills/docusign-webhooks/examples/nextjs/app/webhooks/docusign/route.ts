// Generated with: docusign-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a DocuSign Connect webhook signature.
 *
 * DocuSign signs the raw request body with HMAC-SHA256 keyed on the Connect
 * HMAC secret and sends the base64 digest in `X-DocuSign-Signature-1`. When
 * multiple HMAC keys are active it sends one header per key
 * (`X-DocuSign-Signature-1`, `-2`, ...). Only one header needs to match.
 */
export function verifyDocuSignWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  const signatures = Object.keys(headers)
    .filter((h) => h.toLowerCase().startsWith('x-docusign-signature-'))
    .map((h) => headers[h]);

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch = invalid
    }
  });
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const body = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  // Verify webhook signature against every X-DocuSign-Signature-N header
  if (!verifyDocuSignWebhook(body, headers, process.env.DOCUSIGN_HMAC_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const event = payload.event as string;
  const envelopeId = payload.data?.envelopeId;

  console.log(`Received ${event} event for envelope ${envelopeId}`);

  // Handle the event based on the `event` field in the JSON body
  switch (event) {
    case 'envelope-sent':
      console.log('Envelope sent:', envelopeId);
      // Your code: Track that the envelope was emailed to recipients
      break;

    case 'envelope-delivered':
      console.log('Envelope opened:', envelopeId);
      // Your code: Update status to "viewed"
      break;

    case 'envelope-completed':
      console.log('Envelope completed:', envelopeId);
      // Your code: Download signed documents, mark deal as signed, etc.
      break;

    case 'envelope-declined':
      console.log('Envelope declined:', envelopeId);
      // Your code: Notify sender, halt workflow
      break;

    case 'envelope-voided':
      console.log('Envelope voided:', envelopeId);
      // Your code: Clean up any pending state
      break;

    case 'recipient-sent':
      console.log('Recipient notified:', envelopeId);
      // Your code: Track per-recipient delivery
      break;

    case 'recipient-delivered':
      console.log('Recipient opened documents:', envelopeId);
      // Your code: Update per-recipient status
      break;

    case 'recipient-completed':
      console.log('Recipient completed:', envelopeId);
      // Your code: Advance signing workflow to the next recipient
      break;

    case 'recipient-declined':
      console.log('Recipient declined:', envelopeId);
      // Your code: Notify sender
      break;

    case 'recipient-authenticationfailed':
      console.log('Recipient authentication failed:', envelopeId);
      // Your code: Flag for review
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 2xx to acknowledge receipt (DocuSign retries on >= 400 for up to 15 days)
  return NextResponse.json({ received: true });
}
