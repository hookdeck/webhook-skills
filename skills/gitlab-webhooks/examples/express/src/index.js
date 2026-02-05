// Generated with: gitlab-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// GitLab token verification
function verifyGitLabWebhook(tokenHeader, secret) {
  if (!tokenHeader || !secret) {
    return false;
  }

  // GitLab uses simple token comparison (not HMAC)
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GitLab webhook endpoint
app.post('/webhooks/gitlab',
  express.json({ limit: '25mb' }), // GitLab can send large payloads
  (req, res) => {
    // Extract headers
    const token = req.headers['x-gitlab-token'];
    const event = req.headers['x-gitlab-event'];
    const instance = req.headers['x-gitlab-instance'];
    const webhookUUID = req.headers['x-gitlab-webhook-uuid'];
    const eventUUID = req.headers['x-gitlab-event-uuid'];

    // Verify token
    if (!verifyGitLabWebhook(token, process.env.GITLAB_WEBHOOK_TOKEN)) {
      console.error(`GitLab webhook verification failed from ${instance}`);
      return res.status(401).send('Unauthorized');
    }

    console.log(`✓ Verified GitLab webhook from ${instance}`);
    console.log(`  Event: ${event} (UUID: ${eventUUID})`);
    console.log(`  Webhook UUID: ${webhookUUID}`);

    // Handle different event types based on object_kind
    const { object_kind, project, user_name, user_username } = req.body;

    switch (object_kind) {
      case 'push': {
        const { ref, before, after, total_commits_count } = req.body;
        const branch = ref?.replace('refs/heads/', '');
        console.log(`📤 Push to ${branch} by ${user_name}:`);
        console.log(`   ${total_commits_count || 0} commits (${before?.slice(0, 8) || 'unknown'}...${after?.slice(0, 8) || 'unknown'})`);
        break;
      }

      case 'tag_push': {
        const { ref, before, after } = req.body;
        const tag = ref?.replace('refs/tags/', '');
        if (before === '0000000000000000000000000000000000000000') {
          console.log(`🏷️  New tag created: ${tag} by ${user_name}`);
        } else {
          console.log(`🏷️  Tag deleted: ${tag} by ${user_name}`);
        }
        break;
      }

      case 'merge_request': {
        const { object_attributes } = req.body;
        const { iid, title, state, action, source_branch, target_branch } = object_attributes || {};
        console.log(`🔀 Merge Request !${iid} ${action}: ${title}`);
        console.log(`   ${source_branch} → ${target_branch} (${state})`);
        break;
      }

      case 'issue':
      case 'work_item': {
        const { object_attributes } = req.body;
        const { iid, title, state, action } = object_attributes || {};
        console.log(`📋 Issue #${iid} ${action}: ${title}`);
        console.log(`   State: ${state}`);
        break;
      }

      case 'note': {
        const { object_attributes, merge_request, issue, commit } = req.body;
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
        const { object_attributes } = req.body;
        const { id, ref, status, duration, created_at } = object_attributes || {};
        console.log(`🔄 Pipeline #${id} ${status} for ${ref}`);
        if (duration) {
          console.log(`   Duration: ${duration}s`);
        }
        break;
      }

      case 'build': { // Job events
        const { build_name, build_stage, build_status, build_duration } = req.body;
        console.log(`🔨 Job "${build_name}" ${build_status} in stage ${build_stage}`);
        if (build_duration) {
          console.log(`   Duration: ${build_duration}s`);
        }
        break;
      }

      case 'wiki_page': {
        const { object_attributes } = req.body;
        const { title, action, slug } = object_attributes || {};
        console.log(`📖 Wiki page ${action}: ${title}`);
        console.log(`   Slug: ${slug}`);
        break;
      }

      case 'deployment': {
        const { status, environment, deployable_url } = req.body;
        console.log(`🚀 Deployment to ${environment}: ${status}`);
        if (deployable_url) {
          console.log(`   URL: ${deployable_url}`);
        }
        break;
      }

      case 'release': {
        const { action, name, tag, description } = req.body;
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
  if (!process.env.GITLAB_WEBHOOK_TOKEN) {
    console.warn('⚠️  Warning: GITLAB_WEBHOOK_TOKEN not set');
  }
});

// For testing
module.exports = { app, server };