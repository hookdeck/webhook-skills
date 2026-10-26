// Generated with: act-on-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/act-on/route';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('act-on-test-signing-key-0123456').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-signing-key-012345678').toString('base64');

/** Sign exactly like Svix (which delivers Act-On's webhooks). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'Content-Type': opts.contentType ?? 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

async function post(rawBody: string, headers: Record<string, string>) {
  const res = await POST(
    new Request('http://localhost:3000/webhooks/act-on', { method: 'POST', headers, body: rawBody })
  );
  return { status: res.status, body: await res.json() };
}

// Payloads follow the examples in Act-On's "Outgoing Webhook Event Types" page.
const contactAdded = {
  contact: { 'E-mail Address': 'johndoe@example.com', 'First Name': 'John', Company: 'Act-On' },
  contactReportLink: 'https://example.actonsoftware.com/acton/ng-ui/contact?email=johndoe@example.com',
  email: 'johndoe@example.com',
  timestamp: 1689343863,
};
const hardBounce = {
  bounceDiagnostic: 'User upload',
  categoryReason: 'User',
  email: 'contact@test.com',
  isHardBounce: true,
  msgId: 's-002e-2303',
  timestamp: 1689559644,
};
const softBounce = { email: 'contact@test.com', isHardBounce: true };
const spam = { email: 'contact@test.com', msgId: 's-002e-2303', recId: 'l-0001:14', srcId: 'l-0001', timestamp: 1689343863 };
const optOut = { email: 'contact@test.com', hasOptedOut: true, timestamp: 1689559644 };
const optIn = { email: 'contact@test.com', hasOptedOut: false, timestamp: 1689559644 };
const formSubmitted = {
  contact: { email: 'johndoe@example.com', firstName: 'John', lastName: 'Doe' },
  cookieId: '0076d7',
  formId: 'e23a97da-3346-4c32-9bc9-15ab0dc9ca8a',
  formName: 'Form name',
  referrer: 'referrer example',
  submissionTime: 1234567890,
};
const programStarted = { name: 'Program Name Example', entryType: 'Manual', startedTime: 1686597624671, waitingCount: 0 };
const programStopped = { name: 'Program Name Example', entryType: 'Manual', stoppedTime: 1686597624671, waitingCount: 0 };
const categoryOptIn = {
  categoryChecked: true,
  categoryDescription: 'News about our best offers',
  categoryId: '1',
  categoryName: 'Discounts',
  email: 'contact@test.com',
  timestamp: 1689343863,
};
const categoryOptOut = { ...categoryOptIn, categoryChecked: false };
const categoryChanged = { checked: true, description: 'News about our best offers', id: '1', name: 'Discounts', timestamp: 1689343863 };
const crmConnected = { crmDisplayName: 'Salesforce', detail: 'Successful connection', timestamp: 1689343863 };
const leadScore = {
  contactReportLink: 'https://example.actonsoftware.com/acton/ng-ui/contact?recid=l-unified-contacts:1b',
  email: 'johndoe@example.com',
  fields: { firstName: 'John' },
  leadScore: 150,
  scoresheetId: 'ss-default',
};
const emailScheduled = { accountId: '4', messageId: 's-002e-2303', scheduledTimestamp: '1694004008962', subject: 'subject', title: 'Title', numTargetedRecipients: '2' };

describe('Act-On webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ACT_ON_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ACT_ON_WEBHOOK_SECRET;
  });

  it.each([
    ['contact added or updated', contactAdded, 'Contact added or updated: johndoe@example.com'],
    ['hard bounce', hardBounce, 'Hard bounce: contact@test.com'],
    ['soft bounce', softBounce, 'Soft bounce: contact@test.com'],
    ['spam complaint', spam, 'Spam complaint: contact@test.com'],
    ['global opt-out', optOut, 'Global opt-out: contact@test.com'],
    ['global opt-in', optIn, 'Global opt-in: contact@test.com'],
    ['form submitted', formSubmitted, 'Form submitted: Form name'],
    ['program started', programStarted, 'Automated Program started: Program Name Example'],
    ['program stopped', programStopped, 'Automated Program stopped: Program Name Example'],
    ['category opt-in', categoryOptIn, 'subscription-category.opt-in: contact@test.com'],
    ['category opt-out', categoryOptOut, 'subscription-category.opt-out: contact@test.com'],
    ['category changed', categoryChanged, 'Subscription category changed: Discounts'],
    ['crm connection', crmConnected, 'CRM connection event: Salesforce'],
    ['lead score', leadScore, 'Lead score 150 passed the threshold'],
    ['email scheduled', emailScheduled, 'Email scheduled: "Title"'],
  ])('accepts a validly signed %s payload', async (_name, payload, logged) => {
    const raw = JSON.stringify(payload);
    const res = await post(raw, signedHeaders(raw));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(logged));
  });

  it('logs an unrecognised shape without failing', async () => {
    const raw = JSON.stringify({ something: 'else' });
    const res = await post(raw, signedHeaders(raw));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unrecognised Act-On payload shape:', ['something']);
  });

  it('accepts any content type because the raw bytes are verified', async () => {
    const raw = JSON.stringify(contactAdded);
    const res = await post(raw, signedHeaders(raw, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts a secret pasted without the whsec_ prefix', async () => {
    const bare = SECRET.replace(/^whsec_/, '');
    process.env.ACT_ON_WEBHOOK_SECRET = bare;
    const raw = JSON.stringify(optOut);
    const res = await post(raw, signedHeaders(raw, { secret: bare }));
    expect(res.status).toBe(200);
  });

  it('accepts when one of several signatures is valid', async () => {
    const raw = JSON.stringify(contactAdded);
    const id = 'msg_multi';
    const ts = String(now());
    const signature = `v1,${Buffer.from('not-a-real-signature').toString('base64')} ${sign(raw, id, ts)}`;
    const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
    expect(res.status).toBe(200);
  });

  it('accepts a delivery signed with webhook-* headers instead of svix-*', async () => {
    const raw = JSON.stringify(contactAdded);
    const headers = Object.fromEntries(
      Object.entries(signedHeaders(raw)).map(([name, value]) => [name.replace(/^svix-/, 'webhook-'), value])
    );
    const res = await post(raw, headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('acknowledges a redelivery without handling it twice', async () => {
    const raw = JSON.stringify(spam);
    const headers = signedHeaders(raw);
    const first = await post(raw, headers);
    const second = await post(raw, headers);
    expect(first.body).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('rejects a tampered body', async () => {
    const raw = JSON.stringify(contactAdded);
    const headers = signedHeaders(raw);
    const res = await post(raw.replace('John', 'Jane'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const raw = JSON.stringify(contactAdded);
    const res = await post(raw, signedHeaders(raw, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than five minutes', async () => {
    const raw = JSON.stringify(contactAdded);
    const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp more than five minutes in the future', async () => {
    const raw = JSON.stringify(contactAdded);
    const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
    expect(res.status).toBe(400);
  });

  it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a request missing %s', async (name) => {
    const raw = JSON.stringify(contactAdded);
    const headers = signedHeaders(raw);
    delete headers[name];
    const res = await post(raw, headers);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing/);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    delete process.env.ACT_ON_WEBHOOK_SECRET;
    const raw = JSON.stringify(contactAdded);
    const res = await post(raw, signedHeaders(raw));
    expect(res.status).toBe(500);
  });
});
