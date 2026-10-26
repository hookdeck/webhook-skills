// Generated with: factorial-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFactorialRequest } from '../../../lib/verify-factorial';

type Resource = { id?: number; [key: string]: unknown };

// The body is the affected resource with no event field: the subscription decides the type.
// Register one target_url per subscription_type (e.g. ...?type=timeoff/leave/create) and
// dispatch on that hint. The `type` query parameter is this example's convention, not Factorial's.
const HANDLERS: Record<string, (r: Resource) => void> = {
  'employees/employee/create_with_contract': (r) => console.log(`Employee created: ${r.id} ${r.full_name}`),
  'employees/employee/update': (r) => console.log(`Employee updated: ${r.id} ${r.full_name}`),
  'employees/employee/terminate': (r) => console.log(`Employee terminated: ${r.id} on ${r.terminated_on}`),
  'contracts/contract_version/create': (r) => console.log(`Contract version created: ${r.id}`),
  'timeoff/leave/create': (r) => console.log(`Leave requested: ${r.id}`),
  'timeoff/leave/approve': (r) => console.log(`Leave approved: ${r.id}`),
  'timeoff/leave/reject': (r) => console.log(`Leave rejected: ${r.id}`),
  'attendance/shift/clock_in': (r) => console.log(`Clock in: shift ${r.id}`),
  'ats/application/create': (r) => console.log(`Application created: ${r.id}`),
  'ats/candidate/create': (r) => console.log(`Candidate created: ${r.id}`),
};

function handleResource(subscriptionType: string | null, resource: Resource): void {
  const handler = subscriptionType ? HANDLERS[subscriptionType] : undefined;
  if (handler) {
    // Retries re-send an identical body and there is no delivery ID, so make the work idempotent:
    // upsert on resource.id, or dedupe on `${subscriptionType}:${resource.id}:${resource.updated_at}`.
    handler(resource);
  } else {
    console.log(`Unhandled subscription type: ${subscriptionType || '(none)'}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFactorialRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-factorial-wh-challenge' }, { status: 401 });
  }

  let resource: unknown;
  try {
    // Read as text so any content type is accepted.
    resource = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleResource(request.nextUrl.searchParams.get('type'), resource as Resource);
  } catch (err) {
    console.error('Error handling Factorial webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
