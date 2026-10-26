// Generated with: deliverect-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { handleDeliverectRequest } from '../../../../lib/deliverect';

// /webhooks/deliverect/<kind>, e.g. order_status_update, menu_update, snooze_unsnooze, busy_mode
async function handler(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  return handleDeliverectRequest(request, kind);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
