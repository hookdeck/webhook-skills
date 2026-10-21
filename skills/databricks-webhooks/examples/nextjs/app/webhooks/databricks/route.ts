// Generated with: databricks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Job/task payloads use `event_type`; SQL alert payloads use `event`.
// Fields without values are omitted, so everything is optional.
type DatabricksPayload = {
  event_type?: string;
  event?: string;
  workspace_id?: string;
  run?: { run_id?: string; parent_run_id?: string };
  job?: { job_id?: string; name?: string };
  task?: { task_key?: string };
  alert?: { title?: string; alert?: { id?: string; name?: string } };
  [key: string]: unknown;
};

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticate a Databricks webhook request.
 *
 * Databricks does NOT sign webhook payloads (no HMAC/signature header). The
 * Webhook notification destination can be given a username and password, which
 * Databricks sends as `Authorization: Basic base64(username:password)`.
 */
export function verifyDatabricksAuth(
  authHeader: string | null,
  username?: string,
  password?: string
): boolean {
  if (!authHeader || !username || !password || !authHeader.startsWith('Basic ')) return false;

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const i = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (i === -1) return false;
  // Evaluate both comparisons so timing doesn't reveal which one failed
  const userOk = safeEqual(decoded.slice(0, i), username);
  const passOk = safeEqual(decoded.slice(i + 1), password);
  return userOk && passOk;
}

function handleDatabricksEvent(payload: DatabricksPayload) {
  if (payload.event === 'alert_state_change') {
    const name = payload.alert?.alert?.name ?? payload.alert?.title;
    console.log(`SQL alert state change: ${name}`);
    // TODO: Route the alert (see alert.alert.evaluations[].state)
    return;
  }

  const runId = payload.run?.run_id;
  const jobName = payload.job?.name;
  const taskKey = payload.task?.task_key;
  const where = taskKey ? `task ${taskKey} of job ${jobName}` : `job ${jobName}`;

  switch (payload.event_type) {
    case 'jobs.on_start':
      console.log(`Run ${runId} started: ${where}`);
      // TODO: Mark the pipeline as running
      break;
    case 'jobs.on_success':
      console.log(`Run ${runId} succeeded: ${where}`);
      // TODO: Trigger downstream work
      break;
    case 'jobs.on_failure':
      console.log(`Run ${runId} failed: ${where}`);
      // TODO: Alert on-call / open a ticket
      break;
    case 'jobs.on_duration_warning_threshold_exceeded':
      console.log(`Run ${runId} exceeded its duration threshold: ${where}`);
      // TODO: Warn about slow runs
      break;
    default:
      console.log(`Unhandled Databricks event: ${payload.event_type ?? payload.event ?? 'unknown'}`);
  }
}

export async function POST(request: NextRequest) {
  const username = process.env.DATABRICKS_WEBHOOK_USERNAME;
  const password = process.env.DATABRICKS_WEBHOOK_PASSWORD;

  // Fail closed: without configured credentials there is nothing to check.
  if (!username || !password) {
    console.error('Set DATABRICKS_WEBHOOK_USERNAME and DATABRICKS_WEBHOOK_PASSWORD');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  if (!verifyDatabricksAuth(request.headers.get('authorization'), username, password)) {
    console.error('Databricks webhook authentication failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // No body signature to protect, so ordinary JSON parsing is fine here.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  handleDatabricksEvent(payload as DatabricksPayload);

  // Respond 2xx quickly
  return NextResponse.json({ received: true });
}
