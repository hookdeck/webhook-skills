import { NextResponse } from 'next/server';
import { verifySignature, handleEvent } from '../../lib/webhook';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.SURVICATE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  const tolerance = 0;
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifySignature(rawBody, request.headers.get('hmac'), secret, tolerance)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  handleEvent(payload as Record<string, unknown>);
  return NextResponse.json({ received: true });
}
