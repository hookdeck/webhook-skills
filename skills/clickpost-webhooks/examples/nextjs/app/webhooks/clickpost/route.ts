// Generated with: clickpost-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyClickPostRequest } from '../../../lib/verify-clickpost';

interface ClickPostScan {
  waybill?: string;
  cp_id?: number;
  status?: string;
  remark?: string;
  location?: string;
  timestamp?: string;
  clickpost_status_code: number;
  clickpost_status_description?: string;
  additional?: { latest_status?: Record<string, unknown>; [key: string]: unknown };
}

// Scans can be redelivered or arrive out of order: dedupe on waybill + scan.
// In-memory for the demo; use a database or cache with a TTL in production.
const seen = new Set<string>();

function handleScan(p: ClickPostScan): void {
  const { waybill, clickpost_status_code: code, clickpost_status_description: desc, status, location } = p;

  switch (code) {
    case 1:
      console.log(`Order placed: ${waybill}`);
      break;
    case 2:
      console.log(`Pickup pending: ${waybill}`);
      break;
    case 4:
      console.log(`Picked up: ${waybill}`);
      break;
    case 5:
      console.log(`In transit: ${waybill} at ${location}`);
      break;
    case 6:
      console.log(`Out for delivery: ${waybill}`);
      // TODO: notify the customer
      break;
    case 8:
      console.log(`Delivered: ${waybill}`);
      // TODO: mark the order delivered
      break;
    case 9:
      console.log(`Failed delivery: ${waybill} (${status})`);
      // TODO: start the NDR / reattempt flow
      break;
    case 41:
    case 42:
    case 43:
    case 44:
      console.log(`Rider update ${code} (${desc}): ${waybill}`);
      break;
    case 47:
    case 48:
    case 50:
    case 52:
      console.log(`Partial delivery / RTO update ${code} (${desc}): ${waybill}`);
      break;
    default:
      console.log(`Unhandled clickpost_status_code ${code} (${desc}): ${waybill}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyClickPostRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization: Token header' }, { status: 401 });
  }

  let payload: ClickPostScan;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Number.isInteger(payload.clickpost_status_code)) {
    return NextResponse.json({ error: 'Expected a ClickPost scan object' }, { status: 400 });
  }

  const key = `${payload.waybill}:${payload.clickpost_status_code}:${payload.timestamp}`;
  if (seen.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleScan(payload);
  } catch (err) {
    console.error('Error handling ClickPost scan:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
  seen.add(key);

  return NextResponse.json({ received: true });
}
