import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/digital-samba/route';
import { verifyDigitalSambaRequest } from '../lib/verify-digital-samba';

const SECRET = 'test_digital_samba_secret_0123456789';

const EVENTS = [
  'participant_joined', 'participant_left', 'session_started', 'session_ended',
  'recording_started', 'recording_stopped', 'recording_ready', 'recording_deleted',
  'session_summary_ready', 'session_transcript_ready',
];

beforeAll(() => {
  process.env.DIGITAL_SAMBA_WEBHOOK_SECRET = SECRET;
});

// Based on the documented participant_joined payload
function samplePayload(eventType = 'participant_joined') {
  return {
    eventType,
    sessionId: '4fcc375c-e0ce-4f52-9b35-3a034042ab5a',
    roomId: '7f8c8eac-6643-47db-8d93-e7633e6e53ec',
    timestamp: 1675790387,
    data: {
      participantId: '8b085f23-9a2a-465d-bdbb-73a233c7df90',
      name: 'John Smith',
      role: 'moderator',
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/digital-samba', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const bearer = (s = SECRET) => ({ Authorization: `Bearer ${s}` });

describe('POST /webhooks/digital-samba', () => {
  describe('Authorization bearer verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest(bearer()));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the Bearer scheme case-insensitively', async () => {
      expect((await POST(makeRequest({ Authorization: `bearer ${SECRET}` }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: `BEARER ${SECRET}` }))).status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      expect((await POST(makeRequest(bearer('x'.repeat(SECRET.length))))).status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      expect((await POST(makeRequest(bearer('short')))).status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('rejects the bare secret without the Bearer scheme', async () => {
      expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      expect((await POST(makeRequest({ Authorization: `Basic ${SECRET}` }))).status).toBe(401);
    });

    it('does not trim the secret', () => {
      const headers = new Headers({ authorization: `Bearer ${SECRET}` });
      expect(verifyDigitalSambaRequest(headers, ` ${SECRET}`)).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: `Bearer ${SECRET}` });
      expect(verifyDigitalSambaRequest(headers, '')).toBe(false);
      expect(verifyDigitalSambaRequest(headers, 'Bearer ')).toBe(false);
      expect(verifyDigitalSambaRequest(headers, SECRET)).toBe(true);
    });

    it('strips a "Bearer " prefix from the configured secret', () => {
      const headers = new Headers({ authorization: `Bearer ${SECRET}` });
      expect(verifyDigitalSambaRequest(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyDigitalSambaRequest(headers, `bearer ${SECRET}`)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/digital-samba', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', ...bearer() },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      expect((await POST(makeRequest(bearer(), '{not json'))).status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      expect((await POST(makeRequest(bearer(), '[1,2]'))).status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      expect((await POST(makeRequest({}, '{not json'))).status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(bearer(), JSON.stringify(samplePayload(eventType))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(bearer(), JSON.stringify(samplePayload('something_new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
