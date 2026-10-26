import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyOnshapeSignature, isTimestampFresh } from '../lib/onshape';

const SECRET = 'test_primary_signature_key';
const TS = '2024-05-05T23:46:29.284-0500';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.ONSHAPE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/onshape/route'));
});

afterEach(() => {
  delete process.env.ONSHAPE_WEBHOOK_TOLERANCE_SECONDS;
});

// Generate a real Onshape signature: base64 HMAC-SHA256 of "<timestamp>.<raw body>"
function sign(body: string, timestamp = TS, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64');
}

function signed(body: string, timestamp = TS): Record<string, string> {
  return {
    'x-onshape-webhook-timestamp': timestamp,
    'x-onshape-webhook-signature-primary': sign(body, timestamp),
  };
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/onshape', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

// Payloads as shown in Onshape's webhook docs
const Z = '000000000000000000000000';
const ids = { workspaceId: Z, elementId: Z, webhookId: Z, messageId: Z, documentId: Z };
const events: Record<string, object> = {
  'onshape.model.lifecycle.changed': { ...ids, data: 'Some data', versionId: Z },
  'onshape.model.translation.complete': { ...ids, data: 'Some data', userId: Z, translationId: Z },
  'onshape.document.lifecycle.statechange': { ...ids, data: 'Some data', versionId: Z, documentState: 'TRASH' },
  'onshape.document.lifecycle.created': { ...ids },
  'onshape.revision.created': { ...ids },
  'onshape.comment.create': { ...ids, commentId: Z },
  'onshape.user.lifecycle.updateappsettings': { ...ids, userId: Z, clientId: Z },
  'webhook.register': { ...ids, data: 'Some data', versionId: Z },
  'webhook.ping': { ...ids, data: 'Some data', versionId: Z },
  'webhook.unregister': { ...ids },
};
const payload = (name: string) => JSON.stringify({ timestamp: TS, event: name, ...events[name] });

describe('verifyOnshapeSignature', () => {
  const body = payload('onshape.model.lifecycle.changed');
  const buf = Buffer.from(body);

  it('accepts a valid signature', () => {
    expect(verifyOnshapeSignature(buf, TS, sign(body), SECRET)).toBe(true);
  });

  it('signs the exact timestamp header value', () => {
    expect(verifyOnshapeSignature(buf, TS + ' ', sign(body), SECRET)).toBe(false);
  });

  it('verifies raw bytes that are not valid UTF-8 text', () => {
    const raw = Buffer.concat([Buffer.from('{"a":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(TS), Buffer.from('.'), raw]))
      .digest('base64');
    expect(verifyOnshapeSignature(raw, TS, sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body, wrong secret and missing values', () => {
    const sig = sign(body);
    expect(verifyOnshapeSignature(Buffer.from(body + ' '), TS, sig, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, sig, 'other_key')).toBe(false);
    expect(verifyOnshapeSignature(buf, null, sig, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, null, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, '', SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, sig, undefined)).toBe(false);
  });

  it('rejects malformed signatures', () => {
    const sig = sign(body);
    expect(verifyOnshapeSignature(buf, TS, sig.slice(0, -1), SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, '!' + sig.slice(1), SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, 'sha256=' + sig, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(buf, TS, sig.toLowerCase(), SECRET)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = Date.parse(TS);

  it('is off by default', () => {
    expect(isTimestampFresh('2000-01-01T00:00:00.000-0000', 0, now)).toBe(true);
    expect(isTimestampFresh('garbage', undefined, now)).toBe(true);
  });

  it('enforces the window when enabled', () => {
    expect(isTimestampFresh(TS, 300, now + 60 * 1000)).toBe(true);
    expect(isTimestampFresh(TS, 300, now + 10 * 60 * 1000)).toBe(false);
    expect(isTimestampFresh('not a date', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/onshape', () => {
  it.each(Object.keys(events))('accepts a signed %s event', async (name) => {
    const body = payload(name);
    const res = await POST(makeRequest(body, signed(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = payload('webhook.ping');
    const res = await POST(makeRequest(body, signed(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature is missing', async () => {
    const body = payload('webhook.ping');
    const res = await POST(makeRequest(body, { 'x-onshape-webhook-timestamp': TS }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const body = payload('webhook.ping');
    const res = await POST(makeRequest(body, { 'x-onshape-webhook-signature-primary': sign(body) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = payload('webhook.ping');
    const res = await POST(
      makeRequest(body, { ...signed(body), 'x-onshape-webhook-signature-primary': sign('{}') })
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered body', async () => {
    const body = payload('webhook.ping');
    const res = await POST(makeRequest(body + ' ', signed(body)));
    expect(res.status).toBe(401);
  });

  it('does not fall back to the secondary signature header', async () => {
    const body = payload('webhook.ping');
    const res = await POST(
      makeRequest(body, {
        'x-onshape-webhook-timestamp': TS,
        'x-onshape-webhook-signature-secondary': sign(body),
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, signed(body)));
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = payload('webhook.ping');
    const res = await POST(makeRequest(body, signed(body, '2001-01-01T00:00:00.000-0000')));
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when a tolerance is set', async () => {
    process.env.ONSHAPE_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = payload('webhook.ping');
    const res = await POST(makeRequest(body, signed(body, '2001-01-01T00:00:00.000-0000')));
    expect(res.status).toBe(401);
  });
});
