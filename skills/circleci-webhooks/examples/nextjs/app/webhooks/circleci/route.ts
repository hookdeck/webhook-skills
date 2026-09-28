// Generated with: circleci-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// CircleCI OUTBOUND webhooks (CircleCI -> your endpoint), sent when a workflow
// or job reaches a terminal state.
//
//   header  : circleci-signature
//   format  : comma-separated `<version>=<signature>` pairs, e.g. `v1=<hex>`
//   version : v1 only. "Only check the latest signature type to prevent
//             downgrade attacks." No v1 entry -> reject.
//   algo    : HMAC-SHA256, LOWERCASE HEX (64 chars), not base64
//   signs   : the RAW request body bytes ONLY -- no timestamp, no id, no prefix
//   key     : the webhook's "Secret token" (API field `signing-secret`), used
//             as UTF-8 bytes DIRECTLY. No prefix to strip, no base64 decode.
//
// There is NO timestamp header and NO replay window in CircleCI's scheme.
// Replay protection is deduplication on the payload `id`.
//
// CircleCI publishes no SDK for webhook verification -- manual HMAC is the only
// path.
//
// Not Circle (circle.com, USDC/Circle Mint, ECDSA X-Circle-Signature) --
// unrelated company. Not CircleCI *custom* webhooks, which are inbound pipeline
// triggers going the other direction.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Node runtime: the Web Crypto edge runtime has no `crypto.timingSafeEqual`.
export const runtime = 'nodejs';
// Never cache a webhook route.
export const dynamic = 'force-dynamic';

/** Exactly two event types exist; the API enum is ["workflow-completed", "job-completed"]. */
export type CircleCIEventType = 'workflow-completed' | 'job-completed';

/** Workflows can be `error`; jobs cannot. */
export type WorkflowStatus = 'success' | 'failed' | 'error' | 'canceled' | 'unauthorized';
export type JobStatus = 'success' | 'failed' | 'canceled' | 'unauthorized';

