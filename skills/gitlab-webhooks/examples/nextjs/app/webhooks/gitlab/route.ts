// Generated with: gitlab-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// GitLab webhook event types
interface GitLabWebhookBase {
  object_kind: string;
  event_name?: string;
  user_id?: number;
  user_name?: string;
  user_username?: string;
  user_email?: string;
  user_avatar?: string;
  project_id?: number;
  project?: {
    id: number;
    name: string;
    description?: string;
    web_url: string;
    avatar_url?: string;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    path_with_namespace: string;
    default_branch: string;
  };
}

interface PushEvent extends GitLabWebhookBase {
  object_kind: 'push';
  before: string;
  after: string;
  ref: string;
  checkout_sha?: string;
  total_commits_count: number;
  commits?: Array<{
    id: string;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
  }>;
}

interface MergeRequestEvent extends GitLabWebhookBase {
  object_kind: 'merge_request';
  object_attributes: {
    id: number;
    iid: number;
    title: string;
    state: string;
    action: string;
    source_branch: string;
    target_branch: string;
    description?: string;
    url: string;
  };
}

interface IssueEvent extends GitLabWebhookBase {
  object_kind: 'issue' | 'work_item';
  object_attributes: {
    id: number;
    iid: number;
    title: string;
    state: string;
    action: string;
    description?: string;
    url: string;
  };
}

interface PipelineEvent extends GitLabWebhookBase {
  object_kind: 'pipeline';
  object_attributes: {
    id: number;
    ref: string;
    tag: boolean;
    sha: string;
    before_sha: string;
    status: string;
    detailed_status: string;
    duration?: number;
    created_at: string;
    finished_at?: string;
  };
}

// Type guard functions
function isPushEvent(payload: any): payload is PushEvent {
  return payload.object_kind === 'push';
}

function isMergeRequestEvent(payload: any): payload is MergeRequestEvent {
  return payload.object_kind === 'merge_request';
}

function isIssueEvent(payload: any): payload is IssueEvent {
  return payload.object_kind === 'issue' || payload.object_kind === 'work_item';
}

function isPipelineEvent(payload: any): payload is PipelineEvent {
  return payload.object_kind === 'pipeline';
}

// GitLab (19.0+) offers two ways to authenticate a webhook, and both can be
// configured on the same webhook:
// - Signing token (recommended): Standard Webhooks HMAC-SHA256 signature in
//   the webhook-signature header.
// - Secret token (legacy, "not recommended" by GitLab): the plain-text token
//   sent back in the X-Gitlab-Token header.
// https://docs.gitlab.com/user/project/integrations/webhooks/#signing-tokens

// GitLab says to check that webhook-timestamp is "recent" but gives no window.
// The Standard Webhooks spec asks for "some allowable tolerance"; 5 minutes is
// the default in the Standard Webhooks reference libraries.
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

// Signed content is "{webhook-id}.{webhook-timestamp}.{raw body}". The key is
// the signing token with the whsec_ prefix stripped, then base64-decoded.
function computeGitLabSignature(
  signingToken: string,
  webhookId: string,
  webhookTimestamp: string,
  rawBody: Buffer
): string {
  const key = Buffer.from(signingToken.replace(/^whsec_/, ''), 'base64');
  const digest = crypto
    .createHmac('sha256', key)
    .update(`${webhookId}.${webhookTimestamp}.`)
    .update(rawBody)
    .digest('base64');
  return `v1,${digest}`;
}

