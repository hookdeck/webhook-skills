import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/360dialog/route';
import { extractEvents, parseBasicAuth, verify360dialogRequest } from '../lib/verify-360dialog';

const USERNAME = 'testuser';
const PASSWORD = 'te:st+pass/ü'; // contains ':' and non-ASCII on purpose

beforeAll(() => {
  process.env.THREE_SIXTY_DIALOG_WEBHOOK_USERNAME = USERNAME;
  process.env.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env.THREE_SIXTY_DIALOG_WEBHOOK_USERNAME = USERNAME;
  process.env.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD = PASSWORD;
});

const basic = (user: string, pass: string) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const GOOD = basic(USERNAME, PASSWORD);

const metadata = { display_phone_number: '15550783881', phone_number_id: '106540352242922' };
const wrap = (field: string, value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '102290129340398', changes: [{ value: { messaging_product: 'whatsapp', metadata, ...value }, field }] }],
});

// Shapes from 360dialog's Webhook Reference
const inbound = wrap('messages', {
  contacts: [{ profile: { name: 'Kerry' }, wa_id: '16315551234' }],
  messages: [{ from: '16315551234', id: 'wamid.ID', timestamp: '1504902988', text: { body: 'Hello' }, type: 'text' }],
});
const statusUpdate = wrap('messages', {
  statuses: [{ id: 'wamid.ID', status: 'delivered', timestamp: '1504902988', recipient_id: '16315551234' }],
});
const echoes = wrap('smb_message_echoes', {
  message_echoes: [{ from: '15550783881', to: '16315551234', id: 'wamid.ECHO', timestamp: '1504902988', type: 'text', text: { body: 'Hi' } }],
});
const stateSync = {
  id: 'DM3',
  event: 'smb_app_state_sync',
  data: { id: 'WABA_ID', messaging_product: 'whatsapp', metadata, state_sync: [{ type: 'contact', action: 'add' }] },
};

function makeRequest(
  body: unknown = inbound,
  headers: Record<string, string> = {},
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/360dialog', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('360dialog webhook authentication', () => {
  it('accepts correct Basic credentials', async () => {
    const res = await POST(makeRequest(inbound, { Authorization: GOOD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a lowercase scheme', async () => {
    const res = await POST(makeRequest(inbound, { Authorization: GOOD.replace('Basic', 'basic') }));
    expect(res.status).toBe(200);
  });

  it('parses the docs example header (testuser:testpass)', () => {
    const creds = parseBasicAuth('Basic dGVzdHVzZXI6dGVzdHBhc3M=');
    expect(creds?.username.toString()).toBe('testuser');
    expect(creds?.password.toString()).toBe('testpass');
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    expect((await POST(makeRequest(inbound, { Authorization: basic('nope', PASSWORD) }))).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await POST(makeRequest(inbound, { Authorization: basic(USERNAME, 'wrong') }))).status).toBe(401);
  });

  it('rejects malformed headers', async () => {
    for (const value of [
      'Basic',
      'Basic !!!not-base64!!!',
      'Basic ' + Buffer.from('nocolon').toString('base64'),
      'Bearer ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64'),
    ]) {
      expect((await POST(makeRequest(inbound, { Authorization: value }))).status).toBe(401);
    }
  });

  it('authenticates before parsing the body', async () => {
    const res = await POST(makeRequest('{not json', { Authorization: basic(USERNAME, 'wrong') }));
    expect(res.status).toBe(401);
  });

  it('returns 500 when credentials are not configured', async () => {
    delete process.env.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(makeRequest(inbound, { Authorization: GOOD }))).status).toBe(500);
    expect(verify360dialogRequest(new Headers({ Authorization: GOOD }))).toBe(false);
  });
});

describe('360dialog webhook handling', () => {
  const auth = { Authorization: GOOD };

  it('accepts any content type', async () => {
    expect((await POST(makeRequest(inbound, auth, 'text/plain'))).status).toBe(200);
    expect((await POST(makeRequest(inbound, auth, 'application/vnd.api+json'))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    expect((await POST(makeRequest('{not json', auth))).status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    expect((await POST(makeRequest('[1,2]', auth))).status).toBe(400);
    expect((await POST(makeRequest('"text"', auth))).status).toBe(400);
  });

  it('dispatches messages, statuses, echoes and envelope events', () => {
    expect(extractEvents(inbound).map((e) => e.kind)).toEqual(['message']);
    expect(extractEvents(statusUpdate).map((e) => e.kind)).toEqual(['status']);
    expect(extractEvents(statusUpdate)[0].status?.status).toBe('delivered');
    expect(extractEvents(echoes).map((e) => e.kind)).toEqual(['smb_message_echoes']);
    expect(extractEvents(wrap('history', { history: [] })).map((e) => e.kind)).toEqual(['history']);
    expect(extractEvents(stateSync).map((e) => e.kind)).toEqual(['smb_app_state_sync']);
    expect(extractEvents({ hello: 'world' })).toEqual([]);
  });

  it('handles every documented event shape with 200', async () => {
    for (const body of [inbound, statusUpdate, echoes, stateSync, { hello: 'world' }]) {
      expect((await POST(makeRequest(body, auth))).status).toBe(200);
    }
  });
});