// Payloads are "open maps": CircleCI may add fields without notice, so every
// interface carries an index signature and nearly everything is optional.
export interface CircleCIPipeline {
  id?: string;
  number?: number;
  created_at?: string;
  trigger?: { type?: string; [k: string]: unknown };
  // Present for GitHub OAuth and Bitbucket Cloud pipelines only.
  vcs?: {
    provider_name?: string;
    branch?: string;
    tag?: string;
    revision?: string;
    origin_repository_url?: string;
    target_repository_url?: string;
    commit?: {
      subject?: string;
      body?: string;
      author?: { name?: string; email?: string };
      committer?: { name?: string; email?: string };
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  // Present for GitLab and GitHub App pipelines instead of `vcs`.
  trigger_parameters?: {
    circleci?: Record<string, unknown>;
    git?: Record<string, unknown>;
    gitlab?: Record<string, unknown>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface CircleCIWebhookPayload {
  id?: string;
  type?: string;
  happened_at?: string;
  webhook?: { id?: string; name?: string };
  project?: { id?: string; name?: string; slug?: string };
  organization?: { id?: string; name?: string };
  // `status` is absent on job-completed payloads.
  workflow?: {
    id?: string;
    name?: string;
    created_at?: string;
    stopped_at?: string;
    url?: string;
    status?: WorkflowStatus;
    [k: string]: unknown;
  };
  pipeline?: CircleCIPipeline;
  job?: {
    id?: string;
    number?: number;
    name?: string;
    status?: JobStatus;
    started_at?: string;
    stopped_at?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * Verify a CircleCI outbound webhook signature.
 *
 * @param rawBody RAW, unparsed request body (string or Buffer).
 * @param signatureHeader The `circleci-signature` header value.
 * @param secret CIRCLECI_WEBHOOK_SECRET (the webhook's Secret token).
 */
export function verifyCircleCISignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  // Fail closed. A missing header or an unconfigured secret is a rejection,
  // never a free pass -- CircleCI's Secret token is optional in the web UI, so
  // unsigned deliveries are a real possibility and must not be accepted.
  if (!signatureHeader || !secret) return false;

  // The header is a COMMA-separated list of `<version>=<signature>` pairs.
  // Split each pair on the FIRST '=' so a value containing '=' is never
  // truncated, and take the entry whose key is exactly `v1`.
  let v1: string | null = null;
  for (const pair of signatureHeader.split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === 'v1') {
      v1 = pair.slice(eq + 1).trim();
      break;
    }
  }

  // No v1 entry -> REJECT. v2/v3 do not exist yet and their algorithm is
  // unknown; accepting one as a fallback is precisely the downgrade attack the
  // docs warn about.
  if (!v1) return false;

  // Sign the RAW BODY BYTES ONLY. The secret string's UTF-8 bytes are the key.
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Length guard BEFORE timingSafeEqual -- it throws on mismatched lengths, and
  // an uncaught throw becomes a 500 that CircleCI retries.
  const a = Buffer.from(v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface VcsInfo {
  source: 'vcs' | 'trigger_parameters';
  provider: string | null;
  branch: string | null;
  tag: string | null;
  revision: string | null;
  subject: string | null;
  authorName: string | null;
  repositoryUrl: string | null;
}

/**
 * Read branch / commit info from a pipeline, handling BOTH payload shapes.
 *
 * `pipeline.vcs` is present for GitHub OAuth and Bitbucket Cloud pipelines.
 * GitLab and GitHub App pipelines carry `pipeline.trigger_parameters` instead
 * and have NO `vcs` at all -- so `pipeline.vcs.branch` throws on those.
 */
export function extractVcsInfo(pipeline: CircleCIPipeline = {}): VcsInfo {
  if (pipeline.vcs) {
    const { vcs } = pipeline;
    return {
      source: 'vcs',
      provider: vcs.provider_name ?? null,
      branch: vcs.branch ?? null,
      tag: vcs.tag ?? null,
      revision: vcs.revision ?? null,
      subject: vcs.commit?.subject ?? null,
      authorName: vcs.commit?.author?.name ?? null,
      repositoryUrl: vcs.target_repository_url ?? vcs.origin_repository_url ?? null,
    };
  }

  // GitLab / GitHub App pipelines. Field names below are the ones in CircleCI's
  // documented GitLab sample: `git` carries {branch, tag, ref, checkout_sha,
  // checkout_url}; commit title/author/web URL live in the `gitlab` map (the
  // reference says that map is present for GitLab AND GitHub App triggers).
  // `git.tag` is "" (not absent) on branch builds, hence `||`.
  const params = pipeline.trigger_parameters ?? {};
  const git = (params.git ?? {}) as Record<string, string | undefined>;
  const gitlab = (params.gitlab ?? {}) as Record<string, string | undefined>;
  const circleci = (params.circleci ?? {}) as Record<string, string | undefined>;

  return {
    source: 'trigger_parameters',
    provider: circleci.trigger_type ?? null,
    branch: git.branch || gitlab.branch || null,
    tag: git.tag || null,
    revision: git.checkout_sha || gitlab.commit_sha || gitlab.checkout_sha || null,
    subject: gitlab.commit_title || null,
    authorName: gitlab.commit_author_name || null,
    repositoryUrl: gitlab.web_url || git.checkout_url || null,
  };
}

// --- Deduplication ---------------------------------------------------------
//
// CircleCI: "Webhook requests may be duplicated." There is NO delivery-id
// header, so the payload's top-level `id` is the dedupe key. The retry schedule
// is undocumented, so retain generously.
//
// In production use Redis/Postgres with a TTL, not a module-level Set -- this
// one does not survive a cold start and is not shared between instances.
const processedEventIds = new Set<string>();

function alreadyProcessed(eventId: string | undefined): boolean {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

/** Dispatch a verified event. Keep it under CircleCI's 10-second timeout. */
export function handleEvent(eventType: string | undefined, payload: CircleCIWebhookPayload): void {
  const vcs = extractVcsInfo(payload.pipeline);

  switch (eventType) {
    case 'workflow-completed': {
      // workflow.status: success | failed | error | canceled | unauthorized
      const { name, status, url } = payload.workflow ?? {};
      console.log(
        `[workflow-completed] ${payload.project?.slug} "${name}" -> ${status} ` +
          `(pipeline #${payload.pipeline?.number}, branch ${vcs.branch ?? vcs.tag ?? 'n/a'})`
      );
      console.log(`  ${url}`);

      if (status === 'success') {
        // TODO: promote the build, deploy, mark the commit green.
      } else if (status === 'failed' || status === 'error') {
        // TODO: alert the team, open an incident, record a DORA failure.
      }
      break;
    }

    case 'job-completed': {
      // job.status: success | failed | canceled | unauthorized (NO "error").
      // NOTE: payload.workflow has NO `status` on job-level webhooks.
      const { name, status, started_at: startedAt, stopped_at: stoppedAt } = payload.job ?? {};
      const durationMs =
        startedAt && stoppedAt
          ? new Date(stoppedAt).getTime() - new Date(startedAt).getTime()
          : null;
      console.log(
        `[job-completed] ${payload.project?.slug} job "${name}" -> ${status}` +
          (durationMs !== null ? ` in ${Math.round(durationMs / 1000)}s` : '')
      );

      // TODO: record job timings, track flaky tests, ingest artifacts.
      break;
    }

    case 'ping':
      // COMMUNITY-OBSERVED, not documented. The UI's "Test Ping Event" button
      // sends a normal signed POST; the docs say only that it has "an
      // abbreviated payload for ease of testing" and never publish the `type`.
      // Acknowledge it and read nothing beyond `id`/`type`.
      console.log(`[ping] webhook "${payload.webhook?.name}" reachable`);
      break;

    default:
      // Payloads are "open maps" -- new fields (and conceivably new types) may
      // appear without notice. Log and move on; never throw.
      console.log(`[unhandled] circleci-event-type: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CIRCLECI_WEBHOOK_SECRET;

  // Fail closed on misconfiguration. 500 (not 200) so CircleCI retries once the
  // secret is set, rather than silently swallowing real events.
  if (!secret) {
    console.error('CIRCLECI_WEBHOOK_SECRET is not set - refusing to accept unverified webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // RAW body, read BEFORE any request.json(). A parsed or re-serialized body
  // breaks the digest.
  const rawBody = await request.text();
  const signature = request.headers.get('circleci-signature');
  const eventType = request.headers.get('circleci-event-type');

  if (!signature) {
    // The Secret token is optional in CircleCI's UI, so a webhook can be
    // configured to send unsigned requests. Reject them rather than trusting.
    console.error('Missing circleci-signature header');
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // 1. VERIFY against the raw bytes, before anything is parsed.
  if (!verifyCircleCISignature(rawBody, signature, secret)) {
    console.error('CircleCI webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. PARSE -- only after verification passes.
  let payload: CircleCIWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. DEDUPE on the payload `id`. No delivery-id header exists.
  if (alreadyProcessed(payload.id)) {
    console.log(`Duplicate delivery ${payload.id} ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 4. Handle, then respond. CircleCI's timeout is 10 seconds -- for anything
  //    slower, enqueue here and process in a background worker.
  try {
    handleEvent(eventType ?? payload.type, payload);
  } catch (err) {
    console.error('Error handling CircleCI webhook:', err);
    // 500 so CircleCI retries.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
