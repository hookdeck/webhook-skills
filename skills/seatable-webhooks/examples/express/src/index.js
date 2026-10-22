require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a SeaTable webhook signature.
 * Header: X-Seatable-Signature: sha256=<hex HMAC-SHA256 of the raw body>
 * The secret is used as a UTF-8 string key.
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Seatable-Signature header value
 * @param {string} secret - Secret key set on the webhook in SeaTable
 * @returns {boolean}
 */
function verifySeaTableWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const received = signatureHeader.replace(/^sha256=/, '').toLowerCase();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Read the raw body for ANY content type so the signature always verifies
app.post('/webhooks/seatable',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SEATABLE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SEATABLE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-seatable-signature'];
    if (!verifySeaTableWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // `event` is currently always "update"; `data.op_type` says what changed
    const { event, data = {} } = payload;
    const rowCount = data.row_count ? ` (${data.row_count} rows)` : '';

    switch (data.op_type) {
      case 'insert_row':
      case 'create_row':
        console.log(`Row created in ${data.table_name}${rowCount}:`, data.row_id);
        // TODO: Sync the new row, notify, enrich, etc.
        break;

      case 'modify_row':
        console.log(`Row modified in ${data.table_name}${rowCount}:`, data.row_id);
        for (const change of data.row_data || []) {
          console.log(`  ${change.column_name}: ${JSON.stringify(change.old_value)} -> ${JSON.stringify(change.value)}`);
        }
        // TODO: React to column changes
        break;

      case 'delete_row':
        console.log(`Row deleted in ${data.table_name}${rowCount}:`, data.row_id);
        // TODO: Remove from downstream systems
        break;

      default:
        console.log(`Unhandled ${event} op_type: ${data.op_type}`);
    }

    // SeaTable disables the webhook after 5 consecutive non-200 responses
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifySeaTableWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/seatable`);
  });
}
