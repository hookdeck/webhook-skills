import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.SLACK_SIGNING_SECRET = 'test_slack_signing_secret';
});

const SIGNING_SECRET = 'test_slack_signing_secret';

/**
 * Generate a valid Slack signature for testing.
 * Matches Slack's algorithm: HMAC-SHA256("v0:{ts}:{body}", secret) hex-encoded.
 */
function generateSlackSignature(body: string, timestamp: string, secret: string): string {
  const basestring = `v0:${timestamp}:${body}`;
  const hex = crypto.createHmac('sha256', secret).update(basestring, 'utf8').digest('hex');
  return `v0=${hex}`;
}

function currentTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Verify Slack webhook signature (same logic as in route.ts).
 */
function verifySlackRequest(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  signingSecret: string
): boolean {
  if (!signatureHeader || !timestampHeader || !signingSecret) return false;

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60 * 5) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' +
    crypto.createHmac('sha256', signingSecret).update(basestring, 'utf8').digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Slack signature verification', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ type: 'event_callback' });
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    expect(verifySlackRequest(body, sig, ts, SIGNING_SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ type: 'event_callback' });
    const ts = currentTimestamp();

    expect(verifySlackRequest(body, 'v0=deadbeef', ts, SIGNING_SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifySlackRequest('{}', null, currentTimestamp(), SIGNING_SECRET)).toBe(false);
  });

  it('rejects a missing timestamp header', () => {
    const body = '{}';
    const sig = generateSlackSignature(body, currentTimestamp(), SIGNING_SECRET);
    expect(verifySlackRequest(body, sig, null, SIGNING_SECRET)).toBe(false);
  });

  it('rejects timestamps older than 5 minutes (replay protection)', () => {
    const body = '{}';
    const stale = (Math.floor(Date.now() / 1000) - 60 * 6).toString();
    const sig = generateSlackSignature(body, stale, SIGNING_SECRET);

    expect(verifySlackRequest(body, sig, stale, SIGNING_SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ event: { type: 'app_mention' } });
    const tampered = JSON.stringify({ event: { type: 'team_join' } });
    const ts = currentTimestamp();
    const sig = generateSlackSignature(original, ts, SIGNING_SECRET);

    expect(verifySlackRequest(tampered, sig, ts, SIGNING_SECRET)).toBe(false);
  });

  it('rejects a wrong signing secret', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const sig = generateSlackSignature(body, ts, SIGNING_SECRET);

    expect(verifySlackRequest(body, sig, ts, 'wrong_secret')).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const body = '{}';
    const sig = generateSlackSignature(body, '123', SIGNING_SECRET);
    expect(verifySlackRequest(body, sig, 'not-a-number', SIGNING_SECRET)).toBe(false);
  });
});

describe('Slack signature generation', () => {
  it('produces a v0= prefixed hex signature', () => {
    const sig = generateSlackSignature('{"test":true}', '1531420618', 'test_secret');
    expect(sig).toMatch(/^v0=[a-f0-9]{64}$/);
  });

  it('produces a consistent signature for the same input', () => {
    const body = '{"action":"opened"}';
    const ts = '1531420618';
    expect(generateSlackSignature(body, ts, 'test_secret')).toBe(
      generateSlackSignature(body, ts, 'test_secret')
    );
  });

  it('produces different signatures for different bodies', () => {
    const ts = '1531420618';
    expect(generateSlackSignature('{"id":1}', ts, 'test_secret')).not.toBe(
      generateSlackSignature('{"id":2}', ts, 'test_secret')
    );
  });

  it('produces different signatures for different timestamps', () => {
    const body = '{"id":1}';
    expect(generateSlackSignature(body, '1', 'test_secret')).not.toBe(
      generateSlackSignature(body, '2', 'test_secret')
    );
  });
});
