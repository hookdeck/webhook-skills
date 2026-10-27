// Generated with: argo-cd-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyArgoCdRequest } from '../../../lib/verify-argo-cd';

// Illustrative payload: Argo CD has no event field. This body comes from the
// template in references/setup.md, whose "trigger" field is written by that template.
interface ArgoCdPayload {
  trigger?: string;
  app?: string;
  sync_status?: string;
  health?: string;
  [key: string]: unknown;
}

function handleNotification(payload: ArgoCdPayload): void {
  const { trigger, app, sync_status: syncStatus, health } = payload;

  switch (trigger) {
    case 'on-sync-succeeded':
      console.log(`Sync succeeded: ${app} (sync ${syncStatus}, health ${health})`);
      // TODO: mark the deployment as successful
      break;

    case 'on-sync-failed':
      console.log(`Sync failed: ${app} (sync ${syncStatus}, health ${health})`);
      // TODO: alert the team
      break;

    case 'on-health-degraded':
      console.log(`Health degraded: ${app} (sync ${syncStatus}, health ${health})`);
      // TODO: open an incident
      break;

    default:
      console.log(`Unhandled notification: ${trigger}`);
  }
}

// Argo CD sends GET unless the template sets a method, so one handler serves every
// method the template can choose (GET, POST, PUT, PATCH) plus DELETE.
async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyArgoCdRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Argo CD webhook credential' },
      { status: 401 }
    );
  }

  // Read as text so any content type is accepted. Argo CD sends the template body with
  // GET too, but Next.js drops GET request bodies: set `method: POST` in the template.
  const raw = await request.text();
  if (raw.trim() === '') {
    console.log(`Argo CD ${request.method} request with an empty body`);
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleNotification(payload as ArgoCdPayload);
  } catch (err) {
    console.error('Error handling Argo CD notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
