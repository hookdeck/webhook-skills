// Generated with: openclaw-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Payload fields come from OpenClaw's source (commit 5dc91d6), not its docs:
//   https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/cron/service/state.ts#L53-L76
//   https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L463-L468

// Finished event: OpenClaw POSTs it after an automation run when delivery mode is "webhook"
interface OpenClawFinishedEvent {
  action: 'finished';
  jobId: string;
  runId?: string;
  runAtMs?: number;
  durationMs?: number;
  status?: string; // "ok" | "error" | ...
  completionStatus?: string; // "succeeded" | "failed" | ...
  summary?: string; // omitted on error events
  error?: string;
  job?: { id: string; name?: string; [key: string]: unknown };
  nextRunAtMs?: number;
  [key: string]: unknown;
}

// Failure alert: sent to delivery.failureDestination when its mode is "webhook"
interface OpenClawFailureAlert {
  jobId: string;
  jobName?: string;
  message: string;
  runAtMs?: number;
}

/**
 * Verify an OpenClaw automation (cron) webhook.
 *
 * OpenClaw docs: "`webhookToken` is sent as `Authorization: Bearer <token>` on
 * automation webhook POSTs." The body is not signed, so the header is the whole
 * check. Compare the entire header value with "Bearer <webhookToken>" in constant
 * time, the same way Hookdeck's OpenClaw source does.
 */
export function verifyOpenClawWebhook(
  authorizationHeader: string | null,
  webhookToken: string | undefined
): boolean {
  if (!authorizationHeader || !webhookToken) return false;
  const received = Buffer.from(authorizationHeader, 'utf8');
  const expected = Buffer.from(`Bearer ${webhookToken}`, 'utf8');
  // Length check first: timingSafeEqual throws on buffers of different lengths
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function handleOpenClawPayload(payload: Record<string, any>): string {
  if (payload.action === 'finished') {
    const event = payload as OpenClawFinishedEvent;
    const name = event.job?.name || event.jobId;
    if (event.status === 'error' || event.completionStatus === 'failed') {
      console.log(`Automation "${name}" failed (run ${event.runId}): ${event.error || 'unknown error'}`);
    } else {
      console.log(`Automation "${name}" finished (run ${event.runId}): ${event.summary || ''}`);
    }
    return 'finished';
  }
  if (payload.jobId && typeof payload.message === 'string') {
    const alert = payload as OpenClawFailureAlert;
    console.log(`Failure alert for "${alert.jobName || alert.jobId}": ${alert.message}`);
    return 'failure_alert';
  }
  console.log('Unhandled OpenClaw payload');
  return 'unknown';
}

export async function POST(request: Request) {
  const webhookToken = process.env.OPENCLAW_WEBHOOK_TOKEN;
  if (!webhookToken) {
    console.error('OPENCLAW_WEBHOOK_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook token not configured' }, { status: 500 });
  }

  if (!verifyOpenClawWebhook(request.headers.get('authorization'), webhookToken)) {
    console.error('OpenClaw webhook verification failed');
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Read the raw body, then parse JSON only after the token check passes
  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // OpenClaw records delivery on any 2xx and does not retry an ambiguous send.
  // A relay such as Hookdeck can retry, so dedupe on runId (or jobId + runAtMs) in production.
  const kind = handleOpenClawPayload(payload as Record<string, any>);
  return NextResponse.json({ received: true, kind }, { status: 200 });
}
