import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createHandler, type HandlerOptions } from '../lib/handler';
import { CertFetchError, canonicalString, isValidSubscribeUrl } from '../lib/scaleway-sns';
import { createPki, signEnvelope } from './pki';

const pki = createPki();
const CERT_HOST = 'messaging.s3.fr-par.scw.cloud';
const CERT_URL = `https://${CERT_HOST}/fr-par/sns/sns_certificate_01.crt`;
const TOPIC_ARN = 'arn:scw:sns:fr-par:project-1234:orders';
const TOKEN = 'subscription-token+/=';
const SUBSCRIBE_URL = `https://sns.mnq.fr-par.scaleway.com/?${new URLSearchParams({
  Action: 'ConfirmSubscription',
  TopicArn: TOPIC_ARN,
  Token: TOKEN,
})}`;

// Certificates "published" at each URL; the app fetches through this map, never the network
const certs: Record<string, string> = {
  [CERT_URL]: pki.leaf,
  [`https://${CERT_HOST}/fr-par/sns/expired.crt`]: pki.expiredLeaf,
  [`https://${CERT_HOST}/fr-par/sns/rogue.crt`]: pki.rogueLeaf,
  [`https://${CERT_HOST}/fr-par/sns/self-signed.crt`]: pki.selfSignedLeaf,
  [`https://${CERT_HOST}/fr-par/sns/child.crt`]: pki.leafIssuedByLeaf,
  [`https://${CERT_HOST}/fr-par/sns/garbage.crt`]: 'not a certificate',
};

let fetchCert: ReturnType<typeof vi.fn>;
let confirmSubscription: ReturnType<typeof vi.fn>;
let logSpy: ReturnType<typeof vi.spyOn>;

type Handler = (request: Request) => Promise<Response>;
function makeApp(overrides: HandlerOptions = {}): Handler {
  return createHandler({
    trustChainPem: pki.trustChainPem,
    fetchCert: fetchCert as unknown as (url: string) => Promise<string>,
    confirmSubscription: confirmSubscription as unknown as (url: string) => Promise<boolean>,
    ...overrides,
  });
}

