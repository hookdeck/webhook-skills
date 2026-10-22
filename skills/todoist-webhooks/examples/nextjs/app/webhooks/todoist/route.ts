// Generated with: todoist-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTodoistWebhook, seenDeliveries } from '../../../lib/todoist';

export async function POST(request: NextRequest) {
  // Raw body for signature verification (do not use request.json())
  const body = await request.text();
  const signature = request.headers.get('x-todoist-hmac-sha256');
  const deliveryId = request.headers.get('x-todoist-delivery-id');

  if (!verifyTodoistWebhook(body, signature, process.env.TODOIST_CLIENT_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Retries reuse the same X-Todoist-Delivery-ID
  if (deliveryId && seenDeliveries.has(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (deliveryId) seenDeliveries.add(deliveryId);

  const { event_name: eventName, event_data: data, user_id: userId } = event;
  console.log(`Received ${eventName} for user ${userId}`);

  switch (eventName) {
    case 'item:added':
      console.log('Task added:', data.id, data.content);
      break;
    case 'item:updated':
      console.log('Task updated:', data.id);
      break;
    case 'item:completed':
      console.log('Task completed:', data.id);
      break;
    case 'item:uncompleted':
      console.log('Task uncompleted:', data.id);
      break;
    case 'item:deleted':
      console.log('Task deleted:', data.id);
      break;
    case 'note:added':
      console.log('Comment added:', data.id);
      break;
    case 'project:added':
      console.log('Project added:', data.id, data.name);
      break;
    default:
      console.log(`Unhandled event: ${eventName}`);
  }

  // Todoist treats anything other than 200 as a failed delivery
  return NextResponse.json({ received: true });
}
