import crypto from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { stytchEventType } from '../lib/stytch';

// Svix-style secret: 'whsec_' + base64 of the key bytes (here "test_secret_key_12345")
const SECRET = 'whsec_' + Buffer.from('test_secret_key_12345').toString('base64');

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.STYTCH_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/stytch/route'));
});

function sign(body: string, opts: { id?: string; timestamp?: number; secret?: string } = {}) {
  const { id = 'msg_test123', timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = opts;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${sig}` };
}

function post(body: string, headers: Record<string, string>) {
  return POST(new Request('http://localhost/webhooks/stytch', { method: 'POST', body, headers }));
}

const memberUpdate = JSON.stringify({
  project_id: 'project-test-123',
  event_id: 'event-test-456',
  action: 'UPDATE',
  object_type: 'member',
  source: 'DIRECT',
  id: 'member-test-123',
  timestamp: '2024-03-07T18:49:32.760777783Z',
  member: { member_id: 'member-test-123' },
});

describe('Stytch webhook', () => {
  it('accepts a valid signature and derives the event type', async () => {
    const res = await post(memberUpdate, sign(memberUpdate));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'direct.member.update' });
  });

  it('accepts a valid signature among several in the header', async () => {
    const headers = sign(memberUpdate);
    headers['svix-signature'] = `v1,AAAA ${headers['svix-signature']} v2,BBBB`;
    expect((await post(memberUpdate, headers)).status).toBe(200);
  });

  it('handles a DELETE event with no entity object', async () => {
    const body = JSON.stringify({
      action: 'DELETE', object_type: 'saml_connection', source: 'DIRECT', id: 'saml-connection-test-1',
    });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('direct.saml_connection.delete');
  });

  it('rejects a signature made with the wrong secret', async () => {
    const other = 'whsec_' + Buffer.from('another_secret').toString('base64');
    const res = await post(memberUpdate, sign(memberUpdate, { secret: other }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('rejects a tampered body', async () => {
    const res = await post(memberUpdate.replace('UPDATE', 'DELETE'), sign(memberUpdate));
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await post(memberUpdate, sign(memberUpdate, { timestamp: old }));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when STYTCH_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.STYTCH_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const res = await post(memberUpdate, sign(memberUpdate, { timestamp: old }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Timestamp too old');
    } finally {
      delete process.env.STYTCH_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric STYTCH_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.STYTCH_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const res = await post(memberUpdate, sign(memberUpdate, { timestamp: old }));
      expect(res.status).toBe(200);
    } finally {
      delete process.env.STYTCH_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects missing headers', async () => {
    expect((await post(memberUpdate, {})).status).toBe(400);
  });

  it('rejects invalid JSON that is correctly signed', async () => {
    const res = await post('not json', sign('not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });
});

describe('stytchEventType', () => {
  it('lowercases source.object_type.action', () => {
    expect(stytchEventType({ source: 'SCIM', object_type: 'member', action: 'UPDATE' })).toBe('scim.member.update');
  });
  it('returns null when parts are missing', () => {
    expect(stytchEventType({ id: 'x' })).toBeNull();
  });
});
