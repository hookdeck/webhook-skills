import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/pylon/route';

const WEBHOOK_SECRET = 'test_pylon_secret';

beforeAll(() => {
  process.env.PYLON_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

/**
 * Sign the way Pylon signs X-Pylon-Signature-V2:
 * hex HMAC-SHA256 of `timestamp + "." + body`, keyed with the secret string.
 */
function signPylon(payload: string, timestamp: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');
}

const nowTimestamp = () => String(Math.floor(Date.now() / 1000));

const issuePayload = JSON.stringify({
  issue_id: 'b7c1a1d2-0000-4000-8000-000000000001',
  number: '42',
  title: 'Login is broken',
  tags: 'bug,urgent',
  requester_email: 'customer@example.com',
});

function makeRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/webhooks/pylon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('Pylon Webhook Route', () => {
  it('returns 200 for a signed delivery', async () => {
    const timestamp = nowTimestamp();
    const response = await POST(
      makeRequest(issuePayload, {
        'X-Pylon-Timestamp': timestamp,
        'X-Pylon-Signature-V2': signPylon(issuePayload, timestamp, WEBHOOK_SECRET),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('returns 200 for a signed test ping', async () => {
    const ping = '{"data":{"type":"ping"}}';
    const timestamp = nowTimestamp();
    const response = await POST(
      makeRequest(ping, {
        'X-Pylon-Timestamp': timestamp,
        'X-Pylon-Signature-V2': signPylon(ping, timestamp, WEBHOOK_SECRET),
      })
    );
    expect(response.status).toBe(200);
  });

  it('returns 400 for a missing signature', async () => {
    const response = await POST(makeRequest(issuePayload, { 'X-Pylon-Timestamp': nowTimestamp() }));
    expect(response.status).toBe(400);
  });

  it('returns 400 for a wrong secret', async () => {
    const timestamp = nowTimestamp();
    const response = await POST(
      makeRequest(issuePayload, {
        'X-Pylon-Timestamp': timestamp,
        'X-Pylon-Signature-V2': signPylon(issuePayload, timestamp, 'wrong_secret'),
      })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const timestamp = nowTimestamp();
    const response = await POST(
      makeRequest(issuePayload.replace('Login is broken', 'Nothing to see'), {
        'X-Pylon-Timestamp': timestamp,
        'X-Pylon-Signature-V2': signPylon(issuePayload, timestamp, WEBHOOK_SECRET),
      })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for a body-only (legacy X-Pylon-Signature) signature', async () => {
    const legacy = crypto.createHmac('sha256', WEBHOOK_SECRET).update(issuePayload).digest('hex');
    const response = await POST(
      makeRequest(issuePayload, { 'X-Pylon-Timestamp': nowTimestamp(), 'X-Pylon-Signature-V2': legacy })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for a timestamp more than 5 minutes old', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const response = await POST(
      makeRequest(issuePayload, {
        'X-Pylon-Timestamp': timestamp,
        'X-Pylon-Signature-V2': signPylon(issuePayload, timestamp, WEBHOOK_SECRET),
      })
    );
    expect(response.status).toBe(400);
  });
});
