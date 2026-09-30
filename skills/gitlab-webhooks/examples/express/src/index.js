// Generated with: gitlab-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
function computeGitLabSignature(signingToken, webhookId, webhookTimestamp, rawBody) {
  const key = Buffer.from(signingToken.replace(/^whsec_/, ''), 'base64');
  const digest = crypto
    .createHmac('sha256', key)
    .update(`${webhookId}.${webhookTimestamp}.`)
    .update(rawBody)
    .digest('base64');
  return `v1,${digest}`;
}

function verifyGitLabSignature(rawBody, headers, signingToken) {
  const webhookId = headers['webhook-id'];
  const webhookTimestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
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
function verifyGitLabToken(tokenHeader, secret) {
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
function verifyGitLabWebhook(rawBody, headers) {
  const signingToken = process.env.GITLAB_WEBHOOK_SIGNING_TOKEN;
  if (signingToken && headers['webhook-signature']) {
    return verifyGitLabSignature(rawBody, headers, signingToken);
  }
  return verifyGitLabToken(headers['x-gitlab-token'], process.env.GITLAB_WEBHOOK_TOKEN);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GitLab webhook endpoint
app.post('/webhooks/gitlab',
  // Raw body: the signature covers the exact bytes GitLab sent.
  express.raw({ type: 'application/json', limit: '25mb' }), // GitLab can send large payloads
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Extract headers
    const event = req.headers['x-gitlab-event'];
    const instance = req.headers['x-gitlab-instance'];
    const webhookUUID = req.headers['x-gitlab-webhook-uuid'];
    const eventUUID = req.headers['x-gitlab-event-uuid'];

    // Verify signature (or legacy token) before parsing
    if (!verifyGitLabWebhook(rawBody, req.headers)) {
      console.error(`GitLab webhook verification failed from ${instance}`);
      return res.status(401).send('Unauthorized');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`✓ Verified GitLab webhook from ${instance}`);
    console.log(`  Event: ${event} (UUID: ${eventUUID})`);
    console.log(`  Webhook UUID: ${webhookUUID}`);

    // Handle different event types based on object_kind
    const { object_kind, project, user_name, user_username } = payload;

    switch (object_kind) {
      case 'push': {
        const { ref, before, after, total_commits_count } = payload;
        const branch = ref?.replace('refs/heads/', '');
        console.log(`📤 Push to ${branch} by ${user_name}:`);
        console.log(`   ${total_commits_count || 0} commits (${before?.slice(0, 8) || 'unknown'}...${after?.slice(0, 8) || 'unknown'})`);
        break;
      }

      case 'tag_push': {
        const { ref, before, after } = payload;
        const tag = ref?.replace('refs/tags/', '');
        if (before === '0000000000000000000000000000000000000000') {
          console.log(`🏷️  New tag created: ${tag} by ${user_name}`);
        } else {
          console.log(`🏷️  Tag deleted: ${tag} by ${user_name}`);
        }
        break;
      }

      case 'merge_request': {
        const { object_attributes } = payload;
        const { iid, title, state, action, source_branch, target_branch } = object_attributes || {};
        console.log(`🔀 Merge Request !${iid} ${action}: ${title}`);
        console.log(`   ${source_branch} → ${target_branch} (${state})`);
        break;
      }

      case 'issue':
      case 'work_item': {
        const { object_attributes } = payload;
        const { iid, title, state, action } = object_attributes || {};
        console.log(`📋 Issue #${iid} ${action}: ${title}`);
        console.log(`   State: ${state}`);
        break;
      }

      case 'note': {
        const { object_attributes, merge_request, issue, commit } = payload;
        const { noteable_type, note } = object_attributes || {};
        if (merge_request) {
          console.log(`💬 Comment on MR !${merge_request.iid} by ${user_name}`);
        } else if (issue) {
          console.log(`💬 Comment on Issue #${issue.iid} by ${user_name}`);
        } else if (commit) {
          console.log(`💬 Comment on commit ${commit.id.slice(0, 8)} by ${user_name}`);
        }
        console.log(`   "${note?.slice(0, 50)}${note?.length > 50 ? '...' : ''}"`);
        break;
      }

      case 'pipeline': {
        const { object_attributes } = payload;
        const { id, ref, status, duration, created_at } = object_attributes || {};
        console.log(`🔄 Pipeline #${id} ${status} for ${ref}`);
        if (duration) {
          console.log(`   Duration: ${duration}s`);
        }
        break;
      }

      case 'build': { // Job events
        const { build_name, build_stage, build_status, build_duration } = payload;
        console.log(`🔨 Job "${build_name}" ${build_status} in stage ${build_stage}`);
        if (build_duration) {
          console.log(`   Duration: ${build_duration}s`);
        }
        break;
      }

      case 'wiki_page': {
        const { object_attributes } = payload;
        const { title, action, slug } = object_attributes || {};
        console.log(`📖 Wiki page ${action}: ${title}`);
        console.log(`   Slug: ${slug}`);
        break;
      }

      case 'deployment': {
        const { status, environment, deployable_url } = payload;
        console.log(`🚀 Deployment to ${environment}: ${status}`);
        if (deployable_url) {
          console.log(`   URL: ${deployable_url}`);
        }
        break;
      }

      case 'release': {
        const { action, name, tag, description } = payload;
        console.log(`📦 Release ${action}: ${name} (${tag})`);
        if (description) {
          console.log(`   ${description.slice(0, 100)}${description.length > 100 ? '...' : ''}`);
        }
        break;
      }

      default:
        console.log(`❓ Received ${object_kind || event} event`);
        console.log(`   Project: ${project?.name} (${project?.path_with_namespace})`);
    }

    // Always return success to GitLab
    res.json({
      received: true,
      event: object_kind || event,
      project: project?.path_with_namespace
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`GitLab webhook server listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/gitlab`);
  if (!process.env.GITLAB_WEBHOOK_SIGNING_TOKEN && !process.env.GITLAB_WEBHOOK_TOKEN) {
    console.warn('⚠️  Warning: set GITLAB_WEBHOOK_SIGNING_TOKEN (or legacy GITLAB_WEBHOOK_TOKEN)');
  }
});

// For testing
module.exports = {
  app,
  server,
  computeGitLabSignature,
  verifyGitLabSignature,
  verifyGitLabToken,
  verifyGitLabWebhook,
};