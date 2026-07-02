// Generated with: salesforce-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';

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

const xmlResponse = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/xml' } });

/**
 * Timing-safe string comparison that never throws on length mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Parse the Outbound Message SOAP body and validate the OrganizationId.
 * Outbound Messages are unsigned — the OrganizationId (plus HTTPS + IP
 * allowlisting) is how you authenticate the sender. Throws on mismatch.
 */
export function verifyOutboundMessage(rawXml: string, expectedOrgId: string): any {
  const msg = parser.parse(rawXml)?.Envelope?.Body?.notifications;
  if (!msg) {
    throw new Error('Not a Salesforce Outbound Message');
  }
  if (!timingSafeEqual(String(msg.OrganizationId ?? ''), expectedOrgId)) {
    throw new Error('OrganizationId mismatch');
  }
  return msg;
}

function sObjectType(sobject: any): string {
  const raw: string = sobject?.['@_type'] || '';
  return raw.includes(':') ? raw.split(':').pop()! : raw;
}

export async function POST(request: NextRequest) {
  const expectedOrgId = process.env.SALESFORCE_ORG_ID;
  if (!expectedOrgId) {
    console.error('Missing SALESFORCE_ORG_ID environment variable');
    return xmlResponse('Server misconfigured', 500);
  }

  // Salesforce sends Content-Type: text/xml — read the RAW body, parse XML ourselves.
  const rawXml = await request.text();

  let msg: any;
  try {
    msg = verifyOutboundMessage(rawXml, expectedOrgId);
  } catch (err) {
    // Reject spoofed/unknown senders. Do NOT ack — we don't want retries for these.
    console.warn('Rejected Outbound Message:', (err as Error).message);
    return xmlResponse('Unauthorized', 401);
  }

  try {
    // A message carries 1–100 <Notification> elements; normalize to an array.
    const notifications = ([] as any[]).concat(msg.Notification || []);
    for (const n of notifications) {
      const type = sObjectType(n.sObject);
      const recordId = n.sObject?.Id;

      // Handle idempotently on n.Id / recordId — messages can be redelivered.
      switch (type) {
        case 'Account':
          console.log('Account changed:', recordId, n.sObject?.Name);
          break;
        case 'Contact':
          console.log('Contact changed:', recordId);
          break;
        case 'Lead':
          console.log('Lead changed:', recordId);
          break;
        case 'Opportunity':
          console.log('Opportunity changed:', recordId, n.sObject?.StageName);
          break;
        case 'Case':
          console.log('Case changed:', recordId);
          break;
        default:
          console.log('Unhandled sObject type:', type, recordId);
      }
    }

    // Acknowledge so Salesforce marks the message delivered.
    return xmlResponse(ACK_RESPONSE, 200);
  } catch (err) {
    // Processing failed — return non-200 so Salesforce retries (up to 24h).
    console.error('Error processing Outbound Message:', err);
    return xmlResponse('Processing error', 500);
  }
}
