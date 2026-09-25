/**
 * BurnSignal — API Client
 *
 * Thin fetch wrapper around the read-only backend API.
 * When API_BASE_URL is not configured (local / demo mode),
 * all calls transparently fall back to the MOCK_DATA constants
 * below — no backend required for the hackathon demo.
 *
 * Secrets: none. This file contains only synthetic demo data.
 * Real credentials live in environment variables on the server side.
 *
 * Usage (from any component):
 *   const scores = await BurnSignal.api.getPlotScores();
 */

'use strict';

/* ================================================================
   1. Configuration
   API_BASE_URL is injected at build/deploy time.
   Falls back to null → mock mode.
================================================================ */
const API_BASE_URL = window.__BS_API_BASE_URL__ || null;
const USE_MOCK     = !API_BASE_URL;
const MOCK_DELAY_MS = 600; // simulate network latency in mock mode

/* ================================================================
   2. Synthetic Demo Data
   Pilot district: Sangrur, Punjab (~30.23°N, 75.85°E)
   All plot IDs, worker names, and farm data are fictitious.
================================================================ */

/** @type {import('./types').PlotScore[]} */
const MOCK_PLOT_SCORES = [
  // ── Cluster A — north-west block (critical) ──────────────────
  { plot_id: 'SAN-NW-001', lat: 30.312, lon: 75.821, burn_likelihood_score: 0.91, residue_index: 0.74, days_since_harvest: 4,  plot_area_ha: 3.2, farmer_name: 'Harjinder Singh',    block_code: 'LEHRA',     scoring_window_end: _hoursFromNow(58), cluster_id: 'CLU-A', feature_confidence: 'normal' },
  { plot_id: 'SAN-NW-002', lat: 30.309, lon: 75.826, burn_likelihood_score: 0.87, residue_index: 0.71, days_since_harvest: 5,  plot_area_ha: 2.8, farmer_name: 'Gurpreet Kaur',     block_code: 'LEHRA',     scoring_window_end: _hoursFromNow(60), cluster_id: 'CLU-A', feature_confidence: 'normal' },
  { plot_id: 'SAN-NW-003', lat: 30.316, lon: 75.819, burn_likelihood_score: 0.83, residue_index: 0.68, days_since_harvest: 5,  plot_area_ha: 4.1, farmer_name: 'Balwinder Pal',     block_code: 'LEHRA',     scoring_window_end: _hoursFromNow(61), cluster_id: 'CLU-A', feature_confidence: 'normal' },
  { plot_id: 'SAN-NW-004', lat: 30.304, lon: 75.831, burn_likelihood_score: 0.79, residue_index: 0.63, days_since_harvest: 6,  plot_area_ha: 2.1, farmer_name: 'Sukhdev Sharma',   block_code: 'LEHRA',     scoring_window_end: _hoursFromNow(63), cluster_id: 'CLU-A', feature_confidence: 'normal' },
  // ── Cluster B — central block (high) ─────────────────────────
  { plot_id: 'SAN-CE-001', lat: 30.231, lon: 75.854, burn_likelihood_score: 0.76, residue_index: 0.61, days_since_harvest: 7,  plot_area_ha: 5.6, farmer_name: 'Amritpal Singh',   block_code: 'SANGRUR',   scoring_window_end: _hoursFromNow(66), cluster_id: 'CLU-B', feature_confidence: 'normal' },
  { plot_id: 'SAN-CE-002', lat: 30.228, lon: 75.861, burn_likelihood_score: 0.72, residue_index: 0.57, days_since_harvest: 7,  plot_area_ha: 3.9, farmer_name: 'Ravinder Kumari',  block_code: 'SANGRUR',   scoring_window_end: _hoursFromNow(67), cluster_id: 'CLU-B', feature_confidence: 'normal' },
  { plot_id: 'SAN-CE-003', lat: 30.236, lon: 75.848, burn_likelihood_score: 0.68, residue_index: 0.54, days_since_harvest: 8,  plot_area_ha: 2.4, farmer_name: 'Jaswinder Mann',   block_code: 'SANGRUR',   scoring_window_end: _hoursFromNow(68), cluster_id: 'CLU-B', feature_confidence: 'normal' },
  // ── Cluster C — south-east block (moderate) ──────────────────
  { plot_id: 'SAN-SE-001', lat: 30.158, lon: 75.912, burn_likelihood_score: 0.63, residue_index: 0.48, days_since_harvest: 9,  plot_area_ha: 6.2, farmer_name: 'Daljeet Bajwa',    block_code: 'DIRBA',     scoring_window_end: _hoursFromNow(70), cluster_id: 'CLU-C', feature_confidence: 'normal' },
  { plot_id: 'SAN-SE-002', lat: 30.153, lon: 75.918, burn_likelihood_score: 0.61, residue_index: 0.47, days_since_harvest: 9,  plot_area_ha: 3.3, farmer_name: 'Kulwinder Gill',   block_code: 'DIRBA',     scoring_window_end: _hoursFromNow(70), cluster_id: 'CLU-C', feature_confidence: 'degraded' },
  { plot_id: 'SAN-SE-003', lat: 30.162, lon: 75.905, burn_likelihood_score: 0.60, residue_index: 0.46, days_since_harvest: 10, plot_area_ha: 4.7, farmer_name: 'Paramjit Sidhu',   block_code: 'DIRBA',     scoring_window_end: _hoursFromNow(71), cluster_id: 'CLU-C', feature_confidence: 'normal' },
  // ── Isolated high-risk plots (no cluster yet) ────────────────
  { plot_id: 'SAN-SW-001', lat: 30.189, lon: 75.793, burn_likelihood_score: 0.71, residue_index: 0.58, days_since_harvest: 6,  plot_area_ha: 2.9, farmer_name: 'Satinder Dhaliwal', block_code: 'MOONAK',   scoring_window_end: _hoursFromNow(65), cluster_id: null,    feature_confidence: 'normal' },
  // ── Low-risk plots (below threshold, visible on map) ─────────
  { plot_id: 'SAN-CE-010', lat: 30.244, lon: 75.869, burn_likelihood_score: 0.42, residue_index: 0.31, days_since_harvest: 12, plot_area_ha: 1.8, farmer_name: 'Bhupinder Toor',   block_code: 'SANGRUR',   scoring_window_end: _hoursFromNow(72), cluster_id: null,    feature_confidence: 'normal' },
  { plot_id: 'SAN-NW-010', lat: 30.321, lon: 75.841, burn_likelihood_score: 0.38, residue_index: 0.28, days_since_harvest: 13, plot_area_ha: 3.1, farmer_name: 'Manjeet Randhawa', block_code: 'LEHRA',     scoring_window_end: _hoursFromNow(72), cluster_id: null,    feature_confidence: 'normal' },
  { plot_id: 'SAN-SE-010', lat: 30.141, lon: 75.931, burn_likelihood_score: 0.27, residue_index: 0.19, days_since_harvest: 15, plot_area_ha: 5.0, farmer_name: 'Lakhvir Brar',     block_code: 'DIRBA',     scoring_window_end: _hoursFromNow(72), cluster_id: null,    feature_confidence: 'normal' },
  { plot_id: 'SAN-NE-001', lat: 30.278, lon: 75.901, burn_likelihood_score: 0.19, residue_index: 0.12, days_since_harvest: 17, plot_area_ha: 2.2, farmer_name: 'Gurmail Dhaliwal', block_code: 'ANDANA',    scoring_window_end: _hoursFromNow(72), cluster_id: null,    feature_confidence: 'normal' },
];

