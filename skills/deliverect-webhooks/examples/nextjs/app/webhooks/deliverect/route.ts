// Generated with: deliverect-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { handleDeliverectRequest } from '../../../lib/deliverect';

// Deliverect sends mostly POSTs, but some signed calls are GETs with no body, so every method
// is handled. Optional kind segments live in ./[kind]/route.ts.
async function handler(request: Request) {
  return handleDeliverectRequest(request);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
