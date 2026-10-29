// Generated with: better-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBetterStackRequest } from '../../../lib/verify-better-stack';
import { classifyBetterStackPayload, type BetterStackEvent } from '../../../lib/better-stack-events';

function handleEvent(event: BetterStackEvent): void {
  switch (event.kind) {
    case 'incident':
      if (event.state === 'comment') {
        console.log(`Incident ${event.id} comment by ${event.author}: ${event.content}`);
        // TODO: mirror the comment into your ticketing system
      } else {
        console.log(`Incident ${event.id} ${event.state}: ${event.name} (${event.cause})`);
        // TODO: open, update or close the matching incident on your side
      }
      break;
    case 'monitor':
      console.log(`Monitor ${event.id} ${event.state}: ${event.name}`);
      // TODO: sync monitor configuration
      break;
    case 'on_call':
      console.log(`On-call ${event.change} change on ${event.calendar}: ${event.emails.join(', ')}`);
      // TODO: update who is on call in your tools
      break;
    default:
      console.log('Unrecognised Better Stack payload (customised body_template?)');
  }
}

// The webhook's http_method can be get, post, put, patch, head or options (default post),
// so every method shares one handler. The credential is checked first, for every method.
async function receive(request: NextRequest): Promise<NextResponse> {
  if (!verifyBetterStackRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  // Read raw bytes so any content type is accepted; GET, HEAD and OPTIONS have no body.
  const raw = Buffer.from(await request.arrayBuffer()).toString('utf8');
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // body_template is user-editable, so a non-JSON body is acknowledged and logged.
    console.log('Received a non-JSON body:', raw.slice(0, 200));
    return NextResponse.json({ received: true });
  }

  try {
    handleEvent(classifyBetterStackPayload(payload));
  } catch (err) {
    console.error('Error handling Better Stack webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = receive;
export const HEAD = receive;
export const POST = receive;
export const PUT = receive;
export const PATCH = receive;
export const OPTIONS = receive;
