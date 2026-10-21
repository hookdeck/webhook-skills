// Generated with: heroku-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual, verifyHerokuWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const hmac = request.headers.get('heroku-webhook-hmac-sha256');

  if (!verifyHerokuWebhook(body, hmac, process.env.HEROKU_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Optional extra: the --authorization value is passed through unmodified
  const expectedAuth = process.env.HEROKU_WEBHOOK_AUTHORIZATION;
  if (expectedAuth && !safeEqual(request.headers.get('authorization') || '', expectedAuth)) {
    console.error('Authorization header mismatch');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse the payload after verification
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Subscriptions use "api:release"; payloads may carry "release". Accept both.
  const resource = String(event.resource || '').replace(/^api:/, '');
  const action = event.action;
  const data = event.data || {};

  console.log(`Received ${resource} ${action} webhook (event ${event.id})`);

  switch (`${resource}:${action}`) {
    case 'release:create':
    case 'release:update':
      console.log(`Release v${data.version} ${action}: status=${data.status}`);
      // TODO: Notify deploy channel, record release, etc.
      break;

    case 'build:create':
    case 'build:update':
      console.log(`Build ${data.id} ${action}: status=${data.status}`);
      // TODO: Track build progress, alert on failure, etc.
      break;

    case 'app:create':
    case 'app:update':
    case 'app:destroy':
      console.log(`App ${data.name} ${action}`);
      // TODO: Sync app inventory, etc.
      break;

    case 'dyno:create':
      console.log(`Dyno started: ${data.name}`);
      // TODO: Track dyno activity, etc.
      break;

    case 'formation:update':
    case 'formation:destroy':
      console.log(`Formation ${data.type} ${action}: quantity=${data.quantity}`);
      // TODO: Track scaling changes, etc.
      break;

    case 'addon-attachment:create':
    case 'addon-attachment:destroy':
      console.log(`Add-on attachment ${data.name} ${action}`);
      // TODO: Update add-on inventory, etc.
      break;

    default:
      console.log(`Unhandled event: ${resource} ${action}`);
  }

  // Heroku ignores the body; any 2xx counts as delivered
  return new NextResponse(null, { status: 204 });
}