/** @type {import('./types').HotspotCluster[]} */
const MOCK_CLUSTERS = [
  {
    cluster_id: 'CLU-A',
    label: 'Lehra North-West',
    centroid_lat: 30.310, centroid_lon: 75.824,
    mean_score: 0.85,
    plot_count: 4,
    effective_deadline: _hoursFromNow(58),
    block_code: 'LEHRA',
    worker_id: 'KVK-001',
    worker_name: 'Kirpal Singh Bains',
    equipment_type: 'Happy Seeder',
    slot_start: _hoursFromNow(12),
    status: 'ready_for_delivery',
  },
  {
    cluster_id: 'CLU-B',
    label: 'Sangrur Central',
    centroid_lat: 30.232, centroid_lon: 75.854,
    mean_score: 0.72,
    plot_count: 3,
    effective_deadline: _hoursFromNow(66),
    block_code: 'SANGRUR',
    worker_id: 'KVK-002',
    worker_name: 'Surjit Kaur Dhillon',
    equipment_type: 'Rotavator',
    slot_start: _hoursFromNow(18),
    status: 'ready_for_delivery',
  },
  {
    cluster_id: 'CLU-C',
    label: 'Dirba South-East',
    centroid_lat: 30.158, centroid_lon: 75.912,
    mean_score: 0.61,
    plot_count: 3,
    effective_deadline: _hoursFromNow(70),
    block_code: 'DIRBA',
    worker_id: null,
    worker_name: null,
    equipment_type: null,
    slot_start: null,
    status: 'escalation_required', // no KVK worker mapped
  },
];

