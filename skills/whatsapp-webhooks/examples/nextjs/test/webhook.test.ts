import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/webhooks/whatsapp/route';

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

beforeAll(() => {
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
});

/**
 * Generate a valid WhatsApp X-Hub-Signature-256 header for testing.
 */
function generateSignature(payload: string, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const messagePayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '123456' },
            messages: [
              { from: '15551234567', id: 'wamid.ABC', type: 'text', text: { body: 'Hello' } }
            ]
          }
        }
      ]
    }
  ]
});

const statusPayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '123456' },
            statuses: [{ id: 'wamid.ABC', status: 'delivered', recipient_id: '15551234567' }]
          }
        }
      ]
    }
  ]
});

function postRequest(body: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-hub-signature-256'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/whatsapp', {
    method: 'POST',
    headers,
    body
  });
}

describe('GET /webhooks/whatsapp (verification handshake)', () => {
  it('echoes hub.challenge when the verify token matches', async () => {
    const url =
      'http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe' +
      `&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`;
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1158201444');
  });

  it('returns 403 when the verify token does not match', async () => {
    const url =
      'http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe' +
      '&hub.verify_token=wrong_token&hub.challenge=1158201444';
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(403);
  });

  it('returns 403 when the mode is not subscribe', async () => {
    const url =
      'http://localhost:3000/webhooks/whatsapp?hub.mode=unsubscribe' +
      `&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`;
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(403);
  });
});

describe('POST /webhooks/whatsapp (event delivery)', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await POST(postRequest(messagePayload, null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await POST(postRequest(messagePayload, 'sha256=deadbeef'));
    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid inbound message', async () => {
    const sig = generateSignature(messagePayload, APP_SECRET);
    const response = await POST(postRequest(messagePayload, sig));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('returns 200 for a valid status update', async () => {
    const sig = generateSignature(statusPayload, APP_SECRET);
    const response = await POST(postRequest(statusPayload, sig));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('rejects a tampered payload', async () => {
    const sig = generateSignature(messagePayload, APP_SECRET);
    const tampered = messagePayload.replace('Hello', 'Goodbye');
    const response = await POST(postRequest(tampered, sig));
    expect(response.status).toBe(401);
  });
});
