// Generated with: huggingface-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Hugging Face webhook payload types
type RepoType = 'model' | 'dataset' | 'space';

interface RepoRef {
  type: RepoType;
  name: string;
  id: string;
  private: boolean;
  url: { web: string; api: string };
  headSha?: string;
  owner: { id: string };
}

interface DiscussionRef {
  id: string;
  title: string;
  url: { web: string; api: string };
  status: 'open' | 'closed' | string;
  author: { id: string };
  num: number;
  isPullRequest: boolean;
  changes?: { base?: string };
}

interface CommentRef {
  id: string;
  author: { id: string };
  content?: string; // undefined when hidden
  hidden: boolean;
  url: { web: string };
}

interface UpdatedRef {
  ref: string;
  oldSha: string | null;
  newSha: string | null;
}

interface HFWebhookPayload {
  event: { action: 'create' | 'update' | 'delete' | 'move' | string; scope: string };
  repo: RepoRef;
  discussion?: DiscussionRef;
  comment?: CommentRef;
  updatedRefs?: UpdatedRef[];
  updatedConfig?: Record<string, unknown>;
  webhook: { id: string; version: number };
}

// Hugging Face secret verification.
// HF sends the secret verbatim in X-Webhook-Secret (or in ?secret=).
function verifyHuggingFaceWebhook(
  secretHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secretHeader || !secret) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(secretHeader),
      Buffer.from(secret)
    );
  } catch {
    // Buffers must be same length for timingSafeEqual
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Header is preferred; query parameter is supported as a fallback.
  const headerSecret = request.headers.get('x-webhook-secret');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const provided = headerSecret || querySecret;

  if (!verifyHuggingFaceWebhook(provided, process.env.HUGGINGFACE_WEBHOOK_SECRET)) {
    console.error('Hugging Face webhook verification failed');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let payload: HFWebhookPayload;
  try {
    payload = (await request.json()) as HFWebhookPayload;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const { event, repo, discussion, comment, updatedRefs, updatedConfig, webhook } = payload || {};

  if (!event || !event.scope || !event.action) {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  const eventKey = `${event.scope}.${event.action}`;
  console.log(`✓ Verified Hugging Face webhook (v${webhook?.version ?? '?'})`);
  console.log(`  Event: ${eventKey}`);
  if (repo) {
    console.log(`  Repo: ${repo.type}/${repo.name} (private=${repo.private})`);
  }

  switch (event.scope) {
    case 'repo': {
      console.log(`📦 Repo ${event.action}: ${repo?.name} (${repo?.type})`);
      if (repo?.headSha) {
        console.log(`   headSha: ${repo.headSha.slice(0, 8)}`);
      }
      break;
    }

    case 'repo.content': {
      const refs = Array.isArray(updatedRefs) ? updatedRefs : [];
      console.log(`📝 Repo content updated on ${repo?.name}: ${refs.length} ref(s)`);
      for (const r of refs) {
        if (r.oldSha === null) {
          console.log(`   + ${r.ref} created (${r.newSha?.slice(0, 8)})`);
        } else if (r.newSha === null) {
          console.log(`   - ${r.ref} deleted`);
        } else {
          console.log(`   ~ ${r.ref}: ${r.oldSha.slice(0, 8)} → ${r.newSha.slice(0, 8)}`);
        }
      }
      break;
    }

    case 'repo.config': {
      console.log(`⚙️  Repo config updated on ${repo?.name}:`, updatedConfig ?? {});
      break;
    }

    case 'discussion': {
      const kind = discussion?.isPullRequest ? 'PR' : 'Discussion';
      console.log(`💬 ${kind} #${discussion?.num} ${event.action}: ${discussion?.title}`);
      if (discussion?.status) {
        console.log(`   status: ${discussion.status}`);
      }
      if (discussion?.changes?.base) {
        console.log(`   base: ${discussion.changes.base}`);
      }
      break;
    }

    case 'discussion.comment': {
      const author = comment?.author?.id ?? 'unknown';
      const preview =
        typeof comment?.content === 'string' ? comment.content.slice(0, 80) : '(hidden)';
      console.log(`🗨️  Comment ${event.action} by ${author}: "${preview}"`);
      break;
    }

    default: {
      // Forward-compatibility: treat narrowed scopes (e.g. repo.config.dois)
      // as an "update" on the broader scope.
      const broader = event.scope.split('.').slice(0, 2).join('.');
      console.log(`❓ Unknown scope "${event.scope}" — treating as update on "${broader}"`);
    }
  }

  return NextResponse.json({
    received: true,
    event: eventKey,
    repo: repo?.name,
  });
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
