// Generated with: sigfox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classifyCallback, verifySigfoxRequest } from '../../../lib/verify-sigfox';

type Payload = Record<string, unknown>;

function handleCallback(payload: Payload): string {
  const type = classifyCallback(payload);

  switch (type) {
    case 'data uplink':
      console.log(`Uplink from ${payload.device}: ${payload.data} (seq ${payload.seqNumber})`);
      // TODO: decode payload.data (hex) and store the reading
      break;

    case 'data bidir':
      console.log(`Bidir uplink from ${payload.device}, ack=${payload.ack}`);
      // TODO: respond with downlink data if payload.ack is true
      break;

    case 'data advanced':
      console.log(`Advanced data from ${payload.device}, link quality ${payload.lqi}`);
      // TODO: store link quality and duplicate metadata
      break;

    case 'service status':
      console.log(`Status from ${payload.device}: battery ${payload.batt} V, temp ${payload.temp}`);
      // TODO: update device health
      break;

    case 'service acknowledge':
      console.log(`Downlink ack for ${payload.device}: code ${payload.infoCode}`);
      // TODO: mark the downlink delivered or failed
      break;

    case 'service repeater':
      console.log(`Repeater ${payload.device}: ${payload.repeatedMsg} repeated messages`);
      // TODO: record repeater stats
      break;

    case 'error':
      console.log(`Error for ${payload.device}: ${payload.info} (${payload.severity})`);
      // TODO: alert that the device missed its keep-alive
      break;

    default:
      console.log('Unhandled Sigfox callback');
  }

  return type;
}

/**
 * Variables arrive in the query string (GET) and/or the body template (POST/PUT, JSON or
 * form-encoded). Throws on a body that can't be parsed into an object.
 */
function parsePayload(request: NextRequest, raw: string): Payload {
  let body: Payload = {};
  if (raw.trim() !== '') {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const parsed: unknown = contentType.includes('application/x-www-form-urlencoded')
      ? Object.fromEntries(new URLSearchParams(raw))
      : JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected an object');
    }
    body = parsed as Payload;
  }
  const query = Object.fromEntries(request.nextUrl.searchParams);
  return { ...query, ...body };
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySigfoxRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credential header' }, { status: 401 });
  }

  let payload: Payload;
  try {
    // Read as text so any content type (and an empty body) is accepted.
    payload = parsePayload(request, await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    const type = handleCallback(payload);
    return NextResponse.json({ received: true, type });
  } catch (err) {
    console.error('Error handling Sigfox callback:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

// The method is user-chosen in the Sigfox callback, so accept GET, POST and PUT.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
