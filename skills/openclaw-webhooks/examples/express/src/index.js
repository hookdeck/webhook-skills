// Generated with: openclaw-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Extract the OpenClaw hook token from request headers.
 * Supports both Authorization: Bearer <token> and x-openclaw-token: <token>.
 */
function extractToken(authHeader, xTokenHeader) {
  if (xTokenHeader) return xTokenHeader;
  if (authHeader && authHeader.startsWith('Bearer '))
    return authHeader.slice(7);
  return null;
}

/**
 * Verify OpenClaw webhook token using timing-safe comparison.
 * @param {string|null} authHeader - Authorization header value
 * @param {string|null} xTokenHeader - x-openclaw-token header value
 * @param {string} secret - Expected hook token
 * @returns {boolean}
 */
function verifyOpenClawWebhook(authHeader, xTokenHeader, secret) {
  const token = extractToken(authHeader, xTokenHeader);
  if (!token || !secret) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

// Reject query-string tokens
app.use('/webhooks/openclaw', (req, res, next) => {
  if (req.query.token) {
    return res.status(400).json({ error: 'Query-string tokens not accepted' });
  }
  next();
});

// OpenClaw agent hook endpoint
app.post('/webhooks/openclaw',
  express.json(),
  async (req, res) => {
    const authHeader = req.headers['authorization'];
    const xToken = req.headers['x-openclaw-token'];

    if (!verifyOpenClawWebhook(authHeader, xToken, process.env.OPENCLAW_HOOK_TOKEN)) {
      console.error('OpenClaw token verification failed');
      return res.status(401).send('Invalid token');
    }

    const {
      message,
      name,
      agentId,
      sessionKey,
      wakeMode,
      deliver,
      channel,
      to,
      model,
      thinking,
      timeoutSeconds
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const hookName = name || 'OpenClaw';
    console.log(`[${hookName}] Received agent hook`);
    console.log(`  message: ${message}`);
    if (agentId) console.log(`  agentId: ${agentId}`);
    if (model) console.log(`  model: ${model}`);

    // TODO: Process the webhook payload
    // Examples:
    //   - Forward to a task queue
    //   - Trigger a CI/CD pipeline
    //   - Store in a database for later processing
    //   - Send a notification to another service

    res.status(200).json({ received: true });
  }
);

// OpenClaw wake hook endpoint
app.post('/webhooks/openclaw/wake',
  express.json(),
  async (req, res) => {
    const authHeader = req.headers['authorization'];
    const xToken = req.headers['x-openclaw-token'];

    if (!verifyOpenClawWebhook(authHeader, xToken, process.env.OPENCLAW_HOOK_TOKEN)) {
      console.error('OpenClaw token verification failed');
      return res.status(401).send('Invalid token');
    }

    const { text, mode } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    console.log(`[Wake] ${text} (mode: ${mode || 'now'})`);

    // TODO: Handle wake event

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyOpenClawWebhook, extractToken };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Agent hook endpoint: POST http://localhost:${PORT}/webhooks/openclaw`);
    console.log(`Wake hook endpoint:  POST http://localhost:${PORT}/webhooks/openclaw/wake`);
  });
}
