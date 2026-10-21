import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const USERNAME = 'mailjet';
// Passwords may contain ':' - the handler must split on the first colon only
const PASSWORD = 'p4ss:word-with-colon';

process.env.MAILJET_WEBHOOK_USERNAME = USERNAME;
process.env.MAILJET_WEBHOOK_PASSWORD = PASSWORD;

import { POST } from '../app/webhooks/mailjet/route';

// Mailjet sends the credentials from https://user:pass@host/... as Basic auth
function basic(user = USERNAME, pass = PASSWORD): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

const base = {
  time: 1433333949,
  MessageID: 19421777835146490,
  email: 'api@mailjet.com',
  mj_campaign_id: 7257,
  mj_contact_id: 4,
  customcampaign: '',
  CustomID: 'helloworld',
  Payload: '',
};

const events: Record<string, Record<string, unknown>> = {
  sent: { ...base, event: 'sent', smtp_reply: 'sent (250 2.0.0 OK)' },
  open: { ...base, event: 'open', ip: '127.0.0.1', geo: 'US', agent: 'Mozilla/5.0' },
  click: { ...base, event: 'click', url: 'https://mailjet.com', ip: '127.0.0.1', geo: 'FR', agent: 'Mozilla/5.0' },
  bounce: { ...base, event: 'bounce', blocked: false, hard_bounce: true, error_related_to: 'recipient', error: 'user unknown', comment: '550' },
  blocked: { ...base, event: 'blocked', error_related_to: 'recipient', error: 'user unknown' },
  spam: { ...base, event: 'spam', source: 'JMRPP' },
  unsub: { ...base, event: 'unsub', mj_list_id: 1, ip: '127.0.0.1', geo: 'FR', agent: 'Mozilla/5.0' },
};

function post(body: unknown, auth?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers['authorization'] = auth;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/mailjet', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

describe('Mailjet webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('authentication', () => {
    it('accepts valid credentials', async () => {
      expect((await post(events.open, basic())).status).toBe(200);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post(events.open);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/Basic/);
    });

    it('rejects a wrong password', async () => {
      expect((await post(events.open, basic(USERNAME, 'wrong'))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await post(events.open, basic('someone', PASSWORD))).status).toBe(401);
    });

    it('rejects a password that is a prefix or extension of the real one', async () => {
      expect((await post(events.open, basic(USERNAME, PASSWORD + 'x'))).status).toBe(401);
      expect((await post(events.open, basic(USERNAME, PASSWORD.slice(0, -1)))).status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      expect((await post(events.open, 'Bearer abc')).status).toBe(401);
    });

    it('rejects malformed Basic credentials (no colon)', async () => {
      const header = 'Basic ' + Buffer.from('nocolon').toString('base64');
      expect((await post(events.open, header)).status).toBe(401);
    });

    it('does not process events when unauthorized', async () => {
      await post(events.bounce, basic(USERNAME, 'wrong'));
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('returns 500 when credentials are not configured', async () => {
      const saved = process.env.MAILJET_WEBHOOK_PASSWORD;
      delete process.env.MAILJET_WEBHOOK_PASSWORD;
      vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect((await post(events.open, basic())).status).toBe(500);
      } finally {
        process.env.MAILJET_WEBHOOK_PASSWORD = saved;
      }
    });
  });

  describe('events', () => {
    it.each(Object.keys(events))('handles %s events', async (name) => {
      const res = await post(events[name], basic());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 1 });
    });

    it('reports hard bounces', async () => {
      await post(events.bounce, basic());
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('hard'));
    });

    it('handles grouped events sent as an array', async () => {
      const res = await post([events.sent, events.open, events.click], basic());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 3 });
    });

    it('acknowledges unknown event types', async () => {
      expect((await post({ ...base, event: 'future_event' }, basic())).status).toBe(200);
    });
  });

  describe('payload validation', () => {
    it('rejects invalid JSON', async () => {
      expect((await post('{not json', basic())).status).toBe(400);
    });

    it('rejects events without an event field', async () => {
      expect((await post({ email: 'a@b.c' }, basic())).status).toBe(400);
    });

    it('rejects an array containing a malformed event', async () => {
      expect((await post([events.open, 'nope'], basic())).status).toBe(400);
    });
  });
});
