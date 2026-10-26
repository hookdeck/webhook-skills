import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/tokity/route';
import { verifyTokitySignature } from '../lib/verify-tokity';

const SECRET = 'kfA18wgZKW30F7dL1JtlHq2judcJ0uoB'; // sample secret from Tokity's docs
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

beforeAll(() => {
  process.env.TOKITY_WEBHOOK_SECRET = SECRET;
});

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.TOKITY_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const logged = () => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');

function toBuf(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
}

function sign(body: Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/tokity', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: new Uint8Array(toBuf(body)),
    })
  );
}

function signed(body: unknown, extra: Record<string, string> = {}) {
  const buf = toBuf(body);
  return post(buf, { 'x-dd-signature': `sha256=${sign(buf)}`, ...extra });
}

// Shapes follow Tokity's docs: chat webhooks send an array of chat sessions; ticket webhooks
// send the ticket plus `from` (its previous state, null on creation).
const chat = [
  {
    msp: 'dd',
    id: '1586985009-627B',
    name: 'Test',
    type: 'request',
    status: 'handled',
    pastStatus: ['created', 'handled'],
    reference: { type: 'ticket', id: '22282' },
    creator: { entityId: 106, name: 'Jason He', userId: 'dd~c~106' },
    users: [],
    lastModifiedDateTime: '2020-04-15T21:12:00.9897216Z',
  },
];
const ticketCreated = [{ id: 22282, summary: 'Printer is on fire', status: 'New', from: null }];
const ticketChanged = [
  { id: 22282, summary: 'Printer is on fire', status: 'In Progress', from: { id: 22282, summary: 'Printer is on fire', status: 'New' } },
];
const ticketFromEvent = { id: 22282, summary: 'Printer is on fire', status: 'New' };

describe('known signature vector (computed with openssl)', () => {
  const body = Buffer.from('[{"id":"1586985009-627B","status":"handled"}]');
  const expected = 'oI30D2fE86nU2FUlgB5zxk3c7br+M2pfstL9KmGEd68=';

  it('matches the HMAC-SHA256 base64 of the raw body', () => {
    expect(sign(body)).toBe(expected);
    expect(verifyTokitySignature(body, `sha256=${expected}`, SECRET)).toBe(true);
  });

  it('accepts the bare digest without the sha256= prefix', () => {
    expect(verifyTokitySignature(body, expected, SECRET)).toBe(true);
  });
});

