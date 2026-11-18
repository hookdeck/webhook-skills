// Generated with: zoho-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { parseBody, verifyZohoCrmRequest, type ParsedBody } from '../../../lib/verify-zoho-crm';

interface ZohoCrmRecord {
  module?: string;
  id?: string;
  email?: string;
  stage?: string;
  [key: string]: unknown;
}

/**
 * Zoho adds no event name or record ID. These examples assume an illustrative
 * raw JSON template (or form-data parameters) with a `module` and an `id`:
 *   {"module": "Leads", "id": "${Leads.Lead Id}", "email": "${Leads.Email}"}
 */
function handleNotification(body: ParsedBody): void {
  if (body.format !== 'json' && body.format !== 'form') {
    console.log(`Zoho CRM webhook with a ${body.format} body (${body.data ? body.data.length : 0} chars)`);
    return;
  }
  const data = (body.data ?? {}) as ZohoCrmRecord;
  switch (data.module) {
    case 'Leads':
      console.log(`Lead ${data.id} changed (${data.email || 'no email'})`);
      // Sync the lead to your system
      break;
    case 'Contacts':
      console.log(`Contact ${data.id} changed`);
      // Update the contact
      break;
    case 'Deals':
      console.log(`Deal ${data.id} changed (stage: ${data.stage})`);
      // e.g. push a won deal to accounting
      break;
    default:
      console.log(`Zoho CRM webhook for module ${data.module}`);
  }
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.ZOHO_CRM_WEBHOOK_SECRET) {
    console.error('ZOHO_CRM_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Authenticate before reading or parsing the body.
  if (!verifyZohoCrmRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any body type works (form-data, JSON, XML, text).
  const body = parseBody(await request.text(), request.headers.get('content-type') || '');
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    // Respond within 10 seconds: Zoho treats a slower response as a socket timeout.
    handleNotification(body);
  } catch (err) {
    console.error('Error handling Zoho CRM webhook:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// CRM only sends headers on POST and PUT, so only those methods are exported.
export const POST = handle;
export const PUT = handle;
