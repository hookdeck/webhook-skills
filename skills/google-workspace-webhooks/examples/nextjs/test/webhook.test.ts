import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/google-workspace/route';
import { verifyChannelToken } from '../lib/verify';

// Channel tokens are arbitrary strings up to 256 chars; Google recommends a
// URL-query style encoding like this one.
const TOKEN = 'target=myApp&secret=test_channel_token_123';
const ENDPOINT = 'http://localhost:3000/webhooks/google-workspace';

beforeAll(() => {
  process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN = TOKEN;
});

afterEach(() => {
  process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN = TOKEN;
});

// Headers Google sends on every notification (see Drive push docs example)
function googHeaders(overrides: Record<string, string | undefined> = {}) {
  const headers: Record<string, string | undefined> = {
    'Content-Type': 'application/json; utf-8',
    'X-Goog-Channel-ID': '4ba78bf0-6a47-11e2-bcfd-0800200c9a66',
    'X-Goog-Channel-Token': TOKEN,
    'X-Goog-Channel-Expiration': 'Tue, 19 Nov 2013 01:13:52 GMT',
    'X-Goog-Resource-ID': 'ret08u3rv24htgh289g',
    'X-Goog-Resource-URI': 'https://www.googleapis.com/drive/v3/files/ret08u3rv24htgh289g',
    'X-Goog-Resource-State': 'update',
    'X-Goog-Message-Number': '11',
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(headers).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;
}

function post(overrides: Record<string, string | undefined> = {}, body?: string) {
  return new NextRequest(ENDPOINT, {
    method: 'POST',
    headers: googHeaders(overrides),
    body,
  });
}

describe('verifyChannelToken', () => {
  it('returns true when the token matches', () => {
    expect(verifyChannelToken(TOKEN, TOKEN)).toBe(true);
  });

  it('returns false when the token does not match', () => {
    expect(verifyChannelToken('target=myApp&secret=wrong_channel_token', TOKEN)).toBe(false);
  });

  it('returns false when the received token is missing', () => {
    expect(verifyChannelToken(null, TOKEN)).toBe(false);
  });

  it('returns false when the expected token is missing', () => {
    expect(verifyChannelToken(TOKEN, undefined)).toBe(false);
  });

  it('returns false for different-length values (no throw)', () => {
    expect(verifyChannelToken('short', TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/google-workspace', () => {
  it('answers the sync message with 200', async () => {
    const res = await POST(
      post({ 'X-Goog-Resource-State': 'sync', 'X-Goog-Message-Number': '1' })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a Drive update with X-Goog-Changed and an empty body', async () => {
    const res = await POST(post({ 'X-Goog-Changed': 'content,properties' }));
    expect(res.status).toBe(200);
  });

  it.each(['add', 'remove', 'trash', 'untrash', 'change'])(
    'accepts Drive resource state %s',
    async (state) => {
      const res = await POST(post({ 'X-Goog-Resource-State': state }));
      expect(res.status).toBe(200);
    }
  );

  it.each(['exists', 'not_exists'])('accepts Calendar resource state %s', async (state) => {
    const res = await POST(
      post({
        'X-Goog-Resource-State': state,
        'X-Goog-Resource-URI':
          'https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events',
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an Admin SDK Directory notification with a JSON body', async () => {
    const res = await POST(
      post(
        {
          'X-Goog-Resource-State': 'delete',
          'X-Goog-Resource-URI':
            'https://admin.googleapis.com/admin/directory/v1/users?domain=mydomain.com&event=delete&alt=json',
        },
        JSON.stringify({
          kind: 'admin#directory#user',
          id: '111220860655841818702',
          etag: '"Mf8RAmnABsVfQ47MMT_18MHAdRE/evLIDlz2Fd9zbAqwvIp7Pzq8UAw"',
          primaryEmail: 'user@mydomain.com',
        })
      )
    );
    expect(res.status).toBe(200);
  });

  it('accepts unknown resource states (Google may add new ones)', async () => {
    const res = await POST(post({ 'X-Goog-Resource-State': 'something_new' }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong channel token with 400', async () => {
    const res = await POST(
      post({ 'X-Goog-Channel-Token': 'target=myApp&secret=wrong_channel_token' })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing channel token with 400', async () => {
    const res = await POST(post({ 'X-Goog-Channel-Token': undefined }));
    expect(res.status).toBe(400);
  });

  it('rejects requests missing X-Goog-Resource-State with 400', async () => {
    const res = await POST(post({ 'X-Goog-Resource-State': undefined }));
    expect(res.status).toBe(400);
  });

  it('rejects requests missing X-Goog-Channel-ID with 400', async () => {
    const res = await POST(post({ 'X-Goog-Channel-ID': undefined }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the expected token is not configured', async () => {
    delete process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN;
    const res = await POST(post());
    expect(res.status).toBe(500);
  });
});
