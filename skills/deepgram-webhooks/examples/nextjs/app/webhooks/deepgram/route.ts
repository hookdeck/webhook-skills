import { NextRequest, NextResponse } from 'next/server';

// Verify Deepgram webhook authentication
function verifyDeepgramWebhook(request: NextRequest): boolean {
  const dgToken = request.headers.get('dg-token');
  const expectedToken = process.env.DEEPGRAM_API_KEY_ID;

  if (!dgToken || !expectedToken) {
    return false;
  }

  return dgToken === expectedToken;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook authentication
    if (!verifyDeepgramWebhook(request)) {
      const dgToken = request.headers.get('dg-token');

      if (!dgToken) {
        return NextResponse.json(
          { error: 'Missing dg-token header' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'Invalid dg-token' },
        { status: 403 }
      );
    }

    // Parse the webhook payload
    // Using request.text() first to preserve raw body for potential future signature verification
    const rawBody = await request.text();
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      // Handle JSON parsing error specifically
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    // Extract key information from the transcription
    const requestId = payload.request_id;
    const created = payload.created;
    const duration = payload.duration;

    // Get the transcript from the first channel and alternative
    const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = payload.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    console.log('Webhook received:', {
      requestId,
      created,
      duration,
      transcript: transcript.substring(0, 100) + '...', // Log first 100 chars
      confidence
    });

    // Process the transcription as needed
    // For example: save to database, trigger notifications, etc.

    // Return success to prevent retries
    return NextResponse.json(
      {
        status: 'success',
        requestId
      },
      { status: 200 }
    );
  } catch (error) {
    // Log error details for debugging, but don't output to stderr in tests
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error processing webhook:', error);
    }
    return NextResponse.json(
      { error: 'Invalid webhook payload' },
      { status: 400 }
    );
  }
}