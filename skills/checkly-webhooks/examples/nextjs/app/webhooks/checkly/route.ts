import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Checkly signs the rendered body with HMAC-SHA256 and sends the hex digest.
function verifyChecklySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Raw text body: the signed content is exactly what Checkly rendered
  const rawBody = await request.text();
  const signature = request.headers.get('x-checkly-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing x-checkly-signature header' }, { status: 400 });
  }

  if (!verifyChecklySignature(rawBody, signature, process.env.CHECKLY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { alertType?: string; checkName?: string; checkId?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // alertType, checkName and checkId come from your Checkly body template
  switch (payload.alertType) {
    case 'ALERT_FAILURE':
      console.log(`Check failed: ${payload.checkName} (${payload.checkId})`);
      break;
    case 'ALERT_RECOVERY':
      console.log(`Check recovered: ${payload.checkName} (${payload.checkId})`);
      break;
    case 'ALERT_DEGRADED':
      console.log(`Check degraded: ${payload.checkName} (${payload.checkId})`);
      break;
    default:
      console.log(`Unhandled alert type: ${payload.alertType}`);
  }

  return NextResponse.json({ received: true });
}
