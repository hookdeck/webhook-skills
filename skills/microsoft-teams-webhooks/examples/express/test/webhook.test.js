// Generated with: microsoft-teams-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Made-up security token (32 random-looking bytes, base64), shaped like the one Teams shows.
const TOKEN = 'zN0uIOo7AK9myNAQMhZ8PZNO2UZb9PXmx0V7r26UcOc=';
process.env.MICROSOFT_TEAMS_SECURITY_TOKEN = TOKEN;

const { app, verifyTeamsRequest, commandText } = require('../src/index');

/** Sign like Teams: HMAC-SHA256 of the raw body, keyed with the decoded token. */
const sign = (rawBody, token = TOKEN) =>
  `HMAC ${crypto.createHmac('sha256', Buffer.from(token, 'base64')).update(rawBody, 'utf8').digest('base64')}`;

// Illustrative Bot Framework message activity, pretty-printed so a re-serialised
// body would not match.
const activity = (text = '<at>Helper</at> status') =>
  JSON.stringify(
    {
      type: 'message',
      id: '1731924900123',
      timestamp: '2026-11-18T10:15:00.123Z',
      channelId: 'msteams',
      from: { id: '29:1Xh-test', name: 'Megan Bowen' },
      conversation: { isGroup: true, conversationType: 'channel', id: '19:test@thread.tacv2;messageid=1731924900123' },
      text,
      textFormat: 'plain',
    },
    null,
    2
  );

const post = (rawBody, authorization) => {
  const req = request(app).post('/webhooks/microsoft-teams').set('Content-Type', 'application/json');
  if (authorization !== undefined) req.set('Authorization', authorization);
  return req.send(rawBody);
};

beforeEach(() => {
  process.env.MICROSOFT_TEAMS_SECURITY_TOKEN = TOKEN;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('verifyTeamsRequest', () => {
  it('matches the documented test vector', () => {
    const body = '{"type":"message","id":"1731924900123","text":"<at>Helper</at> status","from":{"name":"Megan Bowen"}}';
    expect(verifyTeamsRequest(body, 'HMAC cOMdJKZIsWtg30Ac0WEteH+Xq4T2PR1Id7/qsO430kg=', TOKEN)).toBe(true);
    expect(verifyTeamsRequest(Buffer.from(body), 'HMAC cOMdJKZIsWtg30Ac0WEteH+Xq4T2PR1Id7/qsO430kg=', TOKEN)).toBe(true);
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
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ type: 'message', text: 'Hi Megan Bowen, all systems are operational.' });
  });

  it('handles the help command', async () => {
    const body = activity('<at>Helper</at> help');
    const res = await post(body, sign(body));
    expect(res.body).toEqual({ type: 'message', text: 'Commands: status, help' });
  });

  it('answers unknown commands without echoing them', async () => {
    const body = activity('<at>Helper</at> <b>drop table</b>');
    const res = await post(body, sign(body));
    expect(res.body).toEqual({ type: 'message', text: 'Unknown command. Try "help".' });
  });

  it('accepts a lower-case scheme', async () => {
    const body = activity();
    const res = await post(body, sign(body).replace('HMAC', 'hmac'));
    expect(res.status).toBe(200);
  });

  it('accepts a token with a trailing newline', async () => {
    process.env.MICROSOFT_TEAMS_SECURITY_TOKEN = `${TOKEN}\n`;
    const body = activity();
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(activity())).status).toBe(401);
  });

  it('rejects another scheme', async () => {
    const body = activity();
    expect((await post(body, sign(body).replace('HMAC', 'Bearer'))).status).toBe(401);
  });

  it('rejects a signature keyed with the token string instead of its decoded bytes', async () => {
    const body = activity();
    const wrong = `HMAC ${crypto.createHmac('sha256', TOKEN).update(body).digest('base64')}`;
    expect((await post(body, wrong)).status).toBe(401);
  });

  it('rejects a signature made with another token', async () => {
    const other = crypto.createHash('sha256').update('another-webhook').digest('base64');
    const body = activity();
    expect((await post(body, sign(body, other))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = activity();
    expect((await post(body.replace('status', 'deploy'), sign(body))).status).toBe(401);
  });

  it('rejects a re-serialised body', async () => {
    const body = activity();
    const compact = JSON.stringify(JSON.parse(body));
    expect((await post(compact, sign(body))).status).toBe(401);
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
