import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Timing-safe string comparison (length-checked first, since
// crypto.timingSafeEqual throws on buffers of different length)
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Primary check: Basic Auth credentials embedded in the callback URL
// (https://user:pass@your-domain.com/webhooks/deepgram), which Deepgram
// sends as an Authorization: Basic header
function verifyBasicAuth(authHeader: string | null): boolean {
  const username = process.env.DEEPGRAM_CALLBACK_USERNAME;
  const password = process.env.DEEPGRAM_CALLBACK_PASSWORD;
  if (!username || !password) return false; // fail closed if unconfigured
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // password may itself contain ':'
  if (sep === -1) return false;
  return safeEqual(decoded.slice(0, sep), username) && safeEqual(decoded.slice(sep + 1), password);
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyBasicAuth(request.headers.get('authorization'))) {
      return NextResponse.json(
        { error: 'Invalid Basic Auth credentials' },
        { status: 401 }
      );
    }

    // Supplementary check: Deepgram does not send dg-token on every callback,
    // so compare it only when it is present (and an API Key ID is configured)
    const dgToken = request.headers.get('dg-token');
    const expectedKeyId = process.env.DEEPGRAM_API_KEY_ID;
    if (dgToken && expectedKeyId && !safeEqual(dgToken, expectedKeyId)) {
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

    // The callback body is the /v1/listen response: { metadata, results }
    const requestId = payload.metadata?.request_id;
    const created = payload.metadata?.created;
    const duration = payload.metadata?.duration;
    const extra = payload.metadata?.extra; // values passed with extra=KEY:VALUE

    // Get the transcript from the first channel and alternative
    const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = payload.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    console.log('Webhook received:', {
      requestId,
      created,
      duration,
      extra,
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