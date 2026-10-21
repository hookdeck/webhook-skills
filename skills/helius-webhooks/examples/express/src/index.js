require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory de-duplication by Solana transaction signature.
// Use a durable store (Redis, database) in production.
const seenSignatures = new Set();

/**
 * Helius does not sign webhooks. The authHeader configured on the webhook is
 * sent verbatim as the Authorization header, so compare the whole value.
 * Hashing both sides gives timingSafeEqual equal-length buffers.
 */
function verifyHeliusAuth(received, expected) {
  if (!received || !expected) return false;
  const a = crypto.createHash('sha256').update(received).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function handleTransaction(tx) {
  // Enhanced webhooks set tx.type; raw webhooks do not.
  switch (tx.type) {
    case 'NFT_SALE':
      console.log('NFT sale:', tx.description);
      // TODO: record the sale, notify subscribers
      break;
    case 'SWAP':
      console.log('Swap:', tx.description);
      // TODO: update positions, trigger trading logic
      break;
    case 'TRANSFER':
      console.log('Transfer:', tx.description);
      // TODO: credit deposits, update balances
      break;
    default:
      console.log('Unhandled transaction type:', tx.type || 'RAW', tx.signature);
  }
}

// Body is read raw for any content type, parsed only after authentication.
app.post('/webhooks/helius', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.HELIUS_AUTH_HEADER;
  if (!expected) {
    return res.status(500).send('HELIUS_AUTH_HEADER is not configured');
  }

  if (!verifyHeliusAuth(req.headers.authorization, expected)) {
    return res.status(401).send('Unauthorized');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Helius delivers an array of transactions
  const transactions = Array.isArray(payload) ? payload : [payload];

  for (const tx of transactions) {
    if (!tx || typeof tx !== 'object') continue;
    // Retries can redeliver the same transaction
    if (tx.signature) {
      if (seenSignatures.has(tx.signature)) continue;
      seenSignatures.add(tx.signature);
    }
    handleTransaction(tx);
  }

  // Acknowledge quickly; Helius expects a 200 within 1 second
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Helius webhook server running on port ${PORT}`);
  });
}

module.exports = { app, server, verifyHeliusAuth, seenSignatures };
