// Generated with: bitdefender-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBitdefenderRequest } from '../../../lib/verify-bitdefender';

type BitdefenderEvent = Record<string, unknown>;

function handleEvent(event: BitdefenderEvent): void {
  // Each event carries a `module` identifier (the event type).
  switch (event.module) {
    case 'av':
      console.log(`Antimalware: ${event.malware_name} on ${event.computer_name} (${event.final_status})`);
      // TODO: raise an alert or open a ticket for the detection
      break;

    case 'aph':
      console.log(`Antiphishing: ${event.url} ${event.status} on ${event.computer_name}`);
      break;

    case 'avc':
      console.log(`Advanced Threat Control: ${event.exploit_path} ${event.status} on ${event.computer_name}`);
      break;

    case 'fw':
    case 'hd':
    case 'dp':
    case 'network-sandboxing':
      console.log(`Detection event ${event.module} on ${event.computer_name}`);
      break;

    default:
      console.log(`Unhandled Bitdefender event module: ${event.module}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyBitdefenderRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let message: unknown;
  try {
    // Read the raw text so any content type works.
    message = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // JSON-RPC 2.0: {jsonrpc, method: "addEvents", params: {events: [...]}, id}
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return NextResponse.json({ error: 'Expected a JSON-RPC object' }, { status: 400 });
  }
  const rpc = message as { method?: unknown; params?: { events?: unknown } };
  const events = rpc.params?.events;
  if (rpc.method !== 'addEvents' || !Array.isArray(events)) {
    return NextResponse.json({ error: 'Expected an addEvents call with params.events' }, { status: 400 });
  }

  try {
    for (const event of events) {
      if (event && typeof event === 'object') handleEvent(event as BitdefenderEvent);
    }
  } catch (err) {
    console.error('Error handling Bitdefender webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Any 2xx tells GravityZone the batch was received.
  return NextResponse.json({ received: true });
}
