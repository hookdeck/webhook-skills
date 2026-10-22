// Generated with: workspace-one-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkspaceOneRequest } from '../../../lib/verify-workspace-one';

interface WorkspaceOnePayload {
  EventType?: string;
  DeviceId?: string | number;
  EnrollmentUserName?: string;
  [key: string]: unknown;
}

// Lowercase letters and digits only, so "Check-in/Check-out" and "check in check out" match.
const normalize = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HANDLERS: Record<string, (p: WorkspaceOnePayload) => void> = {
  'Check-in/Check-out': (p) => console.log(`Multi-user device check-in/out: ${p.DeviceId}`),
  'Device Attribute Change': (p) => console.log(`Device attribute changed: ${p.DeviceId}`),
  'Device Compliance Status Change': (p) => console.log(`Compliance status changed: ${p.DeviceId}`),
  'Device Compromised Status Change': (p) => console.log(`Compromised status changed: ${p.DeviceId}`),
  'Device Delete': (p) => console.log(`Device deleted: ${p.DeviceId}`),
  'Device Enrollment': (p) => console.log(`Device enrolled: ${p.DeviceId} (${p.EnrollmentUserName})`),
  'Device Unenrolled Enterprise Wipe': (p) => console.log(`Enterprise wipe: ${p.DeviceId}`),
  'Device Wipe': (p) => console.log(`Device wiped: ${p.DeviceId}`),
};

const BY_KEY = Object.fromEntries(Object.entries(HANDLERS).map(([k, fn]) => [normalize(k), fn]));

function handleEvent(payload: WorkspaceOnePayload): void {
  const handler = BY_KEY[normalize(payload.EventType)];
  if (handler) handler(payload);
  else console.log(`Unhandled event: ${payload.EventType}`);
}

/**
 * The page documents the event labels but no payload. JSON bodies use an illustrative
 * shape ({ "EventType": "Device Enrollment", "DeviceId": 123, "EnrollmentUserName": "jdoe" });
 * XML bodies are accepted and EventType is read from the <EventType> element.
 */
function parseBody(raw: string): WorkspaceOnePayload {
  const text = raw.trim();
  if (text.startsWith('<')) {
    const m = /<EventType>\s*([^<]*?)\s*<\/EventType>/.exec(text);
    return { EventType: m ? m[1] : undefined };
  }
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Expected a JSON object');
  }
  return payload as WorkspaceOnePayload;
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyWorkspaceOneRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
  }

  let payload: WorkspaceOnePayload;
  try {
    // Read as text so any content type is accepted.
    payload = parseBody(await request.text());
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object or XML' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Workspace ONE event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
