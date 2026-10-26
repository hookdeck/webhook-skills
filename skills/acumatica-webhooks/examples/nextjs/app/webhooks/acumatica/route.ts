// Generated with: acumatica-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAcumaticaRequest } from '../../../lib/verify-acumatica';

interface AcumaticaNotification {
  Inserted?: Record<string, unknown>[];
  Deleted?: Record<string, unknown>[];
  Query?: string;
  CompanyId?: string;
  Id?: string;
  TimeStamp?: number;
  AdditionalInfo?: Record<string, unknown>;
}

/** Inserted only = inserted, Deleted only = deleted, both = updated. */
function classifyChange(payload: AcumaticaNotification): string {
  const inserted = Array.isArray(payload.Inserted) ? payload.Inserted : [];
  const deleted = Array.isArray(payload.Deleted) ? payload.Deleted : [];
  if (inserted.length && deleted.length) return 'updated';
  if (inserted.length) return 'inserted';
  if (deleted.length) return 'deleted';
  return 'empty';
}

// Acumatica resends on error, so dedupe on the transaction Id (use a shared store in production).
const seen = new Set<string>();

function handleNotification(payload: AcumaticaNotification): void {
  if (payload.Id && seen.has(payload.Id)) {
    console.log(`Duplicate notification ${payload.Id}, skipping`);
    return;
  }
  if (payload.Id) seen.add(payload.Id);

  // There is no event-type field: the Query name identifies the notification.
  const { Query: query, CompanyId: tenant } = payload;

  switch (classifyChange(payload)) {
    case 'inserted':
      console.log(`[${tenant}] ${query}: ${payload.Inserted?.length} row(s) inserted`);
      // TODO: create the records downstream (payload.Inserted)
      break;

    case 'deleted':
      console.log(`[${tenant}] ${query}: ${payload.Deleted?.length} row(s) deleted`);
      // TODO: remove or archive the records (payload.Deleted)
      break;

    case 'updated':
      console.log(`[${tenant}] ${query}: rows updated`);
      // TODO: compare payload.Deleted (old values) with payload.Inserted (new values)
      break;

    default:
      console.log(`[${tenant}] ${query}: notification without rows`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAcumaticaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing authentication header' }, { status: 401 });
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
    handleNotification(payload as AcumaticaNotification);
  } catch (err) {
    console.error('Error handling Acumatica notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
