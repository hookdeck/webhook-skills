// Generated with: doppler-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDopplerWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body as text: the signature covers the exact bytes Doppler sent,
  // whatever the content type (including custom payloads)
  const body = await request.text();
  const signature = request.headers.get('x-doppler-signature');

  if (!verifyDopplerWebhook(body, signature, process.env.DOPPLER_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Default payloads carry a type; custom JSON payloads do not
  const type = payload && typeof payload === 'object' ? payload.type : undefined;
  switch (type) {
    case 'config.secrets.update': {
      const { added = [], removed = [], updated = [] } = payload.diff || {};
      console.log(
        `Secrets changed in ${payload.project?.slug}/${payload.config?.name}:`,
        `+${added.length} -${removed.length} ~${updated.length}`
      );
      // TODO: Restart or redeploy the app, trigger a pipeline, etc.
      break;
    }

    default:
      console.log(`Unhandled payload (type: ${type ?? 'none - custom payload'})`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
