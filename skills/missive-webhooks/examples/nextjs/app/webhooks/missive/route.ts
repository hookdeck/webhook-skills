// Generated with: missive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Subset of Missive's rule webhook payload. Dispatch on rule.type.
interface MissivePayload {
  rule?: { id: string; description?: string; type: string };
  conversation?: {
    id: string;
    subject?: string;
    shared_label_names?: string;
    shared_labels?: Array<{ id: string; name: string }>;
  };
  latest_message?: { id: string; subject?: string; preview?: string; type?: string };
}

const PREFIX = 'sha256=';

/**
 * Verify Missive's X-Hook-Signature: "sha256=" + hex HMAC-SHA256 of the raw
 * body, keyed with the rule's validation secret (UTF-8). No timestamp.
 */
function verifyMissiveSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith(PREFIX)) return false;
  const sig = header.slice(PREFIX.length);
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}

/**
 * Missive has no event header: dispatch on payload.rule.type. The docs' payload
 * example is label_change; other rule types are chosen in the rule UI.
 */
function handleRule(payload: MissivePayload) {
  const type = payload.rule?.type;
  const conversation = payload.conversation;

  switch (type) {
    case 'label_change':
      console.log(`Label change on "${conversation?.subject}" (${conversation?.id})`);
      console.log(`Shared labels: ${conversation?.shared_label_names || '(none)'}`);
      // TODO: Notify a channel, create a task, sync labels to your CRM, etc.
      break;
    case undefined:
      // Verified body without a rule (for example the validation request sent on save)
      console.log('Missive request without rule.type acknowledged');
      break;
    default:
      console.log(`Unhandled Missive rule type: ${type} (rule ${payload.rule?.id})`);
  }

  if (payload.latest_message) {
    console.log(`Latest message (${payload.latest_message.type}): ${payload.latest_message.subject ?? payload.latest_message.preview}`);
  }
  // Missive retries failed deliveries: deduplicate on rule.id + conversation.id + message id.
}

export async function POST(request: NextRequest) {
  const secret = process.env.MISSIVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MISSIVE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the raw body - verification must run on the exact bytes Missive sent
  const rawBody = await request.text();

  if (!verifyMissiveSignature(rawBody, request.headers.get('x-hook-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: MissivePayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    handleRule(payload);
  } catch (err) {
    console.error('Error handling Missive webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