function verifyGitLabSignature(rawBody: Buffer, headers: Headers, signingToken: string): boolean {
  const webhookId = headers.get('webhook-id');
  const webhookTimestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!signingToken || !webhookId || !webhookTimestamp || !signatureHeader) {
    return false;
  }

  // Reject stale or future timestamps to limit replay
  const timestamp = Number(webhookTimestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = Buffer.from(
    computeGitLabSignature(signingToken, webhookId, webhookTimestamp, rawBody)
  );
  // The header is a space-separated list of "v1,<base64>" signatures
  return signatureHeader.split(' ').some((signature) => {
    const received = Buffer.from(signature);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

// Legacy secret token: compare X-Gitlab-Token with the configured token
function verifyGitLabToken(tokenHeader: string | null, secret: string | undefined): boolean {
  if (!tokenHeader || !secret) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(tokenHeader),
      Buffer.from(secret)
    );
  } catch (error) {
    // Buffers must be same length for timingSafeEqual
    // Different lengths = not equal
    return false;
  }
}

// GitLab's migration advice: verify the signature when webhook-signature is
// present, and fall back to the secret token otherwise. A request that carries
// a signature must pass the signature check; it never falls back.
function verifyGitLabWebhook(rawBody: Buffer, headers: Headers): boolean {
  const signingToken = process.env.GITLAB_WEBHOOK_SIGNING_TOKEN;
  if (signingToken && headers.get('webhook-signature')) {
    return verifyGitLabSignature(rawBody, headers, signingToken);
  }
  return verifyGitLabToken(headers.get('x-gitlab-token'), process.env.GITLAB_WEBHOOK_TOKEN);
}

export async function POST(request: NextRequest) {
  // Raw body: the signature covers the exact bytes GitLab sent
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Get headers directly from request
  const event = request.headers.get('x-gitlab-event');
  const instance = request.headers.get('x-gitlab-instance');
  const webhookUUID = request.headers.get('x-gitlab-webhook-uuid');
  const eventUUID = request.headers.get('x-gitlab-event-uuid');

  // Verify signature (or legacy token) before parsing
  if (!verifyGitLabWebhook(rawBody, request.headers)) {
    console.error(`GitLab webhook verification failed from ${instance}`);
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log(`✓ Verified GitLab webhook from ${instance}`);
  console.log(`  Event: ${event} (UUID: ${eventUUID})`);
  console.log(`  Webhook UUID: ${webhookUUID}`);

  // Parse body
  let payload: GitLabWebhookBase;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const { project, user_name } = payload;

  // Handle different event types
  if (isPushEvent(payload)) {
    const { ref, before, after, total_commits_count } = payload;
    const branch = ref?.replace('refs/heads/', '');
    console.log(`📤 Push to ${branch} by ${user_name}:`);
    console.log(`   ${total_commits_count || 0} commits (${before?.slice(0, 8) || 'unknown'}...${after?.slice(0, 8) || 'unknown'})`);
  } else if (isMergeRequestEvent(payload)) {
    const { object_attributes } = payload;
    const { iid, title, state, action, source_branch, target_branch } = object_attributes;
    console.log(`🔀 Merge Request !${iid} ${action}: ${title}`);
    console.log(`   ${source_branch} → ${target_branch} (${state})`);
  } else if (isIssueEvent(payload)) {
    const { object_attributes } = payload;
    const { iid, title, state, action } = object_attributes;
    console.log(`📋 Issue #${iid} ${action}: ${title}`);
    console.log(`   State: ${state}`);
  } else if (isPipelineEvent(payload)) {
    const { object_attributes } = payload;
    const { id, ref, status, duration } = object_attributes;
    console.log(`🔄 Pipeline #${id} ${status} for ${ref}`);
    if (duration) {
      console.log(`   Duration: ${duration}s`);
    }
  } else {
    // Handle other event types
    switch (payload.object_kind) {
      case 'tag_push': {
        const pushPayload = payload as any;
        const tag = pushPayload.ref?.replace('refs/tags/', '');
        if (pushPayload.before === '0000000000000000000000000000000000000000') {
          console.log(`🏷️  New tag created: ${tag} by ${user_name}`);
        } else {
          console.log(`🏷️  Tag deleted: ${tag} by ${user_name}`);
        }
        break;
      }
      case 'note': {
        const notePayload = payload as any;
        const { object_attributes, merge_request, issue } = notePayload;
        if (merge_request) {
          console.log(`💬 Comment on MR !${merge_request.iid} by ${user_name}`);
        } else if (issue) {
          console.log(`💬 Comment on Issue #${issue.iid} by ${user_name}`);
        }
        console.log(`   "${object_attributes?.note?.slice(0, 50)}..."`);
        break;
      }
      case 'build': {
        const buildPayload = payload as any;
        const { build_name, build_stage, build_status, build_duration } = buildPayload;
        console.log(`🔨 Job "${build_name}" ${build_status} in stage ${build_stage}`);
        if (build_duration) {
          console.log(`   Duration: ${build_duration}s`);
        }
        break;
      }
      case 'wiki_page': {
        const wikiPayload = payload as any;
        const { title, action, slug } = wikiPayload.object_attributes || {};
        console.log(`📖 Wiki page ${action}: ${title}`);
        console.log(`   Slug: ${slug}`);
        break;
      }
      case 'deployment': {
        const deployPayload = payload as any;
        const { status, environment } = deployPayload;
        console.log(`🚀 Deployment to ${environment}: ${status}`);
        break;
      }
      case 'release': {
        const releasePayload = payload as any;
        const { action, name, tag } = releasePayload;
        console.log(`📦 Release ${action}: ${name} (${tag})`);
        break;
      }
      default:
        console.log(`❓ Received ${payload.object_kind || event} event`);
        console.log(`   Project: ${project?.name} (${project?.path_with_namespace})`);
    }
  }

  // Return success response
  return NextResponse.json({
    received: true,
    event: payload.object_kind || event,
    project: project?.path_with_namespace
  });
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}