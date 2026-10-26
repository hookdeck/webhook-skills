const request = require('supertest');

// Set test environment variables before importing the app
process.env.AURORA_SOLAR_WEBHOOK_SECRET = 'test_aurora_token_2dbcbba1-9f64-4c07';
delete process.env.AURORA_SOLAR_WEBHOOK_HEADER;

const app = require('../src/index');
const { verifyAuroraSolarRequest } = require('../src/index');

const SECRET = process.env.AURORA_SOLAR_WEBHOOK_SECRET;
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

const PATH = '/webhooks/aurora-solar';
const QUERY = { event: 'project_created', project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', source: 'api' };

// Aurora fires GET requests with no body; the data is in the query string.
function get(query = QUERY) {
  return request(app).get(PATH).query(query);
}

describe('Aurora Solar webhook endpoint', () => {
  describe('header token verification', () => {
    it('accepts the correct token on GET with no body', async () => {
      const res = await get().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await get().set('x-aurora-webhook-token', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await get().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await get().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await get();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await get().set('X-Other-Token', SECRET);
      expect(res.status).toBe(401);
    });

    it('checks the header before reading the query', async () => {
      const res = await get({});
      expect(res.status).toBe(401);
    });

    it('does not parse or strip a Bearer prefix', async () => {
      const res = await get().set(HEADER, `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('compares the whole value when the secret includes Bearer', () => {
      const secret = 'Bearer abc123';
      expect(verifyAuroraSolarRequest({ 'x-aurora-webhook-token': 'Bearer abc123' }, secret)).toBe(true);
      expect(verifyAuroraSolarRequest({ 'x-aurora-webhook-token': 'abc123' }, secret)).toBe(false);
    });

    it('rejects everything when the secret is not configured', () => {
      expect(verifyAuroraSolarRequest({ 'x-aurora-webhook-token': SECRET }, '')).toBe(false);
      expect(verifyAuroraSolarRequest({ 'x-aurora-webhook-token': SECRET }, SECRET)).toBe(true);
    });

    it('handles non-ASCII values without throwing', () => {
      expect(verifyAuroraSolarRequest({ 'x-aurora-webhook-token': 'tökén' }, 'token')).toBe(false);
      expect(verifyAuroraSolarRequest({ 'x-aurora-webhook-token': 'tökén' }, 'tökén')).toBe(true);
    });

    it('honours a custom header name from AURORA_SOLAR_WEBHOOK_HEADER', async () => {
      process.env.AURORA_SOLAR_WEBHOOK_HEADER = 'X-My-Aurora-Key';
      try {
        expect((await get().set('X-My-Aurora-Key', SECRET)).status).toBe(200);
        expect((await get().set(HEADER, SECRET)).status).toBe(401);
      } finally {
        delete process.env.AURORA_SOLAR_WEBHOOK_HEADER;
      }
    });
  });

  describe('methods and bodies', () => {
    it('also accepts POST', async () => {
      const res = await request(app)
        .post(PATH)
        .query(QUERY)
        .set(HEADER, SECRET)
        .set('Content-Type', 'text/plain')
        .send('ignored');
      expect(res.status).toBe(200);
    });

    it('rejects POST without the token', async () => {
      const res = await request(app).post(PATH).query(QUERY).send('{}');
      expect(res.status).toBe(401);
    });

    it('returns 400 when the event query parameter is missing', async () => {
      const res = await get({ project_id: 'abc' }).set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const res = await get({ event, project_id: 'p1', design_id: 'd1' }).set(HEADER, SECRET);
        expect(res.status).toBe(200);
        expect(spy.mock.calls.some((c) => String(c[0]).startsWith('Unhandled'))).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('acknowledges unknown events', async () => {
      const res = await get({ event: 'something_new' }).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  it('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