/** @type {import('./types').DispatchTask[]} */
const MOCK_DISPATCH_TASKS = [
  { task_id: 'TSK-001', plot_id: 'SAN-NW-001', cluster_id: 'CLU-A', farmer_name: 'Harjinder Singh',   worker_id: 'KVK-001', worker_name: 'Kirpal Singh Bains',   equipment_type: 'Happy Seeder', slot_start: _hoursFromNow(12), script_text: 'Sat Sri Akal Harjinder ji...', status: 'ready_for_delivery', created_at: _hoursFromNow(-2) },
  { task_id: 'TSK-002', plot_id: 'SAN-NW-002', cluster_id: 'CLU-A', farmer_name: 'Gurpreet Kaur',     worker_id: 'KVK-001', worker_name: 'Kirpal Singh Bains',   equipment_type: 'Happy Seeder', slot_start: _hoursFromNow(12), script_text: 'Sat Sri Akal Gurpreet ji...', status: 'ready_for_delivery', created_at: _hoursFromNow(-2) },
  { task_id: 'TSK-003', plot_id: 'SAN-NW-003', cluster_id: 'CLU-A', farmer_name: 'Balwinder Pal',     worker_id: 'KVK-001', worker_name: 'Kirpal Singh Bains',   equipment_type: 'Happy Seeder', slot_start: _hoursFromNow(14), script_text: 'Sat Sri Akal Balwinder ji...', status: 'ready_for_delivery', created_at: _hoursFromNow(-2) },
  { task_id: 'TSK-004', plot_id: 'SAN-NW-004', cluster_id: 'CLU-A', farmer_name: 'Sukhdev Sharma',   worker_id: 'KVK-001', worker_name: 'Kirpal Singh Bains',   equipment_type: 'Happy Seeder', slot_start: _hoursFromNow(14), script_text: 'Namaskar Sukhdev ji...',       status: 'delivered',          created_at: _hoursFromNow(-3) },
  { task_id: 'TSK-005', plot_id: 'SAN-CE-001', cluster_id: 'CLU-B', farmer_name: 'Amritpal Singh',   worker_id: 'KVK-002', worker_name: 'Surjit Kaur Dhillon',  equipment_type: 'Rotavator',    slot_start: _hoursFromNow(18), script_text: 'Sat Sri Akal Amritpal ji...', status: 'ready_for_delivery', created_at: _hoursFromNow(-1) },
  { task_id: 'TSK-006', plot_id: 'SAN-CE-002', cluster_id: 'CLU-B', farmer_name: 'Ravinder Kumari',  worker_id: 'KVK-002', worker_name: 'Surjit Kaur Dhillon',  equipment_type: 'Rotavator',    slot_start: _hoursFromNow(20), script_text: 'Namaskar Ravinder ji...',      status: 'ready_for_delivery', created_at: _hoursFromNow(-1) },
  { task_id: 'TSK-007', plot_id: 'SAN-CE-003', cluster_id: 'CLU-B', farmer_name: 'Jaswinder Mann',   worker_id: 'KVK-002', worker_name: 'Surjit Kaur Dhillon',  equipment_type: 'Rotavator',    slot_start: _hoursFromNow(20), script_text: 'Sat Sri Akal Jaswinder ji...', status: 'pending_script',     created_at: _hoursFromNow(-0.5) },
  { task_id: 'TSK-008', plot_id: 'SAN-SE-001', cluster_id: 'CLU-C', farmer_name: 'Daljeet Bajwa',    worker_id: null,      worker_name: null,                   equipment_type: null,           slot_start: null,               script_text: null,                          status: 'escalation_required', created_at: _hoursFromNow(-1) },
  { task_id: 'TSK-009', plot_id: 'SAN-SE-002', cluster_id: 'CLU-C', farmer_name: 'Kulwinder Gill',   worker_id: null,      worker_name: null,                   equipment_type: null,           slot_start: null,               script_text: null,                          status: 'escalation_required', created_at: _hoursFromNow(-1) },
  { task_id: 'TSK-010', plot_id: 'SAN-SE-003', cluster_id: 'CLU-C', farmer_name: 'Paramjit Sidhu',   worker_id: null,      worker_name: null,                   equipment_type: null,           slot_start: null,               script_text: null,                          status: 'escalation_required', created_at: _hoursFromNow(-1) },
];

