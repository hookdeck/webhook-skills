// Generated with: twilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an X-Twilio-Signature for a form-encoded webhook.
 *
 * Algorithm (matches the official Twilio SDKs):
 *   signedString = url + concat(sortedParamName + paramValue)
 *   signature    = base64( HMAC-SHA1( authToken, signedString ) )
 */
export function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    // Different lengths -> invalid
    return false;
  }
}

/**
 * Reconstruct the URL Twilio signed. Prefer WEBHOOK_BASE_URL so this matches
 * the URL you configured in the Twilio Console exactly.
 */
function buildWebhookUrl(request: NextRequest): string {
  const parsed = new URL(request.url);
  const pathAndQuery = parsed.pathname + parsed.search;

  const base = process.env.WEBHOOK_BASE_URL;
  if (base) {
    return base.replace(/\/$/, '') + pathAndQuery;
  }
  const proto = request.headers.get('x-forwarded-proto') || parsed.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || parsed.host;
  return `${proto}://${host}${pathAndQuery}`;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-twilio-signature') || '';
  const url = buildWebhookUrl(request);

  // Twilio sends application/x-www-form-urlencoded; read as text and parse.
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  if (!verifyTwilioSignature(authToken, signature, url, params)) {
    console.error('Twilio signature verification failed');
    return new NextResponse('Invalid signature', { status: 403 });
  }

  // Incoming SMS / MMS -> respond with TwiML
  if (params.MessageSid && typeof params.Body !== 'undefined' && !params.MessageStatus) {
    console.log(`Incoming SMS ${params.MessageSid} from ${params.From}: ${params.Body}`);
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response><Message>Thanks, got your message!</Message></Response>';
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Message status callback: queued | sending | sent | delivered | undelivered | failed
  if (params.MessageSid && params.MessageStatus) {
    console.log(`Message ${params.MessageSid} status: ${params.MessageStatus}`);
    if (params.MessageStatus === 'failed' || params.MessageStatus === 'undelivered') {
      console.error(`Delivery problem ErrorCode=${params.ErrorCode}`);
      // TODO: surface to user / retry
    }
    return new NextResponse(null, { status: 204 });
  }

  // Incoming voice call -> respond with TwiML
  if (params.CallSid && params.Direction === 'inbound' && !params.Body) {
    console.log(`Incoming call ${params.CallSid} from ${params.From}`);
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response><Say>Hello from Twilio webhooks.</Say></Response>';
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Call status callback: queued | ringing | in-progress | completed | busy | failed | no-answer | canceled
  if (params.CallSid && params.CallStatus) {
    console.log(`Call ${params.CallSid} status: ${params.CallStatus}`);
    return new NextResponse(null, { status: 204 });
  }

  // Recording status callback
  if (params.RecordingSid && params.RecordingStatus) {
    console.log(`Recording ${params.RecordingSid} status: ${params.RecordingStatus}`);
    return new NextResponse(null, { status: 204 });
  }

  console.log('Unhandled Twilio webhook params:', Object.keys(params));
  return new NextResponse(null, { status: 204 });
}
