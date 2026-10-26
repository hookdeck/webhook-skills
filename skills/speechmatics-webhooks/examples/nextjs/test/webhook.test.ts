import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT } from '../app/webhooks/speechmatics/route';
import { verifySpeechmaticsRequest } from '../lib/verify-speechmatics';

const NAME = 'Authorization';
const VALUE = 'Bearer test_speechmatics_token_0123456789';

beforeAll(() => {
  process.env.SPEECHMATICS_WEBHOOK_HEADER = NAME;
  process.env.SPEECHMATICS_WEBHOOK_SECRET = VALUE;
});

const JOB_ID = 'r6sr3jlzjj';

// A jobinfo body: the JSON Speechmatics sends when only `jobinfo` is requested
const jobinfo = JSON.stringify({ id: JOB_ID, type: 'transcription', created_at: '2021-07-19T09:02:17.283Z' });

function makeRequest(
  headers: Record<string, string> = {},
  body: string | undefined = jobinfo,
  contentType: string | undefined = 'application/json',
  status = 'success',
  method = 'POST'
): NextRequest {
  return new NextRequest(`http://localhost:3000/webhooks/speechmatics?id=${JOB_ID}&status=${status}`, {
    method,
    headers: { ...(contentType ? { 'content-type': contentType } : {}), ...headers },
    body,
  });
}

describe('POST /webhooks/speechmatics', () => {
  describe('Auth header', () => {
    it('accepts the correct whole header value', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [NAME.toLowerCase()]: VALUE }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the token without the Bearer prefix is rejected', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [NAME]: 'x'.repeat(VALUE.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [NAME]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects when the header is missing', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the value sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'X-Other-Header': VALUE }));
      expect(res.status).toBe(401);
    });

    it('rejects an unauthenticated empty request', async () => {
      const res = await POST(makeRequest({}, undefined, undefined));
      expect(res.status).toBe(401);
    });
  });

  describe('Methods and bodies', () => {
    it('accepts PUT as well as POST', async () => {
      const res = await PUT(makeRequest({ [NAME]: VALUE }, jobinfo, 'application/json', 'success', 'PUT'));
      expect(res.status).toBe(200);
    });

    it('accepts an empty body (status-only notification)', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }, undefined, undefined));
      expect(res.status).toBe(200);
    });

    it('accepts a plain text transcript', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }, '1\n00:00:00,000 --> 00:00:01,000\nHello\n', 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('accepts a multipart body without parsing it', async () => {
      const boundary = 'xBOUNDARYx';
      const body =
        `--${boundary}\r\nContent-Disposition: form-data; name="jobinfo"\r\nContent-Type: application/json\r\n\r\n${jobinfo}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="data_file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF\r\n` +
        `--${boundary}--\r\n`;
      const res = await POST(makeRequest({ [NAME]: VALUE }, body, `multipart/form-data; boundary=${boundary}`));
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }, '{not json'));
      expect(res.status).toBe(400);
    });
  });

  describe('Statuses', () => {
    it('handles success, error, fetch_error, trim_error and unknown statuses', async () => {
      for (const status of ['success', 'error', 'fetch_error', 'trim_error', 'something_new']) {
        const res = await POST(makeRequest({ [NAME]: VALUE }, jobinfo, 'application/json', status));
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifySpeechmaticsRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifySpeechmaticsRequest(new Headers({ [NAME]: VALUE }), {})).toBe(false);
      expect(verifySpeechmaticsRequest(new Headers({ [NAME]: '' }), { SPEECHMATICS_WEBHOOK_SECRET: '' })).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const config = { SPEECHMATICS_WEBHOOK_SECRET: 'Bearer s3cret' };
      expect(verifySpeechmaticsRequest(new Headers({ authorization: 'Bearer s3cret' }), config)).toBe(true);
    });

    it('uses a custom header name', () => {
      const config = { SPEECHMATICS_WEBHOOK_HEADER: 'X-SM-Token', SPEECHMATICS_WEBHOOK_SECRET: 's3cret' };
      expect(verifySpeechmaticsRequest(new Headers({ 'x-sm-token': 's3cret' }), config)).toBe(true);
      expect(verifySpeechmaticsRequest(new Headers({ authorization: 's3cret' }), config)).toBe(false);
    });

    it('rejects an invalid configured header name without throwing', () => {
      const config = { SPEECHMATICS_WEBHOOK_HEADER: 'bad name', SPEECHMATICS_WEBHOOK_SECRET: 's3cret' };
      expect(verifySpeechmaticsRequest(new Headers({ authorization: 's3cret' }), config)).toBe(false);
    });
  });
});
