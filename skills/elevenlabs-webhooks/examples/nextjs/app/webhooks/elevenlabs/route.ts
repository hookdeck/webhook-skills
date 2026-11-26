import { NextRequest, NextResponse } from 'next/server';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// ElevenLabs client — used for SDK webhook verification (recommended by ElevenLabs).
// API key is required for client init; for webhook-only a placeholder is used.
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || 'webhook-only'
});

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('elevenlabs-signature') ||
                   request.headers.get('ElevenLabs-Signature');

  try {
    const event = await elevenlabs.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.ELEVENLABS_WEBHOOK_SECRET
    );

    console.log(`Received ElevenLabs webhook: ${event.type}`);

    // Process based on event type
    switch (event.type) {
      case 'post_call_transcription':
        // Call ended and analysis is complete
        console.log('Call transcription completed:', event.data.conversation_id);
        // Your code: store event.data.transcript and event.data.analysis
        break;

      case 'post_call_audio':
        // Full call audio as base64-encoded MP3 in event.data.full_audio
        console.log('Call audio ready:', event.data.conversation_id);
        break;

      case 'call_initiation_failure':
        // Phone call didn't connect: failure_reason is busy, no-answer or unknown
        console.log('Call initiation failed:', event.data.conversation_id, event.data.failure_reason);
        break;

      case 'voice_removal_notice':
        // Handle voice removal notice
        console.log('Voice removal notice received:', event.data);
        // Your code: switch to one of event.data.suggested_voices
        break;

      case 'voice_removal_notice_withdrawn':
        // Handle voice removal notice withdrawal
        console.log('Voice removal notice withdrawn:', event.data);
        // Your code: keep using event.data.voice_id
        break;

      case 'voice_removed':
        // Handle voice removal completion
        console.log('Voice removed:', event.data);
        // Your code: stop using event.data.voice_id
        break;

      default:
        console.log('Unknown event type:', event.type);
    }

    // Return 200 to acknowledge receipt
    return new NextResponse('OK', { status: 200 });
  } catch (error: unknown) {
    const err = error as { message?: string; statusCode?: number };
    console.error('Webhook verification failed:', err.message);

    const statusCode = err.statusCode === 400 ? 401 : (err.statusCode || 500);
    const message = err.message || 'Invalid signature';
    if (statusCode === 500) {
      return new NextResponse('Internal server error', { status: 500 });
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
