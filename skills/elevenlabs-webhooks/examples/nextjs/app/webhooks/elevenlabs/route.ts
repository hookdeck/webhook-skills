import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify ElevenLabs webhook signature
 * Referenced from elevenlabs-webhooks skill
 */
function verifyElevenLabsWebhook(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) {
    throw new Error('No signature header provided');
  }

  // Parse the signature header: "t=timestamp,v0=signature"
  const elements = signatureHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.substring(2);
  const signatures = elements
    .filter(e => e.startsWith('v0='))
    .map(e => e.substring(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid signature header format');
  }

  // Verify timestamp is within tolerance (30 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampAge = Math.abs(currentTime - parseInt(timestamp));

  if (timestampAge > 1800) {
    throw new Error('Webhook timestamp too old');
  }

  // Create the signed payload
  const signedPayload = `${timestamp}.${rawBody}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      // Different lengths = not equal
      return false;
    }
  });

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  return true;
}

export async function POST(request: NextRequest) {
  // Get the raw body as text for signature verification
  const rawBody = await request.text();

  // Check both possible header cases
  const signature = request.headers.get('elevenlabs-signature') ||
                   request.headers.get('ElevenLabs-Signature');

  try {
    // Verify webhook signature
    verifyElevenLabsWebhook(
      rawBody,
      signature,
      process.env.ELEVENLABS_WEBHOOK_SECRET!
    );

    // Parse the webhook payload
    const event = JSON.parse(rawBody);

    console.log(`Received ElevenLabs webhook: ${event.type}`);

    // Process based on event type
    switch (event.type) {
      case 'post_call_transcription':
        // Handle call transcription completion
        console.log('Call transcription completed:', event.data.call_id);
        // Add your business logic here
        break;

      case 'voice_removal_notice':
        // Handle voice removal notice
        console.log('Voice removal notice:', event.data);
        // Add logic to notify user about upcoming voice removal
        break;

      case 'voice_removal_notice_withdrawn':
        // Handle voice removal notice withdrawn
        console.log('Voice removal notice withdrawn:', event.data);
        // Add logic to notify user that voice removal was cancelled
        break;

      case 'voice_removed':
        // Handle voice removed
        console.log('Voice removed:', event.data);
        // Add logic to handle voice removal completion
        break;

      default:
        console.log('Unknown event type:', event.type);
    }

    // Return 200 to acknowledge receipt
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook processing failed:', (error as Error).message);

    if ((error as Error).message.includes('signature') ||
        (error as Error).message.includes('timestamp')) {
      return new NextResponse('Invalid signature', { status: 400 });
    }

    return new NextResponse('Internal server error', { status: 500 });
  }
}