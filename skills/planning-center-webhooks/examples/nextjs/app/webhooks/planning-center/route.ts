// Generated with: planning-center-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlanningCenter } from '../../../lib/planning-center';

interface EventDelivery {
  id: string;
  type: 'EventDelivery';
  attributes: {
    name: string;
    attempt: number;
    payload: string; // a JSON string, parsed a second time below
  };
}

export async function POST(request: NextRequest) {
  // Raw body: the signature covers the exact bytes received
  const rawBody = await request.text();
  const signature = request.headers.get('x-pco-webhooks-authenticity');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-PCO-Webhooks-Authenticity header' }, { status: 400 });
  }
  if (!verifyPlanningCenter(rawBody, signature, process.env.PLANNING_CENTER_AUTHENTICITY_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let deliveries: EventDelivery[];
  try {
    const body = JSON.parse(rawBody);
    deliveries = Array.isArray(body.data) ? body.data : [];
    for (const delivery of deliveries) {
      const { name, attempt, payload } = delivery.attributes;
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      switch (name) {
        case 'people.v2.events.person.updated':
          console.log(`Person updated (attempt ${attempt}):`, parsed?.data?.id, parsed?.data?.attributes?.name);
          break;
        default:
          // Event names look like <app>.<version>.events.<resource>.<action>
          console.log(`Unhandled event: ${name}`);
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Anything other than 200 is retried; a 410 deactivates the subscription
  return NextResponse.json({ received: true });
}
