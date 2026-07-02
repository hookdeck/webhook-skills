// Generated with: salesforce-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

// Validate required environment variables at startup
const requiredEnvVars = ['SALESFORCE_ORG_ID'];
const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please set these variables in your .env file or environment');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Salesforce sends unsigned SOAP/XML. removeNSPrefix strips soapenv:/sf: prefixes.
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

// The exact SOAP ack Salesforce expects. Without <Ack>true</Ack> it retries for 24h.
const ACK_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
      <Ack>true</Ack>
    </notificationsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

/**
 * Timing-safe string comparison that never throws on length mismatch.
 */
function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Parse the Outbound Message SOAP body and validate the OrganizationId.
 * Salesforce Outbound Messages have NO signature — the OrganizationId, together
 * with HTTPS + IP allowlisting at the edge, is how you authenticate the sender.
 * Returns the `notifications` object, or throws if the org id doesn't match.
 */
function verifyOutboundMessage(rawXml, expectedOrgId) {
  const msg = parser.parse(rawXml)?.Envelope?.Body?.notifications;
  if (!msg) {
    throw new Error('Not a Salesforce Outbound Message');
  }
  if (!timingSafeEqual(msg.OrganizationId, expectedOrgId)) {
    throw new Error('OrganizationId mismatch');
  }
  return msg;
}

/**
 * Read the sObject type from its xsi:type attribute (e.g. "sf:Account" -> "Account").
 */
function sObjectType(sobject) {
  const raw = sobject?.['@_type'] || '';
  return raw.includes(':') ? raw.split(':').pop() : raw;
}

// Salesforce POSTs Content-Type: text/xml. Capture the RAW body as text so we can
// parse XML ourselves — never run it through express.json().
app.post('/webhooks/salesforce', express.text({ type: () => true }), (req, res) => {
  let msg;
  try {
    msg = verifyOutboundMessage(req.body, process.env.SALESFORCE_ORG_ID);
  } catch (err) {
    // Reject spoofed/unknown senders. Do NOT ack — we don't want to retry these.
    console.warn('Rejected Outbound Message:', err.message);
    return res.status(401).type('text/xml').send('Unauthorized');
  }

  try {
    // A message carries 1–100 <Notification> elements; normalize to an array.
    const notifications = [].concat(msg.Notification || []);
    for (const n of notifications) {
      const type = sObjectType(n.sObject);
      const recordId = n.sObject?.Id;

      // Handle idempotently on n.Id / recordId — messages can be redelivered.
      switch (type) {
        case 'Account':
          console.log('Account changed:', recordId, n.sObject?.Name);
          // TODO: sync account into your system
          break;
        case 'Contact':
          console.log('Contact changed:', recordId);
          // TODO: sync contact
          break;
        case 'Lead':
          console.log('Lead changed:', recordId);
          // TODO: route/enrich lead
          break;
        case 'Opportunity':
          console.log('Opportunity changed:', recordId, n.sObject?.StageName);
          // TODO: update forecast / notify sales
          break;
        case 'Case':
          console.log('Case changed:', recordId);
          // TODO: sync support ticket
          break;
        default:
          console.log('Unhandled sObject type:', type, recordId);
      }
    }

    // Acknowledge so Salesforce marks the message delivered.
    return res.status(200).type('text/xml').send(ACK_RESPONSE);
  } catch (err) {
    // Processing failed — return non-200 so Salesforce retries (up to 24h).
    console.error('Error processing Outbound Message:', err);
    return res.status(500).type('text/xml').send('Processing error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Start server only if not in test mode
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Salesforce Outbound Message listener running on port ${PORT}`);
  });
}

module.exports = { app, server, verifyOutboundMessage, ACK_RESPONSE };
