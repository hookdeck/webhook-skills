// Generated with: particle-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { parseParticlePayload, verifyParticleRequest, ParticlePayload } from '../../../lib/particle';

// Event names are chosen by your device firmware (Particle.publish("temperature", ...)).
// These two are illustrative; replace them with your own.
function handleEvent(payload: ParticlePayload): string {
  const { event, data, coreid, published_at: publishedAt } = payload;

  switch (event) {
    case 'temperature':
      console.log(`Temperature ${data} from ${coreid} at ${publishedAt}`);
      // TODO: store the reading (parseFloat(data))
      return 'temperature';

    case 'motion-detected':
      console.log(`Motion detected on ${coreid} at ${publishedAt}`);
      // TODO: raise an alert
      return 'motion-detected';

    default:
      console.log(`Unhandled event: ${event}`);
      return 'unhandled';
  }
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body, on every method.
  if (!verifyParticleRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
  }

  let payload: ParticlePayload;
  try {
    // Read as text so any content type is accepted (and an empty body is fine).
    const text = await request.text();
    payload = parseParticlePayload(
      text,
      request.headers.get('content-type'),
      new URL(request.url).searchParams
    );
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const event = handleEvent(payload);
    return NextResponse.json({ received: true, event });
  } catch (err) {
    console.error('Error handling Particle event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

// requestType may be GET, POST, PUT or DELETE (PATCH accepted too).
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
