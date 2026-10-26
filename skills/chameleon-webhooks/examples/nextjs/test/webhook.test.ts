import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/chameleon/route';
import { verifyChameleonSignature, sentAtWithinTolerance, seenEventIds } from '../lib/verify-chameleon';

// Chameleon's Webhook Secret is used as-is, as UTF-8 text.
const SECRET = 'chameleon_test_secret_0123456789';

const EVENTS = [
  'ping', 'response.finished', 'alert.triggered',
  'helpbar.answer', 'helpbar.search', 'helpbar.item.action', 'helpbar.item.error',
  'tour.started', 'tour.completed', 'tour.exited', 'tour.snoozed', 'tour.button.clicked',
  'survey.started', 'survey.completed', 'survey.exited', 'survey.snoozed', 'survey.button.clicked',
  'embed.started', 'embed.completed', 'embed.exited', 'embed.snoozed', 'embed.button.clicked',
  'demo.started', 'demo.reveal', 'demo.finished', 'demo.form.submitted',
];

beforeAll(() => {
  process.env.CHAMELEON_WEBHOOK_SECRET = SECRET;
});

beforeEach(() => {
  seenEventIds.clear();
  delete process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS;
});

// The signature is the bare lowercase hex HMAC-SHA256 of the raw body.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Based on the documented ping example.
function samplePayload(kind = 'ping', id = '5fb70dcbc39330000325a817', sentAt = '2029-12-11T00:28:59.650Z') {
  return {
    id,
    kind,
    sent_at: sentAt,
    data: {
      account: { id: '58918bc07de121000432e9c0', domain: 'acme.co', name: 'Acme Corp' },
      profile: { id: '5f885a88e7daf3000e3eb4f6', email: 'jane@example.com', uid: '92340834' },
    },
  };
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-chameleon-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/chameleon', { method: 'POST', headers, body });
}

describe('verifyChameleonSignature', () => {
  const body = JSON.stringify(samplePayload());
  const raw = Buffer.from(body);

  it('accepts a valid bare hex signature', () => {
    expect(verifyChameleonSignature(raw, sign(body))).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyChameleonSignature(raw, sign(body).toUpperCase())).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyChameleonSignature(raw, sign(body, 'other_secret'))).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyChameleonSignature(Buffer.from('{"kind":"x"}'), sign(body))).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['too short', 'abc123'],
    ['too long', sign(body) + '00'],
    ['non-hex', 'z'.repeat(64)],
    ['prefixed', 'sha256=' + sign(body)],
    ['padded with whitespace', ' ' + sign(body)],
  ])('rejects a %s signature', (_name, sig) => {
    expect(verifyChameleonSignature(raw, sig as string | null | undefined)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyChameleonSignature(raw, sign(body), '')).toBe(false);
  });
});

describe('POST /webhooks/chameleon', () => {
  it.each(EVENTS)('accepts a signed %s event', async (kind) => {
    const body = JSON.stringify(samplePayload(kind));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(samplePayload('tour.completed'));
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature with 401', async () => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload())));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signature with 401', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body, sign(body, 'wrong')));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload()), 'not-hex'));
    expect(res.status).toBe(401);
  });

  it('rejects a body modified after signing', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body.replace('ping', 'tour.completed'), sign(body)));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed JSON body without a kind', async () => {
    const body = JSON.stringify({ id: '1' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('acknowledges an unknown kind', async () => {
    const body = JSON.stringify(samplePayload('future.topic'));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('acknowledges a retried delivery without reprocessing', async () => {
    const body = JSON.stringify(samplePayload('tour.completed', 'evt-dup'));
    expect(await (await POST(makeRequest(body, sign(body)))).json()).toEqual({ received: true });
    expect(await (await POST(makeRequest(body, sign(body)))).json()).toEqual({ received: true, duplicate: true });
  });
});

describe('optional sent_at check', () => {
  it('is off by default (the documented sample is dated 2029)', async () => {
    const body = JSON.stringify(samplePayload('ping'));
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('rejects a stale sent_at with 400 once enabled', async () => {
    process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS = '300';
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const body = JSON.stringify(samplePayload('ping', 'evt-old', old));
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });

  it('accepts a fresh sent_at once enabled', async () => {
    process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS = '300';
    const body = JSON.stringify(samplePayload('ping', 'evt-new', new Date().toISOString()));
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('sentAtWithinTolerance handles bad input', () => {
    expect(sentAtWithinTolerance('garbage', 300)).toBe(false);
    expect(sentAtWithinTolerance(undefined, 300)).toBe(false);
  });
});
