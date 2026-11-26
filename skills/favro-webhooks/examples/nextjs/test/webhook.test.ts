import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

process.env.FAVRO_WEBHOOK_SECRET = 'test_favro_webhook_secret';
process.env.FAVRO_WEBHOOK_URL = 'https://example.com/webhooks/favro';

// Import after env is set up.
const routeModulePromise = import('../app/webhooks/favro/route');

const SECRET = process.env.FAVRO_WEBHOOK_SECRET as string;
const URL = process.env.FAVRO_WEBHOOK_URL as string;

/**
 * Compute a valid X-Favro-Webhook signature.
 * base64(HMAC-SHA1(secret, payloadId + webhookUrl)).
 */
function sign(payloadId: string, url = URL, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(payloadId + url, 'utf8').digest('base64');
}

const cardPayload = {
  payloadId: 'AbCdEf012345==',
  action: 'created',
  hookId: '5c1a0000',
  card: { cardId: 'card-1', name: 'Implement webhook receiver' },
};

const pingPayload = {
  payloadId: 'PiNg000000==',
  action: 'ping',
  hookId: '5c1a0000',
  hook: { url: URL },
};

function makeRequest(body: object, signature?: string): Request {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const sig = signature ?? sign((body as { payloadId: string }).payloadId);
  if (sig !== undefined) {
    headers['x-favro-webhook'] = sig;
  }
  return new Request('http://localhost/webhooks/favro', {
    method: 'POST',
    headers,
    body: raw,
  });
}

describe('verifyFavroWebhook', () => {
  it('returns true for a valid signature', async () => {
    const { verifyFavroWebhook } = await routeModulePromise;
    expect(verifyFavroWebhook(cardPayload.payloadId, URL, SECRET, sign(cardPayload.payloadId))).toBe(
      true
    );
  });

  it('returns false when the URL differs from the registered one', async () => {
    const { verifyFavroWebhook } = await routeModulePromise;
    const sig = sign(cardPayload.payloadId);
    expect(verifyFavroWebhook(cardPayload.payloadId, 'https://evil.example/x', SECRET, sig)).toBe(
      false
    );
  });

  it('returns false for the wrong secret', async () => {
    const { verifyFavroWebhook } = await routeModulePromise;
    expect(
      verifyFavroWebhook(cardPayload.payloadId, URL, 'wrong_secret', sign(cardPayload.payloadId))
    ).toBe(false);
  });

  it('returns false when the signature is missing', async () => {
    const { verifyFavroWebhook } = await routeModulePromise;
    expect(verifyFavroWebhook(cardPayload.payloadId, URL, SECRET, '')).toBe(false);
  });
});

describe('eventKey', () => {
  it('maps a ping', async () => {
    const { eventKey } = await routeModulePromise;
    expect(eventKey(pingPayload)).toBe('ping');
  });
  it('maps a card action', async () => {
    const { eventKey } = await routeModulePromise;
    expect(eventKey({ action: 'moved', card: {} })).toBe('card.moved');
  });
  it('maps a comment action', async () => {
    const { eventKey } = await routeModulePromise;
    expect(eventKey({ action: 'deleted', comment: {} })).toBe('comment.deleted');
  });
  it('maps a comment action when the card is included too', async () => {
    const { eventKey } = await routeModulePromise;
    expect(eventKey({ action: 'updated', card: {}, comment: {} })).toBe('comment.updated');
  });
});

describe('POST /webhooks/favro', () => {
  it('returns 200 for a valid card event', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(cardPayload) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for the setup ping', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(pingPayload) as never);
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(cardPayload, 'not-a-valid-signature') as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload (payloadId changed)', async () => {
    const { POST } = await routeModulePromise;
    const sig = sign(cardPayload.payloadId);
    const tampered = { ...cardPayload, payloadId: 'tampered==' };
    const res = await POST(makeRequest(tampered, sig) as never);
    expect(res.status).toBe(401);
  });

  it.each([
    { action: 'created', card: {} },
    { action: 'committed', card: {} },
    { action: 'moved', card: {} },
    { action: 'updated', card: {} },
    { action: 'deleted', card: {} },
    { action: 'created', comment: {} },
    { action: 'updated', comment: {} },
    { action: 'deleted', comment: {} },
  ])('handles %o with 200', async (event) => {
    const { POST } = await routeModulePromise;
    const payload = { payloadId: `id-${event.action}==`, hookId: 'h', ...event };
    const res = await POST(makeRequest(payload) as never);
    expect(res.status).toBe(200);
  });
});