/** @type {import('./types').PipelineRunLog[]} */
const MOCK_PIPELINE_LOG = [
  { run_id: 'RUN-20260824-001', stage: 'ingestion_satellite',   start_time: _hoursFromNow(-5.0), end_time: _hoursFromNow(-4.1), rows_in: 0,   rows_out: 15,  status: 'success' },
  { run_id: 'RUN-20260824-001', stage: 'loader_socioeconomic',  start_time: _hoursFromNow(-5.0), end_time: _hoursFromNow(-4.8), rows_in: 0,   rows_out: 4,   status: 'success' },
  { run_id: 'RUN-20260824-001', stage: 'feature_pipeline',      start_time: _hoursFromNow(-4.1), end_time: _hoursFromNow(-3.4), rows_in: 15,  rows_out: 15,  status: 'success' },
  { run_id: 'RUN-20260824-001', stage: 'scoring_service',       start_time: _hoursFromNow(-3.4), end_time: null,                rows_in: 15,  rows_out: 0,   status: 'running' },
  { run_id: 'RUN-20260824-001', stage: 'clustering_agent',      start_time: null,                end_time: null,                rows_in: 0,   rows_out: 0,   status: 'pending' },
  { run_id: 'RUN-20260824-001', stage: 'coordination_agent',    start_time: null,                end_time: null,                rows_in: 0,   rows_out: 0,   status: 'pending' },
  { run_id: 'RUN-20260824-001', stage: 'dispatch_service',      start_time: null,                end_time: null,                rows_in: 0,   rows_out: 0,   status: 'pending' },
];

/** Summary stats derived from mock data (single source of truth) */
const MOCK_SUMMARY = {
  district:            'Sangrur, Punjab',
  total_plots_scored:  MOCK_PLOT_SCORES.length,
  plots_above_threshold: MOCK_PLOT_SCORES.filter(p => p.burn_likelihood_score >= 0.60).length,
  active_clusters:     MOCK_CLUSTERS.length,
  tasks_ready:         MOCK_DISPATCH_TASKS.filter(t => t.status === 'ready_for_delivery').length,
  tasks_escalation:    MOCK_DISPATCH_TASKS.filter(t => t.status === 'escalation_required').length,
  tasks_delivered:     MOCK_DISPATCH_TASKS.filter(t => t.status === 'delivered').length,
  pipeline_run_id:     'RUN-20260824-001',
  last_run_at:         new Date().toISOString(),
  burn_score_threshold: 0.60,
  scoring_window_hours: 72,
};

/* ================================================================
   3. Helper functions
================================================================ */

/** Returns an ISO timestamp N hours from now (negative = past) */
function _hoursFromNow(hours) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** Simulated network delay (mock mode only) */
function _mockDelay(data) {
  return new Promise(resolve => setTimeout(() => resolve(data), MOCK_DELAY_MS));
}

