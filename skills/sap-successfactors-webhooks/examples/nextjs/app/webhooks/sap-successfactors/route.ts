// Generated with: sap-successfactors-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySapSuccessFactorsRequest } from '../../../lib/verify-sap-successfactors';

type Format = 'empty' | 'json' | 'xml' | 'text';

/**
 * The body is whatever the integration author mapped from the starting entity, in
 * the chosen payload format (JSON or XML). There is no vendor event field.
 * Parse JSON only when the content type says so; otherwise keep the raw text.
 */
function parseBody(raw: string, contentType: string): { format: Format; data: unknown } {
  if (!raw) return { format: 'empty', data: null };
  if (/(^|\/|\+)json\b/i.test(contentType)) return { format: 'json', data: JSON.parse(raw) };
  if (/xml/i.test(contentType)) return { format: 'xml', data: raw };
  return { format: 'text', data: raw };
}

function handleDelivery(method: string, format: Format, data: unknown): void {
  // Illustrative only: your mapped fields decide what arrives. Example JSON body:
  //   {"userId":"example-1001","firstName":"Ada","lastName":"Lovelace","department":"Engineering"}
  console.log(`SAP SuccessFactors ${method} delivery (${format})`);
  void data;
  // TODO: process the mapped record(s). GET deliveries and empty requests carry no body.
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySapSuccessFactorsRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
  }

  let parsed: { format: Format; data: unknown };
  try {
    // Read as text so any content type is accepted.
    parsed = parseBody(await request.text(), request.headers.get('content-type') ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    handleDelivery(request.method, parsed.format, parsed.data);
  } catch (err) {
    console.error('Error handling SAP SuccessFactors delivery:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, format: parsed.format });
}

// The sender picks GET or POST on the REST operation. POST is recommended.
export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
