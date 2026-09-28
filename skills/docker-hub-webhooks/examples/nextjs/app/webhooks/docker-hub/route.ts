// Generated with: docker-hub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';

// Docker Hub webhooks are UNSIGNED — there is no signature header, no shared
// secret and no auth option, so the only credential this handler has is the
// secret token in the URL path. The real handler therefore lives one segment
// deeper, at `app/webhooks/docker-hub/[token]/route.ts`, and the URL you
// register in Docker Hub must include your token:
//
//   https://your-app.example.com/webhooks/docker-hub/<DOCKER_HUB_WEBHOOK_TOKEN>
//
// This route exists to make the bare, token-less path fail closed rather than
// 404 ambiguously or — far worse — be left as an accidental unauthenticated
// endpoint if someone later adds a handler here. A POST with no token segment
// carries no credential at all, so it is rejected outright.
//
// Re-exported for convenience so importers can pull the helpers from either
// path; the POST handler below is deliberately NOT the real one.
export {
  verifyUrlToken,
  parsePush,
  summarizeDhiMetadata,
  confirmTag,
} from './[token]/route';
export type { ParsedPush, ParseError, DhiSummaryEntry } from './[token]/route';

export async function POST() {
  console.error(
    'Docker Hub webhook rejected: no token segment in the URL. Register ' +
      '/webhooks/docker-hub/<DOCKER_HUB_WEBHOOK_TOKEN> as the destination URL.'
  );
  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
