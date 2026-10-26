// Generated with: prive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest } from 'next/server';
import { receivePriveWebhook } from '../../../lib/prive';

// Generic endpoint (topic unknown) - used by the Hookdeck CLI default path.
// For per-topic dispatch see app/webhooks/prive/[topic]/route.ts.
export async function POST(request: NextRequest) {
  return receivePriveWebhook(request, undefined);
}
