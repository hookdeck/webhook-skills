// Generated with: micetribe-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyMicetribeSignature, toleranceFromEnv } from '../../../lib/micetribe';

// In-memory dedupe for the demo. Use a durable store (Redis, database unique key) in production.
const processed = new Set<string>();

export async function POST(request: NextRequest) {
  const secret = process.env.MICETRIBE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MICETRIBE_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // IMPORTANT: read the raw bytes with arrayBuffer(). Don't call request.json() first —
  // X-Signature covers X-Timestamp + "." + the exact bytes MICEtribe sent.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const result = verifyMicetribeSignature(
    rawBody,
    request.headers.get('x-signature'),
    request.headers.get('x-timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!result.valid) {
    console.error(`MICEtribe webhook rejected: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const trigger = event?.meta?.trigger;

  // Idempotency key: registration_id + meta.trigger + X-Request-Id.
  const key = `${event?.registration_id}:${trigger}:${request.headers.get('x-request-id')}`;
  if (processed.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processed.add(key);

  console.log(`Verified MICEtribe webhook: ${trigger} (registration ${event.registration_id})`);

  switch (trigger) {
    case 'registration.created':
      // A new registration was created. data.registration_data holds the attendee's fields.
      console.log(`New registration for ${event.data?.registration_data?.email} (${event.meta.event_name})`);
      break;

    case 'registration.updated':
      // An existing registration changed. data.entry_status is e.g. "Approved".
      console.log(`Registration ${event.registration_id} updated, status ${event.data?.entry_status}`);
      break;

    case 'registration.deleted':
      console.log(`Registration ${event.registration_id} deleted`);
      break;

    case 'registration.attended':
      // Attendance recorded: data.checkin.attended / checkin_at.
      console.log(`Registration ${event.registration_id} attended at ${event.data?.checkin?.checkin_at}`);
      break;

    case 'registration.printed':
      // Badge printed: data.print.print_count / last_printed_at.
      console.log(`Registration ${event.registration_id} badge printed (${event.data?.print?.print_count})`);
      break;

    default:
      console.log(`Unhandled MICEtribe event: ${trigger}`);
  }

  // Respond 2xx within 10 seconds; 3xx and above, errors and timeouts are retried.
  return NextResponse.json({ received: true });
}
