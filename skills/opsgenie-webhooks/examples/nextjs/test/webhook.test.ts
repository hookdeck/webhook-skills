import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/opsgenie/route';
import { verifyOpsgenieRequest } from '../lib/verify-opsgenie';

const HEADER = 'X-Opsgenie-Secret';
const SECRET = 'test_opsgenie_secret_0123456789';

const ACTIONS = [
  'Create', 'Acknowledge', 'UnAcknowledge', 'AddNote', 'AddTags', 'RemoveTags', 'Close',
  'AssignOwnership', 'TakeOwnership', 'Delete', 'Escalate', 'UpdatePriority',
  'UpdateDescription', 'UpdateMessage', 'AddTeam', 'AddRecipient',
];

beforeAll(() => {
  process.env.OPSGENIE_WEBHOOK_HEADER = HEADER;
  process.env.OPSGENIE_WEBHOOK_SECRET = SECRET;
});

function samplePayload(action = 'Create') {
  return {
    source: { name: 'web', type: 'API' },
    alert: {
      alertId: '052652ac-5d1c-464a-812a-7dd18bbfba8c',
      message: 'test alert',
      alias: 'aliastest',
      tinyId: '23',
      tags: ['tag1', 'tag2'],
      username: 'fili@ifountain.com',
      entity: '',
    },
    action,
    integrationId: '37c8f316-17c6-49d7-899b-9c7e540c048d',
    integrationName: 'Integration1',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/opsgenie', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/opsgenie', () => {
  describe('Custom header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toUpperCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyOpsgenieRequest(headers, HEADER, '')).toBe(false);
      expect(verifyOpsgenieRequest(headers, HEADER, SECRET)).toBe(true);
    });

    it('compares non-ASCII values without throwing', () => {
      const headers = new Headers({ [HEADER]: 'sécret-ü' });
      expect(verifyOpsgenieRequest(headers, HEADER, 'sécret-ü')).toBe(true);
      expect(verifyOpsgenieRequest(headers, HEADER, 'secret-u')).toBe(false);
    });
  });

  describe('Default Authorization header and whole-value compare', () => {
    const bearer = `Bearer ${SECRET}`;

    it('defaults the header name to Authorization', () => {
      vi.stubEnv('OPSGENIE_WEBHOOK_HEADER', '');
      try {
        const headers = new Headers({ Authorization: SECRET });
        expect(verifyOpsgenieRequest(headers, undefined, SECRET)).toBe(true);
      } finally {
        vi.unstubAllEnvs();
        process.env.OPSGENIE_WEBHOOK_HEADER = HEADER;
      }
    });

    it('accepts the whole value including a Bearer prefix', () => {
      const headers = new Headers({ Authorization: bearer });
      expect(verifyOpsgenieRequest(headers, 'Authorization', bearer)).toBe(true);
    });

    it('does not strip the Bearer prefix', () => {
      expect(verifyOpsgenieRequest(new Headers({ Authorization: bearer }), 'Authorization', SECRET)).toBe(false);
      expect(verifyOpsgenieRequest(new Headers({ Authorization: SECRET }), 'Authorization', bearer)).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a credential', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Action handling', () => {
    it.each(ACTIONS)('handles %s', async (action) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(action))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Custom or unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles an Escalate payload that has no source object', async () => {
      const body = {
        action: 'Escalate',
        alert: { alertId: '7ba97e3a-d328-4b5e-8f9a-39e945a3869a' },
        escalationName: 'test_esc',
        escalationNotify: { name: 'test@ifountain.com', type: 'default', entity: 'user' },
      };
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(body)));
      expect(res.status).toBe(200);
    });

    it('acknowledges custom action names', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('TestAction')))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('TestAction'))).toBe(true);
      spy.mockRestore();
    });
  });
});
