require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Notion webhook signature.
 *
 * Notion sends `X-Notion-Signature: sha256=<hex>` where the hex is the
 * HMAC-SHA256 of the raw request body, keyed with the verification_token
 * captured during the one-time handshake.
 */
function verifyNotionSignature(rawBody, signatureHeader, verificationToken) {
  if (!signatureHeader || !verificationToken) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', verificationToken)
    .update(rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

// Notion requires the raw body for HMAC verification
app.post('/webhooks/notion',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-notion-signature'];
    const token = process.env.NOTION_VERIFICATION_TOKEN;

    // Handshake: the first delivery to a new subscription has no signature
    // and the body is { "verification_token": "secret_..." }. Surface it so
    // the developer can paste it into the Notion UI to activate the
    // subscription.
    if (!signature) {
      try {
        const parsed = JSON.parse(req.body.toString('utf8'));
        if (parsed && typeof parsed.verification_token === 'string') {
          console.log(
            'Notion verification_token (paste this into the Notion UI):',
            parsed.verification_token
          );
          return res.status(200).json({ received: true });
        }
      } catch {
        // fall through to 400
      }
      return res.status(400).send('Missing X-Notion-Signature');
    }

    if (!verifyNotionSignature(req.body, signature, token)) {
      console.error('Notion signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON body');
    }

    console.log(`Received ${event.type} (id: ${event.id})`);

    switch (event.type) {
      case 'page.content_updated':
        console.log('Page content updated:', event.entity?.id);
        // TODO: re-index the page, sync content, etc.
        break;

      case 'page.properties_updated':
        console.log('Page properties updated:', event.entity?.id);
        // TODO: react to status changes, recompute derived fields, etc.
        break;

      case 'page.created':
        console.log('Page created:', event.entity?.id);
        // TODO: provision related resources, notify, etc.
        break;

      case 'page.deleted':
        console.log('Page deleted:', event.entity?.id);
        // TODO: clean up mirrors, audit log, etc.
        break;

      case 'page.locked':
        console.log('Page locked:', event.entity?.id);
        // TODO: publishing / compliance flow
        break;

      case 'page.moved':
        console.log('Page moved:', event.entity?.id);
        // TODO: re-evaluate access, rebuild paths
        break;

      case 'comment.created':
        console.log('Comment created:', event.entity?.id);
        // TODO: notify, run AI triage, etc.
        break;

      case 'data_source.schema_updated':
        console.log('Data source schema updated:', event.entity?.id);
        // TODO: re-derive types
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNotionSignature = verifyNotionSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/notion`);
  });
}
