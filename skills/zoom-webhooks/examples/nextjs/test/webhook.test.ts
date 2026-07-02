import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import {
  verifyZoomWebhook,
  buildValidationResponse,
  POST,
} from '../app/webhooks/zoom/route';

const SECRET = 'test_zoom_secret_token';

beforeAll(() => {
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = SECRET;
});

/**
 * Generate a valid Zoom signature for testing.
 * Matches Zoom: v0=HMAC-SHA256("v0:{timestamp}:{body}", secretToken)
 */
function generateZoomSignature(
  payload: string,
  timestamp: string,
  secret: string
): string {
  const message = `v0:${timestamp}:${payload}`;
  const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return `v0=${hash}`;
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/webhooks/zoom', {
    method: 'POST',
    headers,
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('verifyZoomWebhook', () => {
  const timestamp = '1658940994';

  it('should return true for a valid signature', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(verifyZoomWebhook(payload, timestamp, signature, SECRET)).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const payload = '{"event":"meeting.started"}';

    expect(verifyZoomWebhook(payload, timestamp, 'v0=invalid', SECRET)).toBe(
      false
    );
  });

  it('should return false for a tampered body', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(
      verifyZoomWebhook('{"event":"meeting.ended"}', timestamp, signature, SECRET)
    ).toBe(false);
  });

  it('should return false for the wrong secret', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(verifyZoomWebhook(payload, timestamp, signature, 'wrong')).toBe(
      false
    );
  });

  it('should return false for a missing signature', () => {
    const payload = '{"event":"meeting.started"}';

    expect(verifyZoomWebhook(payload, timestamp, null, SECRET)).toBe(false);
  });

  it('should return false for a missing timestamp', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(verifyZoomWebhook(payload, null, signature, SECRET)).toBe(false);
  });
});

describe('buildValidationResponse', () => {
  it('should return plainToken and a hex encryptedToken', () => {
    const plainToken = 'qgg8vlvZRS6UYooatFL8Aw';
    const result = buildValidationResponse(plainToken, SECRET);

    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(plainToken)
      .digest('hex');

    expect(result).toEqual({ plainToken, encryptedToken: expected });
    expect(result.encryptedToken).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /webhooks/zoom', () => {
  const timestamp = '1658940994';

  it('should return 401 for a missing signature', async () => {
    const payload = JSON.stringify({ event: 'meeting.started' });
    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-zm-request-timestamp': timestamp,
      })
    );

    expect(response.status).toBe(401);
  });

  it('should return 401 for an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'meeting.started' });
    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-zm-request-timestamp': timestamp,
        'x-zm-signature': 'v0=invalid',
      })
    );

    expect(response.status).toBe(401);
  });

  it('should complete the endpoint.url_validation handshake', async () => {
    const plainToken = 'qgg8vlvZRS6UYooatFL8Aw';
    const payload = JSON.stringify({
      event: 'endpoint.url_validation',
      payload: { plainToken },
      event_ts: 1654503849680,
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-zm-request-timestamp': timestamp,
        'x-zm-signature': signature,
      })
    );

    const expectedEncrypted = crypto
      .createHmac('sha256', SECRET)
      .update(plainToken)
      .digest('hex');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ plainToken, encryptedToken: expectedEncrypted });
  });

  it('should return 200 for a valid meeting.started event', async () => {
    const payload = JSON.stringify({
      event: 'meeting.started',
      payload: { object: { id: '123456789', topic: 'Standup' } },
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-zm-request-timestamp': timestamp,
        'x-zm-signature': signature,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('should handle recording.completed event', async () => {
    const payload = JSON.stringify({
      event: 'recording.completed',
      payload: { object: { id: '123456789' } },
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-zm-request-timestamp': timestamp,
        'x-zm-signature': signature,
      })
    );

    expect(response.status).toBe(200);
  });
});