beforeEach(() => {
  fetchCert = vi.fn(async (url: string) => {
    if (!(url in certs)) throw new Error(`unexpected fetch ${url}`);
    return certs[url];
  });
  confirmSubscription = vi.fn(async () => true);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Msg = Record<string, unknown>;
const notification = (overrides: Msg = {}): Msg => ({
  Type: 'Notification',
  MessageId: 'b3b0c1e2-0000-4000-8000-000000000001',
  TopicArn: TOPIC_ARN,
  Subject: 'order.created',
  Message: JSON.stringify({ order_id: 'ord_123', total: 4200 }),
  Timestamp: new Date().toISOString(),
  SignatureVersion: '1',
  SigningCertURL: CERT_URL,
  UnsubscribeURL: `https://sns.mnq.fr-par.scaleway.com/?Action=Unsubscribe&SubscriptionArn=${TOPIC_ARN}:sub`,
  ...overrides,
});

// Shape of Scaleway's documented SubscriptionConfirmation
const confirmation = (overrides: Msg = {}): Msg => ({
  Type: 'SubscriptionConfirmation',
  Token: TOKEN,
  MessageId: 'b3b0c1e2-0000-4000-8000-000000000002',
  TopicArn: TOPIC_ARN,
  Message: `You have chosen to subscribe to the topic ${TOPIC_ARN}.\nTo confirm the subscription, visit the SubscribeURL included in this message.`,
  Timestamp: new Date().toISOString(),
  SignatureVersion: '1',
  SigningCertURL: CERT_URL,
  SubscribeURL: SUBSCRIBE_URL,
  ...overrides,
});

const signed = (msg: Msg, key = pki.leafKey) => signEnvelope(msg, key);

async function post(handle: Handler, body: unknown, messageType?: string) {
  const headers: Record<string, string> = { 'content-type': 'text/plain; charset=UTF-8' };
  if (messageType) headers['x-amz-sns-message-type'] = messageType;
  const res = await handle(
    new Request('http://localhost:3000/webhooks/scaleway-topics-and-events', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
}

describe('canonicalString', () => {
  it('signs Notification fields in byte order and skips an absent Subject', () => {
    const msg = notification({ Subject: undefined, Message: 'hi', MessageId: 'm', Timestamp: 't', TopicArn: 'a' });
    expect(canonicalString(msg)).toBe('Message\nhi\nMessageId\nm\nTimestamp\nt\nTopicArn\na\nType\nNotification\n');
  });

  it('includes SubscribeURL and Token for confirmations', () => {
    const s = canonicalString(confirmation());
    expect(s).toContain(`SubscribeURL\n${SUBSCRIBE_URL}\n`);
    expect(s).toContain(`Token\n${TOKEN}\n`);
  });

  it('returns null for unknown types and non-string fields', () => {
    expect(canonicalString({ Type: 'Other' })).toBeNull();
    expect(canonicalString(notification({ Message: { a: 1 } }))).toBeNull();
    expect(canonicalString(notification({ MessageId: undefined }))).toBeNull();
  });
});

describe('isValidSubscribeUrl', () => {
  it('accepts the documented form for fr-par and nl-ams', () => {
    expect(isValidSubscribeUrl(confirmation())).toBe(true);
    const arn = 'arn:scw:sns:nl-ams:project-1234:orders';
    const url = `https://sns.mnq.nl-ams.scaleway.com/?${new URLSearchParams({ Action: 'ConfirmSubscription', TopicArn: arn, Token: TOKEN })}`;
    expect(isValidSubscribeUrl(confirmation({ TopicArn: arn, SubscribeURL: url }))).toBe(true);
  });

  it.each([
    ['another host', (u) => (u.hostname = 'example.com')],
    ['a host suffix', (u) => (u.hostname += '.example.com')],
    ['another region', (u) => (u.hostname = 'sns.mnq.nl-ams.scaleway.com')],
    ['http', (u) => (u.protocol = 'http:')],
    ['credentials', (u) => (u.username = 'user')],
    ['a port', (u) => (u.port = '8443')],
    ['another path', (u) => (u.pathname = '/other')],
    ['a fragment', (u) => (u.hash = 'x')],
    ['another action', (u) => u.searchParams.set('Action', 'Unsubscribe')],
    ['another topic', (u) => u.searchParams.set('TopicArn', 'arn:scw:sns:fr-par:p:other')],
    ['a duplicate token', (u) => u.searchParams.append('Token', 'other')],
    ['no token', (u) => u.searchParams.delete('Token')],
  ] as [string, (u: URL) => unknown][])('rejects %s', (_name, mutate) => {
    const u = new URL(SUBSCRIBE_URL);
    mutate(u);
    expect(isValidSubscribeUrl(confirmation({ SubscribeURL: u.toString() }))).toBe(false);
  });

  it('rejects an AWS or unsupported-region TopicArn', () => {
    expect(isValidSubscribeUrl(confirmation({ TopicArn: 'arn:aws:sns:fr-par:p:t' }))).toBe(false);
    expect(isValidSubscribeUrl(confirmation({ TopicArn: 'arn:scw:sns:pl-waw:p:t' }))).toBe(false);
  });
});

describe('POST /webhooks/scaleway-topics-and-events', () => {
  it('accepts a signed Notification', async () => {
    const res = await post(makeApp(), signed(notification()), 'Notification');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('(subject: order.created): JSON object'));
  });

  it('accepts a Notification without Subject and with a plain-text Message', async () => {
    const res = await post(makeApp(), signed(notification({ Subject: undefined, Message: 'hello' })));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(': string'));
  });

  it('accepts a Message with non-ASCII text', async () => {
    const res = await post(makeApp(), signed(notification({ Message: 'Commande validée ✓' })));
    expect(res.status).toBe(200);
  });

  it('caches the signing certificate by URL', async () => {
    const app = makeApp();
    await post(app, signed(notification()));
    await post(app, signed(notification({ MessageId: 'another' })));
    expect(fetchCert).toHaveBeenCalledTimes(1);
  });

  it('confirms a signed SubscriptionConfirmation by GETting SubscribeURL', async () => {
    const res = await post(makeApp(), signed(confirmation()), 'SubscriptionConfirmation');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ confirmed: true });
    expect(confirmSubscription).toHaveBeenCalledWith(SUBSCRIBE_URL);
  });

  it('returns 502 when Scaleway does not answer the confirmation with 200', async () => {
    confirmSubscription = vi.fn(async () => false);
    const res = await post(makeApp(), signed(confirmation()));
    expect(res.status).toBe(502);
  });

  it('returns 502 when the confirmation request throws', async () => {
    confirmSubscription = vi.fn(async () => {
      throw new Error('timeout');
    });
    const res = await post(makeApp(), signed(confirmation()));
    expect(res.status).toBe(502);
  });

  it('does not confirm a signed confirmation whose SubscribeURL points elsewhere', async () => {
    const msg = signed(confirmation({ SubscribeURL: 'https://example.com/?Action=ConfirmSubscription' }));
    const res = await post(makeApp(), msg);
    expect(res.status).toBe(400);
    expect(confirmSubscription).not.toHaveBeenCalled();
  });

  it('acknowledges a signed UnsubscribeConfirmation', async () => {
    const res = await post(makeApp(), signed(confirmation({ Type: 'UnsubscribeConfirmation' })));
    expect(res.status).toBe(200);
  });

  it('routes on the signed Type, not the header', async () => {
    const res = await post(makeApp(), signed(notification()), 'SubscriptionConfirmation');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(confirmSubscription).not.toHaveBeenCalled();
  });

  describe('rejects with 401', () => {
    it.each([
      ['a tampered Message', () => ({ ...signed(notification()), Message: '{"order_id":"ord_999"}' })],
      ['a tampered Subject', () => ({ ...signed(notification()), Subject: 'order.refunded' })],
      ['a removed Subject', () => ({ ...signed(notification()), Subject: undefined })],
      ['a tampered Type', () => ({ ...signed(notification()), Type: 'UnsubscribeConfirmation' })],
      ['a tampered SubscribeURL', () => ({ ...signed(confirmation()), SubscribeURL: SUBSCRIBE_URL + '&x=1' })],
      ['a tampered Token', () => ({ ...signed(confirmation()), Token: 'other' })],
      ['a signature from another key', () => signed(notification(), pki.rogueKey)],
      ['a missing Signature', () => ({ ...notification() })],
      ['a non-base64 Signature', () => ({ ...signed(notification()), Signature: '!!!' })],
      ['SignatureVersion 2', () => signed(notification({ SignatureVersion: '2' }))],
      ['a numeric SignatureVersion', () => signed(notification({ SignatureVersion: 1 }))],
      ['an http SigningCertURL', () => signed(notification({ SigningCertURL: CERT_URL.replace('https', 'http') }))],
      ['a SigningCertURL on another host', () => signed(notification({ SigningCertURL: 'https://evil.example/cert.crt' }))],
      ['a SigningCertURL with a host suffix', () => signed(notification({ SigningCertURL: `https://${CERT_HOST}.evil.example/c.crt` }))],
      ['a SigningCertURL with credentials', () => signed(notification({ SigningCertURL: `https://u:p@${CERT_HOST}/c.crt` }))],
      ['a certificate from another CA', () => signed(notification({ SigningCertURL: `https://${CERT_HOST}/fr-par/sns/rogue.crt` }), pki.rogueKey)],
      ['a self-signed certificate', () => signed(notification({ SigningCertURL: `https://${CERT_HOST}/fr-par/sns/self-signed.crt` }))],
      ['a certificate issued by a non-CA', () => signed(notification({ SigningCertURL: `https://${CERT_HOST}/fr-par/sns/child.crt` }), pki.rogueKey)],
      ['an expired certificate', () => signed(notification({ SigningCertURL: `https://${CERT_HOST}/fr-par/sns/expired.crt` }))],
      ['an unparseable certificate', () => signed(notification({ SigningCertURL: `https://${CERT_HOST}/fr-par/sns/garbage.crt` }))],
      ['a non-string Message', () => ({ ...signed(notification()), Message: { a: 1 } })],
      ['an unknown Type', () => ({ ...notification(), Type: 'Other', Signature: 'AAAA' })],
    ] as [string, () => unknown][])('%s', async (_name, build) => {
      const res = await post(makeApp(), build());
      expect(res.status).toBe(401);
    });
  });

  it('returns 401 for an unsigned confirmation and never confirms it', async () => {
    const res = await post(makeApp(), confirmation(), 'SubscriptionConfirmation');
    expect(res.status).toBe(401);
    expect(confirmSubscription).not.toHaveBeenCalled();
  });

  it('returns 503 when the signing certificate cannot be fetched', async () => {
    fetchCert = vi.fn(async () => {
      throw new CertFetchError('network down');
    });
    const res = await post(makeApp(), signed(notification()));
    expect(res.status).toBe(503);
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"Notification"'],
    ['an empty body', ''],
  ])('returns 400 for %s', async (_name, body) => {
    const res = await post(makeApp(), body);
    expect(res.status).toBe(400);
  });

  it('returns 403 for a validly signed message from a topic that is not allowed', async () => {
    const app = makeApp({ topicArns: ['arn:scw:sns:fr-par:project-1234:other'] });
    const res = await post(app, signed(notification()));
    expect(res.status).toBe(403);
  });

  it('does not confirm a subscription to a topic that is not allowed', async () => {
    const app = makeApp({ topicArns: ['arn:scw:sns:fr-par:project-1234:other'] });
    const res = await post(app, signed(confirmation()));
    expect(res.status).toBe(403);
    expect(confirmSubscription).not.toHaveBeenCalled();
  });

  it('accepts an allowed topic', async () => {
    const res = await post(makeApp({ topicArns: [TOPIC_ARN] }), signed(notification()));
    expect(res.status).toBe(200);
  });

  it('applies no timestamp window by default', async () => {
    const res = await post(makeApp(), signed(notification({ Timestamp: '2022-06-29T10:03:34Z' })));
    expect(res.status).toBe(200);
  });

  it('rejects old messages when SCALEWAY_SNS_MAX_AGE_SECONDS is set', async () => {
    const app = makeApp({ maxAgeSeconds: 300 });
    const old = new Date(Date.now() - 3600 * 1000).toISOString();
    expect((await post(app, signed(notification({ Timestamp: old })))).status).toBe(401);
    expect((await post(app, signed(notification()))).status).toBe(200);
  });

  it('refuses to start without a trust chain', () => {
    const saved = process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH;
    delete process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH;
    expect(() => createHandler({})).toThrow(/SCALEWAY_SNS_TRUST_CHAIN_PATH/);
    if (saved !== undefined) process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH = saved;
  });

  it('serves the route from environment variables', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scw-sns-'));
    const chainPath = path.join(dir, 'sns-trust-chain.pem');
    fs.writeFileSync(chainPath, pki.trustChainPem);
    process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH = chainPath;
    process.env.SCALEWAY_SNS_TOPIC_ARNS = TOPIC_ARN;
    // The default fetcher uses global fetch; serve the certificate from the test PKI
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url !== CERT_URL) throw new Error(`unexpected fetch ${url}`);
      return new Response(pki.leaf, { status: 200 });
    }));
    try {
      const { POST } = await import('../app/webhooks/scaleway-topics-and-events/route');
      const ok = await post(POST, signed(notification()));
      expect(ok.status).toBe(200);
      const tampered = await post(POST, { ...signed(notification()), Message: 'changed' });
      expect(tampered.status).toBe(401);
    } finally {
      delete process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH;
      delete process.env.SCALEWAY_SNS_TOPIC_ARNS;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
