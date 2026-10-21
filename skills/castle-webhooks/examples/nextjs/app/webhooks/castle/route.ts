import { NextRequest, NextResponse } from 'next/server';
import { verifyCastleSignature } from '../../../lib/castle';

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-castle-signature');

  if (!verifyCastleSignature(body, signature, process.env.CASTLE_API_SECRET)) {
    console.error('Castle signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: { type?: string; data?: any };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in the body's `type` field
  switch (event.type) {
    case '$policy.matched':
      console.log(`Policy matched: ${event.data?.policy?.name} (action: ${event.data?.policy?.action})`);
      // TODO: suspend account, queue for review, etc.
      break;

    case '$list_item.created':
      console.log(`List item created: ${event.data?.primary_value}`);
      // TODO: sync to your blocklist/allowlist
      break;

    case '$list_item.archived':
      console.log(`List item archived: ${event.data?.primary_value}`);
      // TODO: remove from your blocklist/allowlist
      break;

    case '$list_item.unarchived':
      console.log(`List item unarchived: ${event.data?.primary_value}`);
      // TODO: re-add to your blocklist/allowlist
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
