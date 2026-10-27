// Generated with: vern-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.VERN_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('VERN_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Vern (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Vern webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body carries no event name: workbook.production.export and workbook.preview.export deliver
  // the same payload, and `version` is the export mode ("1.0" flat, "2.0" nested), not the event.
  // Register separate endpoints for preview and production to tell them apart.
  // `svix-id` is stable across retries of the same message: use it to deduplicate.
  // Batches can arrive in any order: group by batch.id, order by batch.index.
  const batch: Record<string, any> = event.batch ?? {};
  console.log(`Received Vern webhook ${id}: version ${event.version}, batch ${Number.isInteger(batch.index) ? batch.index + 1 : '?'}/${batch.total ?? '?'}`);

  let records: number | undefined;
  switch (event.version) {
    case '1.0':
      // Flat: sheets[].data is an array of row objects (column keys + errors + row_index)
      records = (event.sheets ?? []).reduce((sum: number, sheet: any) => sum + (sheet.data?.length ?? 0), 0);
      for (const sheet of event.sheets ?? []) {
        console.log(`Sheet ${sheet.name}: rows ${sheet.start_row_index}-${sheet.end_row_index}`);
      }
      break;
    case '2.0':
      // Nested: data is keyed by root sheet name; each record has a `children` object
      records = (event.root_sheets ?? []).reduce((sum: number, name: string) => sum + (event.data?.[name]?.length ?? 0), 0);
      console.log(`Root sheets: ${(event.root_sheets ?? []).join(', ')}`);
      break;
    default:
      // Return 2xx for payload versions you don't handle, or Svix keeps retrying them
      console.log('Unhandled payload version:', event.version);
  }

  return NextResponse.json({
    success: true,
    version: event.version,
    batch_id: batch.id,
    batch_index: batch.index,
    last: batch.index === batch.total - 1,
    records,
  });
}
