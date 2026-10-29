// Generated with: scaleway-topics-and-events-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { createHandler } from '../../../lib/handler';

// Built on first use, so the trust chain (SCALEWAY_SNS_TRUST_CHAIN_PATH) is read once and the
// signing-certificate cache lives as long as the server process.
let handler: ReturnType<typeof createHandler> | undefined;

export async function POST(request: Request) {
  handler ??= createHandler();
  return handler(request);
}