describe('verifyTokitySignature', () => {
  const body = Buffer.from('{"id":1}');
  const good = sign(body);

  it('rejects a missing or empty header', () => {
    expect(verifyTokitySignature(body, null, SECRET)).toBe(false);
    expect(verifyTokitySignature(body, undefined, SECRET)).toBe(false);
    expect(verifyTokitySignature(body, '', SECRET)).toBe(false);
    expect(verifyTokitySignature(body, 'sha256=', SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyTokitySignature(body, `sha256=${good}`, '')).toBe(false);
    delete process.env.TOKITY_WEBHOOK_SECRET;
    expect(verifyTokitySignature(body, `sha256=${good}`)).toBe(false);
  });

  it('rejects the wrong secret and a tampered body', () => {
    expect(verifyTokitySignature(body, `sha256=${good}`, 'another-secret')).toBe(false);
    expect(verifyTokitySignature(Buffer.from('{"id":2}'), `sha256=${good}`, SECRET)).toBe(false);
  });

  it('rejects other prefixes, a different case prefix and hex digests', () => {
    expect(verifyTokitySignature(body, `sha1=${good}`, SECRET)).toBe(false);
    expect(verifyTokitySignature(body, `SHA256=${good}`, SECRET)).toBe(false);
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyTokitySignature(body, `sha256=${hex}`, SECRET)).toBe(false);
  });

  it('rejects wrong lengths and characters outside the standard base64 alphabet', () => {
    expect(verifyTokitySignature(body, `sha256=${good.slice(0, -1)}`, SECRET)).toBe(false);
    expect(verifyTokitySignature(body, `sha256=${good}A`, SECRET)).toBe(false);
    // URL-safe base64 is not what Tokity sends. This known digest contains "+".
    const known = Buffer.from('[{"id":"1586985009-627B","status":"handled"}]');
    const urlSafe = 'oI30D2fE86nU2FUlgB5zxk3c7br-M2pfstL9KmGEd68=';
    expect(verifyTokitySignature(known, `sha256=${urlSafe}`, SECRET)).toBe(false);
    expect(verifyTokitySignature(body, `sha256=${good.slice(0, 10)}!${good.slice(11)}`, SECRET)).toBe(false);
    expect(verifyTokitySignature(body, `sha256=${good} `, SECRET)).toBe(false);
  });

  it('rejects a non-canonical last character that decodes to the same bytes', () => {
    const variant = good.slice(0, 42) + B64[B64.indexOf(good[42]) ^ 1] + '=';
    expect(variant).not.toBe(good);
    // A decoder would treat both as equal; the exact string comparison does not.
    expect(Buffer.from(variant, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect(verifyTokitySignature(body, `sha256=${variant}`, SECRET)).toBe(false);
  });

  it('verifies the exact bytes: whitespace, unicode and invalid UTF-8 are not normalised', () => {
    const pretty = Buffer.from('[\n  { "id": 1, "name": "Zoë ☕" }\n]\n');
    expect(verifyTokitySignature(pretty, `sha256=${sign(pretty)}`, SECRET)).toBe(true);
    const compact = Buffer.from(JSON.stringify(JSON.parse(pretty.toString('utf8'))));
    expect(verifyTokitySignature(compact, `sha256=${sign(pretty)}`, SECRET)).toBe(false);
    const invalidUtf8 = Buffer.from([0x5b, 0xff, 0xfe, 0x5d]);
    expect(verifyTokitySignature(invalidUtf8, `sha256=${sign(invalidUtf8)}`, SECRET)).toBe(true);
  });

  it('uses the secret as UTF-8 text, not as decoded hex or base64', () => {
    const hexLooking = 'deadbeefdeadbeefdeadbeefdeadbeef';
    const sig = crypto.createHmac('sha256', Buffer.from(hexLooking, 'utf8')).update(body).digest('base64');
    expect(verifyTokitySignature(body, `sha256=${sig}`, hexLooking)).toBe(true);
    const decodedKeySig = crypto.createHmac('sha256', Buffer.from(hexLooking, 'hex')).update(body).digest('base64');
    expect(verifyTokitySignature(body, `sha256=${decodedKeySig}`, hexLooking)).toBe(false);
  });
});

describe('POST /webhooks/tokity', () => {
  describe('signature check', () => {
    it('returns 401 when the signature header is missing', async () => {
      expect((await post(chat)).status).toBe(401);
    });

    it('returns 401 for an empty header', async () => {
      expect((await post(chat, { 'x-dd-signature': '' })).status).toBe(401);
    });

    it('returns 401 for a wrong secret', async () => {
      const buf = toBuf(chat);
      const res = await post(buf, { 'x-dd-signature': `sha256=${sign(buf, 'wrong-secret')}` });
      expect(res.status).toBe(401);
    });

    it('returns 401 when the body was changed after signing', async () => {
      const sig = sign(toBuf(chat));
      expect((await post(ticketCreated, { 'x-dd-signature': `sha256=${sig}` })).status).toBe(401);
    });

    it('returns 401 for a malformed signature', async () => {
      expect((await post(chat, { 'x-dd-signature': 'sha256=not-base64' })).status).toBe(401);
    });

    it('returns 401 when no secret is configured', async () => {
      delete process.env.TOKITY_WEBHOOK_SECRET;
      expect((await signed(chat)).status).toBe(401);
    });

    it('accepts any Content-Type, since the raw bytes are what is signed', async () => {
      expect((await signed(chat, { 'content-type': 'text/plain' })).status).toBe(200);
    });

    it('accepts the bare digest without the sha256= prefix', async () => {
      const buf = toBuf(chat);
      expect((await post(buf, { 'x-dd-signature': sign(buf) })).status).toBe(200);
    });
  });

  describe('payloads', () => {
    it('handles a chat session array', async () => {
      const res = await signed(chat);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logged()).toContain('Chat session 1586985009-627B is handled (past: created, handled)');
      expect(logged()).toContain('about ticket 22282');
    });

    it('handles a created ticket (from is null)', async () => {
      expect((await signed(ticketCreated)).status).toBe(200);
      expect(logged()).toContain('Ticket 22282 created');
    });

    it('diffs from against the current ticket to find what changed', async () => {
      expect((await signed(ticketChanged)).status).toBe(200);
      expect(logged()).toContain('Ticket 22282 changed: status');
    });

    it('handles a single ticket object without from (Events action)', async () => {
      expect((await signed(ticketFromEvent)).status).toBe(200);
      expect(logged()).toContain('Ticket 22282 event');
    });

    it('accepts an empty array', async () => {
      expect((await signed([])).status).toBe(200);
    });
  });

  describe('untrusted body (valid signature)', () => {
    it('returns 400 for invalid JSON', async () => {
      expect((await signed('{not json')).status).toBe(400);
    });

    it('returns 400 for invalid UTF-8 and an empty body', async () => {
      expect((await signed(Buffer.from([0xff, 0xfe]))).status).toBe(400);
      expect((await signed(Buffer.alloc(0))).status).toBe(400);
    });

    it.each([
      ['a string', '"hello"'],
      ['a number', '42'],
      ['null', 'null'],
    ])('returns 400 when the body is %s', async (_name, body) => {
      expect((await signed(body)).status).toBe(400);
    });

    it('returns 400 when an array item is not an object', async () => {
      expect((await signed([chat[0], 'oops'])).status).toBe(400);
      expect((await signed([null])).status).toBe(400);
      expect((await signed([[1]])).status).toBe(400);
    });

    it('ignores wrong-typed fields instead of failing with 500', async () => {
      const weird = [
        { id: { a: 1 }, status: 5, pastStatus: 'created', reference: 'ticket', from: 'before' },
        { id: [1], status: 'handled', pastStatus: [1, null, 'created'], reference: { type: 'ticket', id: { x: 1 } } },
        { id: null, from: [1, 2] },
        { id: 7, from: { nested: { a: 1 } }, nested: 'string' },
      ];
      expect((await signed(weird)).status).toBe(200);
    });
  });
});
