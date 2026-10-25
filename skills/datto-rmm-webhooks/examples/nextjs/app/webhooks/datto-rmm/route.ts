// Generated with: datto-rmm-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDattoRmmRequest } from '../../../lib/verify-datto-rmm';

interface DattoRmmPayload {
  status?: string;
  alert_uid?: string;
  alert_message?: string;
  [key: string]: unknown;
}

// The body is the user's template: JSON, text/plain or form-urlencoded. Never rejects.
function parseBody(raw: string, contentType: string): DattoRmmPayload {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // not JSON: fall through to plain text
  }
  return { text: raw };
}

// ILLUSTRATIVE: Datto RMM adds no event field. This assumes your alert raised / alert
// resolved templates include a "status" field of "raised" or "resolved".
function handleAlert(payload: DattoRmmPayload): void {
  const { status, alert_uid: alertUid, alert_message: message } = payload;

  switch (status) {
    case 'raised':
      console.log(`Alert raised ${alertUid}: ${message}`);
      // TODO: open a ticket or page on-call (payload.device_hostname, payload.site_name)
      break;

    case 'resolved':
      console.log(`Alert resolved ${alertUid}: ${message}`);
      // TODO: close the matching ticket
      break;

    default:
      console.log('Unhandled Datto RMM payload (no recognised status field)');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDattoRmmRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted.
  const raw = await request.text();
  const payload = parseBody(raw, request.headers.get('content-type') || '');

  try {
    handleAlert(payload);
  } catch (err) {
    console.error('Error handling Datto RMM webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
