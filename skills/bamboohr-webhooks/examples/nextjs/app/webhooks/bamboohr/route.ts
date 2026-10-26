// Generated with: bamboohr-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

interface Employee {
  id?: string;
  action?: string;
  timestamp?: string;
  changedFields?: string[];
  fields?: Record<string, unknown>;
}

// Event-based webhook body (one event per POST)
interface EventData {
  companyId?: string;
  employeeId?: string;
  changedFields?: string[];
}

// X-BambooHR-Signature is the hex HMAC-SHA256 of the raw body followed directly by
// the X-BambooHR-Timestamp header value (no separator), keyed with the webhook's private key
function verifySignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  privateKey: string | undefined
): boolean {
  if (!signature || !timestamp || !privateKey) return false;
  if (!HEX_SHA256.test(signature)) return false;
  const message = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', privateKey).update(message).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex'); // validated above
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

// Opt-in replay window. Off by default: retries and replays resend the original timestamp.
// BambooHR doesn't document the header format, so it is only parsed when enabled
// (epoch seconds or milliseconds).
function withinTolerance(timestamp: string, toleranceSeconds: number): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) return true;
  if (!/^\d+$/.test(timestamp)) return false;
  let sent = Number(timestamp);
  if (sent > 1e11) sent /= 1000; // milliseconds
  return Math.abs(Date.now() / 1000 - sent) <= toleranceSeconds;
}

export async function POST(request: NextRequest) {
  // Raw bytes are required for signature verification (works for JSON and form payloads)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-bamboohr-signature');
  const timestamp = request.headers.get('x-bamboohr-timestamp');

  if (!verifySignature(rawBody, signature, timestamp, process.env.BAMBOOHR_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (!withinTolerance(timestamp as string, Number(process.env.BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS || 0))) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after verification
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Form payloads use keys like employees[40351][action]; JSON is recommended, so just acknowledge
    console.log('BambooHR: form-encoded payload received (configure the webhook for JSON to process it)');
    return NextResponse.json({ received: true });
  }

  let payload: { employees?: Employee[]; type?: unknown; data?: EventData };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Event-based webhooks (recommended by BambooHR): one event per POST, { type, timestamp, data }
  if (typeof payload.type === 'string') {
    const data = payload.data || {};
    switch (payload.type) {
      case 'employee.created':
        console.log(`BambooHR: employee ${data.employeeId} created`);
        break;
      case 'employee.updated':
        console.log(`BambooHR: employee ${data.employeeId} updated:`, data.changedFields);
        break;
      case 'employee.deleted':
        console.log(`BambooHR: employee ${data.employeeId} deleted`);
        break;
      case 'company.updated':
      case 'company.deleted':
      case 'company-integrations.updated':
        console.log(`BambooHR: ${payload.type} for company ${data.companyId}`);
        break;
      default:
        console.log(`BambooHR: unhandled event type ${payload.type}`);
    }
    return NextResponse.json({ received: true });
  }

  // Field-based (legacy) webhooks: employees may be batched into one POST; ignore unrecognized fields
  const employees = Array.isArray(payload.employees) ? payload.employees : [];
  for (const employee of employees) {
    switch (employee.action) {
      case 'Created':
        console.log(`BambooHR: employee ${employee.id} created`);
        break;
      case 'Updated':
        console.log(`BambooHR: employee ${employee.id} updated:`, employee.changedFields);
        break;
      case 'Deleted':
        console.log(`BambooHR: employee ${employee.id} deleted`);
        break;
      default:
        console.log(`BambooHR: unhandled action ${employee.action} for employee ${employee.id}`);
    }
  }

  return NextResponse.json({ received: true });
}
