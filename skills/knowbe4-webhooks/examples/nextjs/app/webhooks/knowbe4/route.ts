// Generated with: knowbe4-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKnowbe4Request } from '../../../lib/verify-knowbe4';

/**
 * KnowBe4 documents no event field or body schema. Route on the Custom Data you add to each
 * webhook: KnowBe4's own examples use the key "System" with "KnowBe4" (KSAT) and "PhishER".
 * Inspect a real delivery before you read other fields.
 */
function handleEvent(payload: Record<string, unknown>): void {
  const system = typeof payload.System === 'string' ? payload.System : null;

  switch (system) {
    case 'KnowBe4':
      console.log('KSAT webhook payload received');
      // Handle the phishing, training or general events you selected
      break;

    case 'PhishER':
      console.log('PhishER webhook payload received');
      // Handle the reported-message data types you selected
      break;

    default:
      console.log('KnowBe4 payload received without the expected Custom Data');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyKnowbe4Request(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling KnowBe4 webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
