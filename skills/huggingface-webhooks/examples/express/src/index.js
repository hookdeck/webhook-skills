// Generated with: huggingface-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Hugging Face secret verification.
// HF sends the secret verbatim in X-Webhook-Secret (or in ?secret=).
// Compare with timing-safe comparison to prevent timing attacks.
function verifyHuggingFaceWebhook(secretHeader, secret) {
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Hugging Face webhook endpoint
app.post('/webhooks/huggingface',
  express.json({ limit: '5mb' }),
  (req, res) => {
    // Header is preferred; query parameter is supported as a fallback.
    const secretHeader = req.headers['x-webhook-secret'] || req.query.secret;

    if (!verifyHuggingFaceWebhook(secretHeader, process.env.HUGGINGFACE_WEBHOOK_SECRET)) {
      console.error('Hugging Face webhook verification failed');
      return res.status(401).send('Unauthorized');
    }

    const body = req.body || {};
    const event = body.event;

    if (!event || !event.scope || !event.action) {
      console.error('Missing event.scope or event.action in payload');
      return res.status(400).send('Invalid payload');
    }

    const { repo, discussion, comment, updatedRefs, updatedConfig, webhook } = body;
    const eventKey = `${event.scope}.${event.action}`;

    console.log(`✓ Verified Hugging Face webhook (v${webhook?.version ?? '?'})`);
    console.log(`  Event: ${eventKey}`);
    if (repo) {
      console.log(`  Repo: ${repo.type}/${repo.name} (private=${repo.private})`);
    }

    switch (event.scope) {
      case 'repo': {
        // action: create | update | delete | move
        console.log(`📦 Repo ${event.action}: ${repo?.name} (${repo?.type})`);
        if (repo?.headSha) {
          console.log(`   headSha: ${repo.headSha.slice(0, 8)}`);
        }
        break;
      }

      case 'repo.content': {
        // action is always "update"
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
        // action is always "update"
        console.log(`⚙️  Repo config updated on ${repo?.name}:`, updatedConfig ?? {});
        break;
      }

      case 'discussion': {
        // action: create | update | delete
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
        // action: create | update
        const author = comment?.author?.id ?? 'unknown';
        const preview = typeof comment?.content === 'string'
          ? comment.content.slice(0, 80)
          : '(hidden)';
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

    res.json({
      received: true,
      event: eventKey,
      repo: repo?.name,
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).send('Invalid JSON');
  }
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Hugging Face webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/huggingface`);
    if (!process.env.HUGGINGFACE_WEBHOOK_SECRET) {
      console.warn('⚠️  Warning: HUGGINGFACE_WEBHOOK_SECRET not set');
    }
  });
}

module.exports = { app, server };
