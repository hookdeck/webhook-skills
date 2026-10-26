// Generated with: jamf-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
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
 * Jamf Pro does not sign payloads. With Header Authentication you choose a header
 * name and value; Jamf Pro sends them on every request. Compare the WHOLE value
 * (do not strip a "Bearer " prefix). This authenticates the sender, not the body,
 * and gives no replay protection.
 */
function verifyJamfProRequest(
  headers,
  name = process.env.JAMF_PRO_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.JAMF_PRO_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

const EVENT_LABELS = {
  ComputerAdded: 'Computer enrolled',
  ComputerCheckIn: 'Computer checked in',
  ComputerInventoryCompleted: 'Computer inventory completed',
  ComputerPatchPolicyCompleted: 'Computer patch policy completed',
  ComputerPolicyFinished: 'Computer policy finished',
  ComputerPushCapabilityChanged: 'Computer push capability changed',
  DeviceAddedToDEP: 'Device added to Automated Device Enrollment',
  JSSShutdown: 'Jamf Pro server shut down',
  JSSStartup: 'Jamf Pro server started',
  MobileDeviceCheckIn: 'Mobile device checked in',
  MobileDeviceCommandCompleted: 'Mobile device command completed',
  MobileDeviceEnrolled: 'Mobile device enrolled',
  MobileDeviceInventoryCompleted: 'Mobile device inventory completed',
  MobileDevicePushSent: 'Mobile device push sent',
  MobileDeviceUnEnrolled: 'Mobile device unenrolled',
  PatchSoftwareTitleUpdated: 'Patch software title updated',
  PushSent: 'Push notification sent',
  RestAPIOperation: 'Classic API operation performed',
  SCEPChallenge: 'SCEP challenge requested',
  SmartGroupComputerMembershipChange: 'Computer smart group membership changed',
  SmartGroupMobileDeviceMembershipChange: 'Mobile device smart group membership changed',
  SmartGroupUserMembershipChange: 'User smart group membership changed'
};

function handleEvent(payload) {
  const { webhook = {}, event = {} } = payload;
  const label = EVENT_LABELS[webhook.webhookEvent];

  if (!label) {
    console.log(`Unhandled event: ${webhook.webhookEvent}`);
    return;
  }

  // TODO: act on `event` (its shape depends on webhook.webhookEvent), e.g.
  // ComputerAdded -> event.udid / event.serialNumber / event.jssID
  // MobileDeviceEnrolled -> event.udid / event.serialNumber
  console.log(`${label} (${webhook.webhookEvent}, webhook "${webhook.name}")`, Object.keys(event));
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/jamf-pro', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyJamfProRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  // JSON is assumed. Jamf Pro can also send XML: set the webhook's format to JSON.
  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body (set the Jamf Pro webhook format to JSON)' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Jamf Pro event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyJamfProRequest = verifyJamfProRequest;
module.exports.EVENT_LABELS = EVENT_LABELS;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/jamf-pro`);
  });
}
