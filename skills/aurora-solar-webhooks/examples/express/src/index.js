// Generated with: aurora-solar-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const DEFAULT_HEADER = 'X-Aurora-Webhook-Token';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Aurora Solar does not sign webhooks. You add a secret header to the subscription
 * (header_auth_key / header_auth_value) and Aurora sends it on every GET. The header
 * name is user-chosen; the whole value is compared as-is (no Bearer parsing).
 */
function verifyAuroraSolarRequest(
  headers,
  secret = process.env.AURORA_SOLAR_WEBHOOK_SECRET,
  headerName = process.env.AURORA_SOLAR_WEBHOOK_HEADER || DEFAULT_HEADER
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// Every event the Aurora Solar docs list (https://docs.aurorasolar.com/reference/events).
const EVENT_LABELS = {
  agreement_download_url_job_completed: 'Agreement download URL ready',
  agreement_status_changed: 'Agreement status changed',
  ahj_lookup_completed: 'AHJ lookup completed',
  ai_roof_job_completed: 'AI Roof job completed',
  app_status_changed: 'Partner app status changed',
  asset_created: 'Asset created',
  auto_designer_job_completed: 'AutoDesigner job completed',
  consumption_profile_changed: 'Consumption profile changed',
  design_created: 'Design created',
  design_deleted: 'Design deleted',
  design_request_completed: 'Design request completed',
  design_request_created: 'Design request created',
  design_request_rejected: 'Design request rejected',
  fire_pathway_placement_job_completed: 'Fire pathway placement job completed',
  financier_contract_status_changed: 'Financier contract status changed',
  imagery_lidar_completed: 'Imagery and LiDAR completed',
  milestone_created: 'Milestone created',
  milestone_shared: 'Milestone shared',
  order_created: 'Order created',
  panel_irradiance_analysis_job_completed: 'Panel irradiance analysis completed',
  performance_simulation_job_completed: 'Performance simulation completed',
  plan_set_request_status_changed: 'Plan set request status changed',
  project_changed: 'Project changed',
  project_created: 'Project created',
  project_deleted: 'Project deleted',
  project_status_changed: 'Project status changed',
  proposal_pdf_generation_job_completed: 'Proposal PDF generated',
  site_survey_requested: 'Site survey requested',
  site_survey_status_changed: 'Site survey status changed',
  utility_bill_upload_job_completed: 'Utility bill upload completed',
  web_proposal_url_created: 'Web proposal URL created',
  web_proposal_viewed: 'Web proposal viewed',
};

function handleEvent(event, params) {
  const label = EVENT_LABELS[event];
  if (!label) {
    console.log(`Unhandled event: ${event}`);
    return;
  }
  console.log(`${label}:`, params);
  // TODO: the payload is only identifiers and statuses; fetch the object from the
  // Aurora API using params.project_id / params.design_id / params.job_id.
}

// Aurora sends GET with no body; the data is in the query string. Take the first
// value if a key repeats.
function queryParams(query) {
  const params = {};
  for (const [key, value] of Object.entries(query || {})) {
    params[key] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return params;
}

// Read any body raw (any content type) and authenticate before looking at the data.
function auroraSolarHandler(req, res) {
  if (!verifyAuroraSolarRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook auth header' });
  }

  // Each subscription is for one event: the URL template carries a static `event`.
  const params = queryParams(req.query);
  const { event } = params;
  if (!event) {
    return res.status(400).json({ error: 'Missing event query parameter' });
  }

  try {
    handleEvent(event, params);
  } catch (err) {
    console.error('Error handling Aurora Solar event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

app.get('/webhooks/aurora-solar', express.raw({ type: '*/*' }), auroraSolarHandler);
app.post('/webhooks/aurora-solar', express.raw({ type: '*/*' }), auroraSolarHandler);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAuroraSolarRequest = verifyAuroraSolarRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: GET http://localhost:${PORT}/webhooks/aurora-solar?event=project_created&project_id=...`);
  });
}
