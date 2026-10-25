// Generated with: egnyte-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Egnyte does not sign payloads. It sends the `authHeader` configured at webhook
 * registration as the `Authorization` header. Compare the complete header value,
 * including any "Bearer " prefix; don't strip or parse it.
 */
function verifyEgnyteRequest(headers, config = process.env) {
  const expected = config.EGNYTE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(event) {
  switch (event.eventType) {
    case 'fs:add_file':
      console.log(`File added: ${event.data?.targetPath}`);
      // TODO: sync the new file or version
      break;

    case 'fs:delete_file':
      console.log(`File deleted: ${event.data?.targetPath}`);
      // TODO: remove the file from your cache
      break;

    case 'fs:move_file':
      console.log(`File moved: ${event.data?.sourcePath} -> ${event.data?.targetPath}`);
      // TODO: update stored paths
      break;

    case 'fs:add_folder':
      console.log(`Folder added: ${event.data?.targetPath}`);
      break;

    case 'link:create':
      console.log(`Link created by ${event.user?.username}`);
      break;

    case 'comment:set_comment':
      console.log(`Comment on ${event.data?.targetPath}: ${event.data?.comment}`);
      break;

    case 'permission:permission_change':
      console.log(`Permission change on ${event.data?.folderPath}: ${event.data?.oldPrivilege} -> ${event.data?.newPrivilege}`);
      break;

    case 'workflow:completed':
      console.log(`Workflow completed: ${event.data?.workflow?.name}`);
      break;

    case 'group:add_members':
      console.log(`Members added to group ${event.data?.groupName}`);
      break;

    default:
      // Still acknowledge with 200: any other status makes Egnyte retry and eventually disable the webhook.
      console.log(`Unhandled Egnyte event: ${event.eventType}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Egnyte uses.
app.post('/webhooks/egnyte', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyEgnyteRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    return res.status(400).json({ error: 'Expected {"data": [...]}' });
  }

  try {
    // One request can carry several events. Dedupe on event.eventId in production.
    for (const event of payload.data) {
      handleEvent(event || {});
    }
  } catch (err) {
    console.error('Error handling Egnyte webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Egnyte expects exactly 200 (not 202/204).
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyEgnyteRequest = verifyEgnyteRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/egnyte`);
  });
}
