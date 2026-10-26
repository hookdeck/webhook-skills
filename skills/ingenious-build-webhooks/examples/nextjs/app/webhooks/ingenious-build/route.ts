// Generated with: ingenious-build-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyIngeniousBuildRequest } from '../../../lib/verify-ingenious-build';

interface IngeniousBuildPayload {
  name?: string;
  subject?: string;
  data?: { id?: string; invoice_number?: string; [key: string]: unknown };
}

function handleEvent(payload: IngeniousBuildPayload): void {
  const { name, subject, data } = payload;
  const id = data?.id;

  switch (name) {
    case 'budget_exported_to_accounting':
      console.log(`Budget synced (${subject}): ${id}`);
      // TODO: create budget lines in the accounting system (data.items)
      break;

    case 'budget_change_exported_to_accounting':
      console.log(`Budget change synced (${subject}): ${id}`);
      // TODO: post the reallocation between cost codes (data.items)
      break;

    case 'contract_exported_to_accounting':
      console.log(`Contract synced (${subject}): ${id}`);
      // TODO: create the commitment (data.accounting_company_custom_id, data.items)
      break;

    case 'contract_change_exported_to_accounting':
      console.log(`Contract change synced (${subject}): ${id}`);
      // TODO: amend the commitment
      break;

    case 'invoice_exported_to_accounting':
      console.log(`Invoice synced (${subject}): ${data?.invoice_number}`);
      // TODO: create the vendor bill (data.gross_value, data.items)
      break;

    default:
      console.log(`Unhandled event: ${name}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyIngeniousBuildRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing auth header' }, { status: 401 });
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
    handleEvent(payload as IngeniousBuildPayload);
  } catch (err) {
    console.error('Error handling INGENIOUS.BUILD event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
