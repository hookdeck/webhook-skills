// Generated with: meilisearch-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const zlib = require('zlib');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Meilisearch does not sign payloads. The only credential is the Authorization header
 * you configured, sent verbatim. Compare the WHOLE value, including any "Bearer " or
 * "Basic " prefix: don't strip, parse or base64-decode it.
 */
function verifyMeilisearchRequest(headers, config = process.env) {
  const expected = config.MEILISEARCH_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * The body is ndjson (one finished task object per line), gzip-compressed when the
 * sender sets Content-Encoding: gzip. Throws if the body can't be decoded or parsed.
 */
function parseTasks(raw, contentEncoding) {
  let buf = Buffer.isBuffer(raw) ? raw : Buffer.alloc(0);
  if (/\bgzip\b/i.test(contentEncoding || '')) {
    buf = zlib.gunzipSync(buf, { maxOutputLength: 50 * 1024 * 1024 });
  }
  const tasks = buf
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line)); // one JSON object per line, never the whole body
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new Error('Expected one JSON object per line');
    }
  }
  return tasks;
}

function handleTask(task) {
  const label = `${task.type} task ${task.uid} on ${task.indexUid ?? 'n/a'}: ${task.status}`;

  if (task.status === 'failed') {
    console.log(`Failed ${label}`, task.error && task.error.message);
    // TODO: alert your team (e.g. post to Slack)
    return;
  }
  if (task.status === 'canceled') {
    console.log(`Canceled ${label}`);
    return;
  }

  switch (task.type) {
    case 'documentAdditionOrUpdate':
      console.log(`${label} (${task.details && task.details.indexedDocuments} documents indexed)`);
      // TODO: purge your CDN or application cache
      break;
    case 'documentDeletion':
    case 'settingsUpdate':
    case 'indexCreation':
    case 'indexUpdate':
    case 'indexDeletion':
    case 'indexSwap':
    case 'dumpCreation':
    case 'snapshotCreation':
    case 'taskCancelation':
    case 'taskDeletion':
      console.log(label);
      break;
    default:
      console.log(`Unhandled Meilisearch task type: ${task.type}`);
  }
}

// Authenticate before the body is read, decompressed or parsed.
function authenticate(req, res, next) {
  if (!verifyMeilisearchRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }
  next();
}

// body-parser would otherwise gunzip the body itself. Keep the sender's Content-Encoding
// aside and hide it from body-parser so we receive the raw gzip bytes and gunzip them
// ourselves in parseTasks() (so undecodable bodies map to a clean 400).
function keepContentEncoding(req, res, next) {
  req.contentEncoding = req.headers['content-encoding'];
  delete req.headers['content-encoding'];
  next();
}

app.post(
  '/webhooks/meilisearch',
  authenticate,
  keepContentEncoding,
  express.raw({ type: '*/*', limit: '10mb' }), // any Content-Type works
  (req, res) => {
    let tasks;
    try {
      tasks = parseTasks(req.body, req.contentEncoding);
    } catch {
      return res.status(400).json({ error: 'Invalid gzip or ndjson body' });
    }

    try {
      tasks.forEach(handleTask);
    } catch (err) {
      console.error('Error handling Meilisearch webhook:', err);
      return res.status(500).json({ error: 'Handler error' });
    }

    res.status(200).json({ received: true, tasks: tasks.length });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMeilisearchRequest = verifyMeilisearchRequest;
module.exports.parseTasks = parseTasks;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/meilisearch`);
  });
}
