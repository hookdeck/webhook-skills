// Generated with: clickhouse-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyClickHouseRequest } from '../../../lib/verify-clickhouse';

// The body is a template you write. Illustrative: {"title":"{{title}}","body":"{{body}}","link":"{{link}}"}
interface ClickStackAlert {
  title?: string;
  body?: string;
  link?: string;
  [key: string]: unknown;
}

// Anything that isn't a JSON object is handled as plain text.
function parseAlert(raw: string): ClickStackAlert {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return { body: raw };
}

function handleAlert(alert: ClickStackAlert): void {
  const { title, body, link } = alert;
  console.log(`ClickStack alert: ${title ?? '(no title)'} - ${body ?? ''} ${link ?? ''}`.trim());
  // TODO: page on-call, open a ticket, or post to chat. Alerts can repeat on every evaluation.
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyClickHouseRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted.
  const raw = await request.text();

  try {
    handleAlert(parseAlert(raw));
  } catch (err) {
    console.error('Error handling ClickStack alert:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
