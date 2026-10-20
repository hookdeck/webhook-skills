import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/reducto/route';

// Test signing secret. Svix secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const JOB_ID = 'a1b9090e-c9ae-420b-9726-f658afbbe338';

// Generate a valid signature the same way Svix does for Reducto.
function generateSignature(payload: string, secret: string, timestamp: string, msgId: string): string {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const newMsgId = () => 'msg_' + crypto.randomBytes(16).toString('hex');

function jobPayload(status: string): string {
  return JSON.stringify({
    status,
    job_id: JOB_ID,
    metadata: { user_id: '123', document_type: 'invoice' },
  });
}

function signedHeaders(payload: string, timestamp = now(), msgId = newMsgId()): Record<string, string> {
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': generateSignature(payload, TEST_SECRET, timestamp, msgId),
  };
}

function makeRequest(payload: string, headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/webhooks/reducto', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

describe('Reducto Webhook Handler', () => {
  beforeAll(() => {
    process.env.REDUCTO_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('processes a Completed job webhook', async () => {
    const payload = jobPayload('Completed');
    const response = await POST(makeRequest(payload, signedHeaders(payload)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, status: 'Completed', job_id: JOB_ID });
  });

  test('processes a Failed job webhook', async () => {
    const payload = jobPayload('Failed');
    const response = await POST(makeRequest(payload, signedHeaders(payload)));

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('Failed');
  });

  test('handles unknown statuses gracefully', async () => {
    const payload = jobPayload('Pending');
    const response = await POST(makeRequest(payload, signedHeaders(payload)));

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('Pending');
  });

  test('accepts multiple signatures (secret rotation)', async () => {
    const payload = jobPayload('Completed');
    const headers = signedHeaders(payload);
    headers['svix-signature'] = `v1,aW52YWxpZF9zaWduYXR1cmU= ${headers['svix-signature']}`;

    const response = await POST(makeRequest(payload, headers));
    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const response = await POST(makeRequest(jobPayload('Completed'), {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = jobPayload('Completed');
    const headers = signedHeaders(payload);
    headers['svix-signature'] = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    const response = await POST(makeRequest(payload, headers));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const headers = signedHeaders(jobPayload('Failed'));

    const response = await POST(makeRequest(jobPayload('Completed'), headers));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with the wrong secret', async () => {
    const payload = jobPayload('Completed');
    const timestamp = now();
    const msgId = newMsgId();
    const wrongSecret = 'whsec_' + Buffer.from('wrong_secret_key').toString('base64');

    const response = await POST(
      makeRequest(payload, {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': generateSignature(payload, wrongSecret, timestamp, msgId),
      })
    );
    expect(response.status).toBe(400);
  });

  test('rejects an old timestamp', async () => {
    const payload = jobPayload('Completed');
    // 10 minutes ago — outside the 5-minute tolerance.
    const old = (Math.floor(Date.now() / 1000) - 600).toString();

    const response = await POST(makeRequest(payload, signedHeaders(payload, old)));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    const saved = process.env.REDUCTO_WEBHOOK_SECRET;
    delete process.env.REDUCTO_WEBHOOK_SECRET;
    try {
      const payload = jobPayload('Completed');
      const response = await POST(makeRequest(payload, signedHeaders(payload)));
      expect(response.status).toBe(500);
    } finally {
      process.env.REDUCTO_WEBHOOK_SECRET = saved;
    }
  });
});
