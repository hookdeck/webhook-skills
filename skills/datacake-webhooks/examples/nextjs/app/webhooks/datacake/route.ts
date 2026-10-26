// Generated with: datacake-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDatacakeRequest } from '../../../lib/verify-datacake';

interface DatacakePayload {
  event?: string;
  data?: unknown;
  [key: string]: unknown;
}

function handleEvent(payload: DatacakePayload): void {
  const { event } = payload;
  const data = payload.data as any;

  switch (event) {
    case 'device_measurement': {
      // data is an array of { field, value, device, timestamp } for the fields just recorded
      const rows = Array.isArray(data) ? data : [];
      console.log(`Device measurement: ${rows.length} value(s)`);
      // TODO: store each row in your database (row.device, row.field, row.value, row.timestamp)
      break;
    }

    case 'decoder_output': {
      // data.result is the raw payload decoder output; data.log and data.device may be null
      const results = Array.isArray(data?.result) ? data.result : [];
      console.log(`Decoder output: ${results.length} result(s) for product ${data?.product}`);
      // TODO: act on raw decoder data that isn't stored in the time-series database
      break;
    }

    case 'downlink': {
      // data.meta.type is e.g. "lorawan"; data.payload is the base64 downlink payload
      console.log(`Downlink sent to device ${data?.device}`);
      // TODO: audit or mirror the downlink (data.meta, data.payload, data.product_slug)
      break;
    }

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDatacakeRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
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
    handleEvent(payload as DatacakePayload);
  } catch (err) {
    console.error('Error handling Datacake event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
