// Generated with: lumos-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLumosRequest } from '../../../lib/verify-lumos';

// Lumos does not publish field names, so this payload shape is illustrative.
interface LumosPayload {
  user?: { email?: string; given_name?: string; family_name?: string };
  account?: Record<string, unknown>;
  application?: { name?: string; instance_id?: string };
  permissions?: unknown[];
  comment?: string;
  [key: string]: unknown;
}

function handleWebhook(payload: LumosPayload): void {
  const email = payload.user?.email;
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  console.log(`Lumos webhook for ${email || 'unknown user'}: ${permissions.length} permission(s)`);
  // TODO: grant or remove the listed permissions on your system, then return 200
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyLumosRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Lumos webhook header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleWebhook(payload as LumosPayload);
  } catch (err) {
    console.error('Error handling Lumos webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