/** Wrapper around fetch with error handling */
async function _apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} for ${path}: ${body}`);
  }
  return res.json();
}

/**
 * Maps a burn_likelihood_score to a risk tier string.
 * @param {number} score  0–1
 * @returns {'critical'|'high'|'moderate'|'low'|'unknown'}
 */
function scoreToRiskTier(score) {
  if (score == null) return 'unknown';
  if (score >= 0.80) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.50) return 'moderate';
  return 'low';
}

/**
 * Returns the CSS custom-property value for a risk tier's color.
 * @param {string} tier
 */
function riskTierToColor(tier) {
  const map = {
    critical: '#ef4444',
    high:     '#f97316',
    moderate: '#eab308',
    low:      '#22c55e',
    unknown:  '#64748b',
  };
  return map[tier] || map.unknown;
}

/**
 * Formats an ISO timestamp for display.
 * @param {string|null} iso
 * @param {'datetime'|'time'|'relative'} format
 */
function formatTime(iso, format = 'datetime') {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (format === 'time')     return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (format === 'relative') return _relativeTime(d);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return '—'; }
}

function _relativeTime(date) {
  const diffMs   = date - Date.now();
  const diffMins = Math.round(diffMs / 60_000);
  if (Math.abs(diffMins) < 1)  return 'just now';
  if (diffMins > 0) {
    if (diffMins < 60)   return `in ${diffMins}m`;
    const h = Math.round(diffMins / 60);
    return `in ${h}h`;
  }
  const ago = Math.abs(diffMins);
  if (ago < 60)   return `${ago}m ago`;
  return `${Math.round(ago / 60)}h ago`;
}

/* ================================================================
   4. Public API surface
   All methods return a Promise<data>.
   In mock mode they resolve with MOCK_* constants after MOCK_DELAY_MS.
   In live mode they call the backend REST API.
================================================================ */

const api = {

  /** Returns the singleton mock/live mode flag (useful for debug UI) */
  isMock: USE_MOCK,

  /**
   * Fetch all plot scores for the pilot district.
   * @returns {Promise<typeof MOCK_PLOT_SCORES>}
   */
  getPlotScores() {
    if (USE_MOCK) return _mockDelay(MOCK_PLOT_SCORES);
    return _apiFetch('/api/v1/plot-scores');
  },

  /**
   * Fetch all hotspot clusters.
   * @returns {Promise<typeof MOCK_CLUSTERS>}
   */
  getClusters() {
    if (USE_MOCK) return _mockDelay(MOCK_CLUSTERS);
    return _apiFetch('/api/v1/clusters');
  },

  /**
   * Fetch dispatch tasks. Optionally filter by worker_id or status.
   * @param {{ worker_id?: string, status?: string }} [filters]
   * @returns {Promise<typeof MOCK_DISPATCH_TASKS>}
   */
  getDispatchTasks(filters = {}) {
    if (USE_MOCK) {
      const filtered = MOCK_DISPATCH_TASKS.filter(t => {
        if (filters.worker_id && t.worker_id !== filters.worker_id) return false;
        if (filters.status    && t.status    !== filters.status)    return false;
        return true;
      });
      return _mockDelay(filtered);
    }
    const params = new URLSearchParams(filters).toString();
    return _apiFetch(`/api/v1/dispatch-tasks${params ? '?' + params : ''}`);
  },

  /**
   * Fetch pipeline run log (most recent run).
   * @returns {Promise<typeof MOCK_PIPELINE_LOG>}
   */
  getPipelineLog() {
    if (USE_MOCK) return _mockDelay(MOCK_PIPELINE_LOG);
    return _apiFetch('/api/v1/pipeline-log/latest');
  },

  /**
   * Fetch dashboard summary stats.
   * @returns {Promise<typeof MOCK_SUMMARY>}
   */
  getSummary() {
    if (USE_MOCK) return _mockDelay(MOCK_SUMMARY);
    return _apiFetch('/api/v1/summary');
  },

  /**
   * Refresh all data and notify components.
   * Called by the topbar refresh button.
   * @returns {Promise<void>}
   */
  async refresh() {
    // Re-fetch summary + update timestamps + badges
    try {
      const summary = await api.getSummary();
      BurnSignal.setLastRunTime(summary.last_run_at);
      BurnSignal.updateBadge('clusters', summary.active_clusters);
      BurnSignal.updateBadge('worker',   summary.tasks_ready);
      BurnSignal.updateBadge('officer',  summary.tasks_escalation);

      // Fire a custom event that individual components can listen to
      window.dispatchEvent(new CustomEvent('bs:datarefresh', { detail: { summary } }));

      BurnSignal.toast('Data refreshed', 'success', 3000);
    } catch (err) {
      console.error('[BurnSignal] Refresh failed:', err);
      BurnSignal.toast('Refresh failed — using cached data', 'warning', 5000);
    }
  },
};

/* ================================================================
   5. Utility helpers exposed to components
================================================================ */
api.scoreToRiskTier  = scoreToRiskTier;
api.riskTierToColor  = riskTierToColor;
api.formatTime       = formatTime;

/* ================================================================
   6. Register on global namespace + boot
================================================================ */
BurnSignal.api = api;

// On load: fetch summary to hydrate badges and last-run chip
window.addEventListener('load', () => {
  api.getSummary()
    .then(summary => {
      BurnSignal.setLastRunTime(summary.last_run_at);
      BurnSignal.updateBadge('clusters', summary.active_clusters);
      BurnSignal.updateBadge('worker',   summary.tasks_ready);
      BurnSignal.updateBadge('officer',  summary.tasks_escalation);

      if (USE_MOCK) {
        BurnSignal.toast(
          'Running in demo mode — synthetic Sangrur district data',
          'info',
          5000
        );
      }
    })
    .catch(err => {
      console.error('[BurnSignal] Initial summary load failed:', err);
    });
});
