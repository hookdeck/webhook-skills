// Generated with: circleback-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify Circleback's x-signature: bare hex HMAC-SHA256 of the raw body,
 * keyed with the signing secret (UTF-8). No timestamp, no prefix.
 */
function verifyCirclebackSignature(rawBody, signature, secret) {
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Handle a verified Circleback meeting export.
 *
 * Circleback has no event types: every delivery is one meeting. Which fields
 * are present follows the automation's settings (notes, action items,
 * transcript, insights).
 */
function handleMeeting(meeting) {
  console.log(`Meeting: "${meeting.name}" (${meeting.id}, ${meeting.duration}s)`);
  console.log(`Link: https://circleback.ai/meetings/${meeting.id}`);
  console.log(`Attendees: ${(meeting.attendees ?? []).map((a) => a.email ?? a.name).join(', ')}`);

  if (meeting.notes) {
    console.log('Notes:', meeting.notes);
  }

  for (const item of meeting.actionItems ?? []) {
    console.log(`Action item [${item.status}]: ${item.title} (assignee: ${item.assignee?.email ?? 'unassigned'})`);
  }

  if (Array.isArray(meeting.transcript)) {
    console.log(`Transcript: ${meeting.transcript.length} segments`);
  }

  // TODO: Sync notes to your CRM, post the summary to Slack, create tasks, etc.
  // Deduplicate on meeting.id: Circleback sends no delivery ID header.
}

// Circleback webhook endpoint - must use the raw body for signature verification.
// type: '*/*' keeps req.body a Buffer whatever content type is sent.
app.post('/webhooks/circleback',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.CIRCLEBACK_SIGNING_SECRET;
    if (!secret) {
      console.error('CIRCLEBACK_SIGNING_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['x-signature'];
    if (!Buffer.isBuffer(req.body) || !verifyCirclebackSignature(req.body, signature, secret)) {
      return res.status(401).send('Invalid signature');
    }

    let meeting;
    try {
      meeting = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    try {
      handleMeeting(meeting);
    } catch (err) {
      console.error('Error handling Circleback webhook:', err);
      return res.status(500).send('Internal error');
    }

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCirclebackSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/circleback`);
  });
}
