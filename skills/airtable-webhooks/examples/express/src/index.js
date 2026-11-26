// Generated with: airtable-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Airtable webhook notification signature.
 *
 * Airtable signs the raw body with HMAC-SHA256 keyed on the base64-DECODED
 * macSecretBase64 (returned once at webhook creation). The header value is
 * "hmac-sha256=" + hex(digest).
 *
 * @param {Buffer} rawBody - Raw request body (do not parse before verifying)
 * @param {string} macHeader - X-Airtable-Content-MAC header value
 * @param {string} macSecretBase64 - macSecretBase64 from webhook creation
 * @returns {boolean}
 */
function verifyAirtableSignature(rawBody, macHeader, macSecretBase64) {
  if (!macHeader) return false;
  const key = Buffer.from(macSecretBase64, 'base64');
  const expected =
    'hmac-sha256=' + crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(macHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}

/**
 * Summarize one payload from the webhook payloads API into per-table counts of
 * created / changed / destroyed records. Pure function — easy to unit test.
 *
 * @param {object} payload - A single item from the `payloads` array
 * @returns {{ transactionNumber: number, source: string|undefined, tables: object }}
 */
function summarizeChanges(payload) {
  const tables = {};
  const changedTables = payload.changedTablesById || {};
  for (const [tableId, change] of Object.entries(changedTables)) {
    tables[tableId] = {
      created: Object.keys(change.createdRecordsById || {}).length,
      changed: Object.keys(change.changedRecordsById || {}).length,
      destroyed: (change.destroyedRecordIds || []).length,
    };
  }
  return {
    transactionNumber: payload.baseTransactionNumber,
    source: payload.actionMetadata && payload.actionMetadata.source,
    tables,
  };
}

/**
 * Fetch changes from the webhook payloads API, paging until mightHaveMore is false.
 * Called AFTER acknowledging the notification (never inline with the 200 response).
 *
 * @param {string} baseId
 * @param {string} webhookId
 * @param {number|undefined} cursor - Persisted cursor; omit on first call
 * @returns {Promise<{ payloads: object[], cursor: number }>}
 */
async function fetchPayloads(baseId, webhookId, cursor) {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  const payloads = [];
  let nextCursor = cursor;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`
    );
    if (nextCursor != null) url.searchParams.set('cursor', String(nextCursor));
    url.searchParams.set('limit', '50'); // max allowed

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      // Shares the base's 5 req/s limit — back off and retry the same cursor.
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }
    if (!res.ok) throw new Error(`Airtable payloads API returned ${res.status}`);

    const data = await res.json();
    payloads.push(...(data.payloads || []));
    nextCursor = data.cursor;
    if (!data.mightHaveMore) break;
  } while (true);

  return { payloads, cursor: nextCursor };
}

// Airtable notification endpoint — must use the RAW body for signature verification.
app.post(
  '/webhooks/airtable',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const mac = req.headers['x-airtable-content-mac'];

    if (!verifyAirtableSignature(req.body, mac, process.env.AIRTABLE_MAC_SECRET_BASE64)) {
      console.error('Airtable signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Thin ping: contains only base.id, webhook.id, timestamp — NO change data.
    const ping = JSON.parse(req.body.toString());
    const baseId = ping.base && ping.base.id;
    const webhookId = ping.webhook && ping.webhook.id;
    console.log(`Airtable notification for base=${baseId} webhook=${webhookId}`);

    // Acknowledge immediately with an empty body (must be within 25s).
    res.status(200).end();

    // Fetch the actual changes asynchronously, after responding.
    if (process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN) {
      const cursor = loadCursor(baseId, webhookId); // your persisted cursor
      fetchPayloads(baseId, webhookId, cursor)
        .then(({ payloads, cursor: next }) => {
          for (const payload of payloads) {
            const summary = summarizeChanges(payload);
            console.log('Changes:', JSON.stringify(summary));
            // Your code: dispatch on summary.tables / payload.actionMetadata.source
          }
          saveCursor(baseId, webhookId, next); // persist for next notification
        })
        .catch((err) => console.error('Failed to fetch payloads:', err));
    }
  }
);

// Replace these with real storage (DB, KV) in production.
function loadCursor(_baseId, _webhookId) {
  return undefined; // undefined = start from the earliest available payload
}
function saveCursor(_baseId, _webhookId, _cursor) {
  /* persist cursor */
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyAirtableSignature, summarizeChanges, fetchPayloads };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/airtable`);
  });
}
