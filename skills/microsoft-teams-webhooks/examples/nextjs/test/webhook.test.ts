// Generated with: microsoft-teams-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/microsoft-teams/route';
import { commandText, verifyTeamsRequest } from '../lib/verify-teams';

// Made-up security token, base64 like the one Teams shows.
const TOKEN = 'zN0uIOo7AK9myNAQMhZ8PZNO2UZb9PXmx0V7r26UcOc=';

/** Sign like Teams: HMAC-SHA256 of the raw body, keyed with the decoded token. */
const sign = (rawBody: string, token = TOKEN) =>
  `HMAC ${crypto.createHmac('sha256', Buffer.from(token, 'base64')).update(rawBody, 'utf8').digest('base64')}`;

const activity = (text = '<at>Helper</at> status') =>
  JSON.stringify(
    {
      type: 'message',
      id: '1731924900123',
      channelId: 'msteams',
      from: { id: '29:1Xh-test', name: 'Megan Bowen' },
      conversation: { isGroup: true, conversationType: 'channel', id: '19:test@thread.tacv2' },
      text,
    },
    null,
    2
  );

const post = (rawBody: string, authorization?: string) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authorization !== undefined) headers.authorization = authorization;
  return POST(new Request('http://localhost/webhooks/microsoft-teams', { method: 'POST', headers, body: rawBody }));
};

beforeEach(() => {
  process.env.MICROSOFT_TEAMS_SECURITY_TOKEN = TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('verifyTeamsRequest', () => {
  it('matches the documented test vector', () => {
    const body = '{"type":"message","id":"1731924900123","text":"<at>Helper</at> status","from":{"name":"Megan Bowen"}}';
    expect(verifyTeamsRequest(body, 'HMAC cOMdJKZIsWtg30Ac0WEteH+Xq4T2PR1Id7/qsO430kg=', TOKEN)).toBe(true);
  });

  it('rejects a token that is not base64', () => {
    const body = activity();
    expect(verifyTeamsRequest(body, sign(body), 'not base64!')).toBe(false);
  });
});

describe('commandText', () => {
  it('strips the mention and HTML', () => {
    expect(commandText('<at>Helper</at> status')).toBe('status');
    expect(commandText('<div><at>Helper</at>&nbsp;help</div>')).toBe('help');
  });
});

describe('POST /webhooks/microsoft-teams', () => {
  it('replies with a Teams message JSON for a valid HMAC', async () => {
    const body = activity();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ type: 'message', text: 'Hi Megan Bowen, all systems are operational.' });
  });

  it('handles help and unknown commands', async () => {
    const help = activity('<at>Helper</at> help');
    expect(await (await post(help, sign(help))).json()).toEqual({ type: 'message', text: 'Commands: status, help' });
    const other = activity('<at>Helper</at> deploy');
    expect(await (await post(other, sign(other))).json()).toEqual({ type: 'message', text: 'Unknown command. Try "help".' });
  });

  it('accepts a lower-case scheme and a token with a trailing newline', async () => {
    const body = activity();
    expect((await post(body, sign(body).replace('HMAC', 'hmac'))).status).toBe(200);
    process.env.MICROSOFT_TEAMS_SECURITY_TOKEN = `${TOKEN}\n`;
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects a missing header, another scheme and the undecoded token as key', async () => {
    const body = activity();
    expect((await post(body)).status).toBe(401);
    expect((await post(body, sign(body).replace('HMAC', 'Bearer'))).status).toBe(401);
    const wrong = `HMAC ${crypto.createHmac('sha256', TOKEN).update(body).digest('base64')}`;
    expect((await post(body, wrong)).status).toBe(401);
  });

  it('rejects tampered and re-serialised bodies', async () => {
    const body = activity();
    expect((await post(body.replace('status', 'deploy'), sign(body))).status).toBe(401);
    expect((await post(JSON.stringify(JSON.parse(body)), sign(body))).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid HMAC', async () => {
    const body = '{"type": "message",';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MICROSOFT_TEAMS_SECURITY_TOKEN is not set', async () => {
    delete process.env.MICROSOFT_TEAMS_SECURITY_TOKEN;
    const body = activity();
    expect((await post(body, sign(body))).status).toBe(500);
  });
});
