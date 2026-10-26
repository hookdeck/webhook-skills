import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/webhooks/aurora-solar/route';
import { verifyAuroraSolarRequest } from '../lib/verify-aurora-solar';

const SECRET = 'test_aurora_token_2dbcbba1-9f64-4c07';
const HEADER = 'X-Aurora-Webhook-Token';

const EVENTS = [
  'agreement_download_url_job_completed', 'agreement_status_changed', 'ahj_lookup_completed',
  'ai_roof_job_completed', 'app_status_changed', 'asset_created', 'auto_designer_job_completed',
  'consumption_profile_changed', 'design_created', 'design_deleted', 'design_request_completed',
  'design_request_created', 'design_request_rejected', 'fire_pathway_placement_job_completed',
  'financier_contract_status_changed', 'imagery_lidar_completed', 'milestone_created',
  'milestone_shared', 'order_created', 'panel_irradiance_analysis_job_completed',
  'performance_simulation_job_completed', 'plan_set_request_status_changed', 'project_changed',
  'project_created', 'project_deleted', 'project_status_changed',
  'proposal_pdf_generation_job_completed', 'site_survey_requested', 'site_survey_status_changed',
  'utility_bill_upload_job_completed', 'web_proposal_url_created', 'web_proposal_viewed',
];

beforeAll(() => {
  process.env.AURORA_SOLAR_WEBHOOK_SECRET = SECRET;
  delete process.env.AURORA_SOLAR_WEBHOOK_HEADER;
});

afterEach(() => {
  delete process.env.AURORA_SOLAR_WEBHOOK_HEADER;
});

const DEFAULT_QUERY = 'event=project_created&project_id=3fa85f64-5717-4562-b3fc-2c963f66afa6&source=api';

// Aurora fires GET requests with no body; the data is in the query string.
function makeGet(headers: Record<string, string> = {}, query: string = DEFAULT_QUERY): NextRequest {
  return new NextRequest(`http://localhost:3000/webhooks/aurora-solar${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers,
  });
}

describe('GET /webhooks/aurora-solar', () => {
  describe('header token verification', () => {
    it('accepts the correct token on GET with no body', async () => {
      const res = await GET(makeGet({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await GET(makeGet({ 'x-aurora-webhook-token': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await GET(makeGet({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await GET(makeGet({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await GET(makeGet());
      expect(res.status).toBe(401);
    });

    it('checks the header before reading the query', async () => {
      const res = await GET(makeGet({}, ''));
      expect(res.status).toBe(401);
    });

    it('does not parse or strip a Bearer prefix', async () => {
      const res = await GET(makeGet({ [HEADER]: `Bearer ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value when the secret includes Bearer', () => {
      const headers = (value: string) => new Headers({ [HEADER]: value });
      expect(verifyAuroraSolarRequest(headers('Bearer abc123'), 'Bearer abc123')).toBe(true);
      expect(verifyAuroraSolarRequest(headers('abc123'), 'Bearer abc123')).toBe(false);
    });

    it('rejects everything when the secret is not configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyAuroraSolarRequest(headers, '')).toBe(false);
      expect(verifyAuroraSolarRequest(headers, SECRET)).toBe(true);
    });

    it('honours a custom header name from AURORA_SOLAR_WEBHOOK_HEADER', async () => {
      process.env.AURORA_SOLAR_WEBHOOK_HEADER = 'X-My-Aurora-Key';
      expect((await GET(makeGet({ 'X-My-Aurora-Key': SECRET }))).status).toBe(200);
      expect((await GET(makeGet({ [HEADER]: SECRET }))).status).toBe(401);
    });
  });

  describe('query handling', () => {
    it('returns 400 when the event query parameter is missing', async () => {
      const res = await GET(makeGet({ [HEADER]: SECRET }, 'project_id=abc'));
      expect(res.status).toBe(400);
    });

    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const res = await GET(makeGet({ [HEADER]: SECRET }, `event=${event}&project_id=p1&design_id=d1`));
        expect(res.status).toBe(200);
        expect(spy.mock.calls.some((c) => String(c[0]).startsWith('Unhandled'))).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('acknowledges unknown events', async () => {
      const res = await GET(makeGet({ [HEADER]: SECRET }, 'event=something_new'));
      expect(res.status).toBe(200);
    });
  });
});

describe('POST /webhooks/aurora-solar', () => {
  function makePost(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(`http://localhost:3000/webhooks/aurora-solar?${DEFAULT_QUERY}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', ...headers },
      body: 'ignored',
    });
  }

  it('accepts POST with the correct token', async () => {
    const res = await POST(makePost({ [HEADER]: SECRET }));
    expect(res.status).toBe(200);
  });

  it('rejects POST without the token', async () => {
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });
});
