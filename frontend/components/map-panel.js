/**
 * BurnSignal — Map Panel Component
 *
 * Renders into #page-dashboard.
 * Shows:
 *   - Summary stat cards (total plots, high-risk count, active clusters,
 *     tasks ready, escalations)
 *   - Leaflet.js choropleth map with circle markers colour-coded by
 *     burn_likelihood_score
 *   - Map legend + cluster centroid overlays
 *   - Pipeline stage indicator strip
 *
 * Registered on BurnSignal.components.dashboard — called once by the
 * shell router when the dashboard page is first activated.
 *
 * Dependencies (loaded via index.html):
 *   - Leaflet 1.9.x (window.L)
 *   - api-client.js (window.BurnSignal.api)
 *   - styles/index.css (design tokens)
 */

'use strict';

(function registerDashboardComponent() {

  /* ------------------------------------------------------------------
     Template: full dashboard HTML injected into #page-dashboard
  ------------------------------------------------------------------ */
  function buildTemplate() {
    return /* html */`
      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-header__title">District Dashboard</h1>
          <p class="page-header__subtitle" id="dash-subtitle">
            Pilot district · Sangrur, Punjab · 72-hour burn-likelihood window
          </p>
        </div>
        <div class="flex items-center gap-3" style="flex-wrap:wrap;">
          <span id="dash-mode-chip" class="badge badge--unknown" aria-live="polite"></span>
          <span id="dash-threshold-chip"
                class="badge badge--moderate"
                title="Plots at or above this score are clustered and dispatched">
            Threshold ≥ 0.60
          </span>
        </div>
      </div>

      <!-- ── SUMMARY STAT CARDS ─────────────────────────────────── -->
      <div class="grid-4 mb-6" role="region" aria-label="Summary statistics">

        <div class="stat-card" style="--accent-color:var(--color-primary-500);" id="stat-total">
          <div class="card__header">
            <span class="card__title">Plots Scored</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-text-tertiary)" stroke-width="2"
                 stroke-linecap="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <div class="card__value skeleton skeleton--text" id="stat-total-val"
               style="height:2.4rem;width:4rem;" aria-label="Loading"></div>
          <div class="card__delta" id="stat-total-delta" style="color:var(--color-text-tertiary);">
            this run
          </div>
        </div>

        <div class="stat-card" style="--accent-color:var(--color-risk-high);" id="stat-highrisk">
          <div class="card__header">
            <span class="card__title">High-Risk Plots</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-risk-high)" stroke-width="2"
                 stroke-linecap="round" aria-hidden="true">
              <path d="M12 2C12 2 8 6 8 12a4 4 0 0 0 8 0c0-2-1-4-1-4s2 2 2 5a5 5 0 0 1-10 0C7 7 12 2 12 2z"/>
            </svg>
          </div>
          <div class="card__value skeleton skeleton--text" id="stat-highrisk-val"
               style="height:2.4rem;width:4rem;" aria-label="Loading"></div>
          <div class="card__delta" id="stat-highrisk-delta">score ≥ 0.60</div>
        </div>

        <div class="stat-card" style="--accent-color:var(--color-chart-2);" id="stat-clusters">
          <div class="card__header">
            <span class="card__title">Active Clusters</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-chart-2)" stroke-width="2"
                 stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <circle cx="12" cy="12" r="8" opacity=".35"/>
            </svg>
          </div>
          <div class="card__value skeleton skeleton--text" id="stat-clusters-val"
               style="height:2.4rem;width:4rem;" aria-label="Loading"></div>
          <div class="card__delta" id="stat-clusters-delta">geographic hotspots</div>
        </div>

        <div class="stat-card" style="--accent-color:var(--color-status-ready);" id="stat-ready">
          <div class="card__header">
            <span class="card__title">Ready to Dispatch</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-status-ready)" stroke-width="2"
                 stroke-linecap="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="card__value skeleton skeleton--text" id="stat-ready-val"
               style="height:2.4rem;width:4rem;" aria-label="Loading"></div>
          <div class="card__delta flex items-center gap-2" id="stat-ready-delta">
            <span id="stat-escalation-count"
                  style="color:var(--color-risk-critical);font-weight:600;">0</span>
            <span style="color:var(--color-text-tertiary)">escalation required</span>
          </div>
        </div>

      </div><!-- /stat cards -->

      <!-- ── PIPELINE STATUS STRIP ──────────────────────────────── -->
      <div class="pipeline-status mb-6"
           role="region"
           aria-label="Current pipeline run stage status"
           id="pipeline-strip">
        <!-- populated by JS -->
        <div class="skeleton skeleton--text" style="width:100%;height:32px;" aria-hidden="true"></div>
      </div>

      <!-- ── MAP + LEGEND ───────────────────────────────────────── -->
      <div class="panel mb-6" role="region" aria-label="Plot risk heatmap">

        <div class="panel__header">
          <span class="panel__title">Plot Burn-Likelihood Map</span>
          <div class="flex items-center gap-3">
            <!-- Layer toggle -->
            <div class="flex items-center gap-2" role="group" aria-label="Map layer controls">
              <button id="btn-layer-scores"
                      class="btn btn--sm btn--primary"
                      aria-pressed="true"
                      title="Show individual plot scores">
                Scores
              </button>
              <button id="btn-layer-clusters"
                      class="btn btn--sm btn--secondary"
                      aria-pressed="false"
                      title="Show cluster centroids only">
                Clusters
              </button>
            </div>
          </div>
        </div>

        <div style="position:relative;">
          <!-- Leaflet map mount -->
          <div id="bs-map"
               class="map-container"
               aria-label="Interactive map of Sangrur district showing farm plot burn-likelihood scores. Use arrow keys to pan, +/- to zoom."
               role="img"
               tabindex="0"
               style="height:440px;">
          </div>

          <!-- District label overlay -->
          <div class="map-overlay-badge" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"/>
            </svg>
            Sangrur District · Pilot Area
          </div>

          <!-- Map legend -->
          <div class="map-legend" role="note" aria-label="Map legend: risk level colour key">
            <div class="map-legend__title">Burn Likelihood</div>
            <div class="map-legend__item">
              <div class="map-legend__swatch" style="background:#ef4444;"></div>
              Critical ≥ 0.80
            </div>
            <div class="map-legend__item">
              <div class="map-legend__swatch" style="background:#f97316;"></div>
              High 0.65–0.79
            </div>
            <div class="map-legend__item">
              <div class="map-legend__swatch" style="background:#eab308;"></div>
              Moderate 0.50–0.64
            </div>
            <div class="map-legend__item">
              <div class="map-legend__swatch" style="background:#22c55e;"></div>
              Low &lt; 0.50
            </div>
            <div class="map-legend__item" style="margin-top:var(--space-2);padding-top:var(--space-2);border-top:1px solid var(--color-border-subtle);">
              <div class="map-legend__swatch" style="background:rgba(56,189,248,0.3);border:2px dashed #38bdf8;"></div>
              Cluster boundary
            </div>
          </div>
        </div>

      </div><!-- /map panel -->

      <!-- ── SCORE TABLE (top at-risk plots) ───────────────────── -->
      <div class="panel" role="region" aria-label="Top at-risk plots table">
        <div class="panel__header">
          <span class="panel__title">At-Risk Plots — Current Window</span>
          <a href="#clusters"
             id="dash-view-clusters"
             class="btn btn--ghost btn--sm"
             aria-label="View all clusters">
            View clusters →
          </a>
        </div>
        <div class="panel__body" style="padding:0;">
          <div class="table-container">
            <table id="score-table" aria-label="Farm plots sorted by burn likelihood score">
              <thead>
                <tr>
                  <th scope="col">Plot ID</th>
                  <th scope="col">Farmer</th>
                  <th scope="col">Block</th>
                  <th scope="col" class="sortable sort-desc" id="th-score" aria-sort="descending">Score</th>
                  <th scope="col">Risk</th>
                  <th scope="col">Residue Index</th>
                  <th scope="col">Days Since Harvest</th>
                  <th scope="col">Cluster</th>
                  <th scope="col">Window Closes</th>
                </tr>
              </thead>
              <tbody id="score-table-body">
                <!-- Skeleton rows -->
                ${Array.from({ length: 6 }, () => `
                  <tr aria-hidden="true">
                    ${Array.from({ length: 9 }, () =>
                      `<td><div class="skeleton skeleton--text" style="height:14px;"></div></td>`
                    ).join('')}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div><!-- /score table -->
    `;
  }

  /* ------------------------------------------------------------------
     Pipeline stage renderer
  ------------------------------------------------------------------ */
  function renderPipelineStrip(stages) {
    const stageLabels = {
      ingestion_satellite:  'Satellite Ingest',
      loader_socioeconomic: 'Socioeconomic',
      feature_pipeline:     'Features',
      scoring_service:      'Scoring',
      clustering_agent:     'Clustering',
      coordination_agent:   'Coordination',
      dispatch_service:     'Dispatch',
    };

    const iconCheck = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
    const iconX     = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const iconDot   = `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg>`;

    return stages.map((s, i) => {
      let cls = '', icon = String(i + 1);
      if (s.status === 'success') { cls = 'pipeline-stage--complete'; icon = iconCheck; }
      if (s.status === 'running') { cls = 'pipeline-stage--running';  icon = iconDot; }
      if (s.status === 'failed')  { cls = 'pipeline-stage--failed';   icon = iconX; }

      const label   = stageLabels[s.stage] || s.stage;
      const elapsed = s.start_time && s.end_time
        ? ` · ${Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60_000)}m`
        : '';
      const title = `${label}: ${s.status}${elapsed}`;

      return `
        <div class="pipeline-stage ${cls}" title="${title}" aria-label="${title}">
          <div class="pipeline-stage__dot">${icon}</div>
          <span class="pipeline-stage__label">${label}</span>
        </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------------
     Score table row renderer
  ------------------------------------------------------------------ */
  function renderScoreRows(plots) {
    const api = BurnSignal.api;

    // Sort descending by score, cap at 12 rows in the dashboard view
    const sorted = [...plots]
      .sort((a, b) => b.burn_likelihood_score - a.burn_likelihood_score)
      .slice(0, 12);

    return sorted.map(p => {
      const tier    = api.scoreToRiskTier(p.burn_likelihood_score);
      const color   = api.riskTierToColor(tier);
      const scorePC = Math.round(p.burn_likelihood_score * 100);
      const conf    = p.feature_confidence === 'degraded'
        ? `<span title="Stale satellite imagery — score may be less accurate"
                style="font-size:var(--text-xs);color:var(--color-risk-moderate);margin-left:4px;">⚠</span>`
        : '';
      const cluster = p.cluster_id
        ? `<a href="#clusters" class="badge badge--${tier}" style="text-decoration:none;">${p.cluster_id}</a>`
        : `<span style="color:var(--color-text-tertiary);font-size:var(--text-xs);">—</span>`;

      return `
        <tr>
          <td>
            <span class="font-mono text-sm">${p.plot_id}</span>
          </td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${p.farmer_name}">${p.farmer_name}</td>
          <td style="color:var(--color-text-secondary);font-size:var(--text-sm);">${p.block_code}</td>
          <td>
            <div class="score-bar" role="meter"
                 aria-valuenow="${scorePC}"
                 aria-valuemin="0" aria-valuemax="100"
                 aria-label="Burn likelihood score: ${scorePC}%">
              <span class="score-cell" style="color:${color};min-width:36px;">${p.burn_likelihood_score.toFixed(2)}</span>
              <div class="score-bar__track" aria-hidden="true">
                <div class="score-bar__fill"
                     style="width:${scorePC}%;--fill-color:${color};"></div>
              </div>
            </div>
            ${conf}
          </td>
          <td><span class="badge badge--${tier}" aria-label="Risk level: ${tier}">${tier}</span></td>
          <td style="font-family:var(--font-mono);font-size:var(--text-sm);color:var(--color-text-secondary);">
            ${p.residue_index != null ? p.residue_index.toFixed(2) : '—'}
          </td>
          <td style="font-size:var(--text-sm);color:var(--color-text-secondary);">
            ${p.days_since_harvest} days
          </td>
          <td>${cluster}</td>
          <td style="font-size:var(--text-sm);color:var(--color-text-tertiary);"
              title="${p.scoring_window_end}">
            ${api.formatTime(p.scoring_window_end, 'relative')}
          </td>
        </tr>`;
    }).join('');
  }

  /* ------------------------------------------------------------------
     Leaflet map initialisation
  ------------------------------------------------------------------ */
  function initMap(plots, clusters) {
    const api = BurnSignal.api;

    // District centre: Sangrur, Punjab
    const map = L.map('bs-map', {
      center:          [30.232, 75.854],
      zoom:            11,
      zoomControl:     true,
      attributionControl: true,
      preferCanvas:    true,   // better perf for many circle markers
    });

    // Base tile layers (100% keyless, public, zero secret footprint)
    const darkCanvas = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri, DeLorme, NAVTEQ',
        maxZoom: 16,
      }
    );

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri, Maxar, Earthstar Geographics',
        maxZoom: 18,
      }
    );

    const osm = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    );

    // Default to Esri Dark Canvas (clean dark aesthetic, keyless, zero watermarks)
    darkCanvas.addTo(map);

    const baseMaps = {
      "Dark Canvas": darkCanvas,
      "Satellite": satellite,
      "Street Map": osm,
    };
    L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);

    // Layer groups for toggle
    const scoresLayer   = L.layerGroup();
    const clustersLayer = L.layerGroup();

    // ── Plot score markers ──────────────────────────────────────
    plots.forEach(p => {
      const tier   = api.scoreToRiskTier(p.burn_likelihood_score);
      const color  = api.riskTierToColor(tier);
      const radius = 6 + p.burn_likelihood_score * 10; // 6–16px

      const circle = L.circleMarker([p.lat, p.lon], {
        radius:      radius,
        fillColor:   color,
        fillOpacity: 0.75,
        color:       color,
        weight:      1.5,
        opacity:     0.9,
      });

      const scorePC  = Math.round(p.burn_likelihood_score * 100);
      const confNote = p.feature_confidence === 'degraded'
        ? '<br><span style="color:#eab308;">⚠ Stale imagery — score may be less accurate</span>'
        : '';

      circle.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:200px;">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px;color:#f1f5f9;">
            ${p.farmer_name}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
            Plot ${p.plot_id} · Block ${p.block_code}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">Burn likelihood</span>
            <strong style="color:${color};">${p.burn_likelihood_score.toFixed(2)} (${scorePC}%)</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">Residue index</span>
            <span style="color:#f1f5f9;">${p.residue_index != null ? p.residue_index.toFixed(2) : '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">Days since harvest</span>
            <span style="color:#f1f5f9;">${p.days_since_harvest}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">Area</span>
            <span style="color:#f1f5f9;">${p.plot_area_ha} ha</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:#94a3b8;">Cluster</span>
            <span style="color:#f1f5f9;">${p.cluster_id || '—'}</span>
          </div>
          ${confNote}
        </div>
      `, {
        className:   'bs-popup',
        maxWidth:    240,
      });

      scoresLayer.addLayer(circle);
    });

    // ── Cluster overlays ────────────────────────────────────────
    clusters.forEach(c => {
      const tier  = api.scoreToRiskTier(c.mean_score);
      const color = api.riskTierToColor(tier);

      // Dashed bounding circle (~500m radius = CLUSTER_EPS_METERS default)
      const ring = L.circle([c.centroid_lat, c.centroid_lon], {
        radius:      500,
        color:       '#38bdf8',
        weight:      1.5,
        dashArray:   '6,4',
        fillColor:   '#38bdf8',
        fillOpacity: 0.07,
      });

      // Centroid label marker
      const icon = L.divIcon({
        className: '',
        html: `<div style="
            background:${color};
            color:#fff;
            font-family:Inter,sans-serif;
            font-size:10px;
            font-weight:700;
            padding:3px 7px;
            border-radius:12px;
            white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,0.6);
            border:1px solid rgba(255,255,255,0.2);">
          ${c.label}
        </div>`,
        iconAnchor: [0, 0],
      });
      const centroidMarker = L.marker([c.centroid_lat, c.centroid_lon], { icon });

      centroidMarker.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:200px;">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px;color:#f1f5f9;">
            ${c.label}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">${c.cluster_id}</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">Mean score</span>
            <strong style="color:${color};">${c.mean_score.toFixed(2)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">Plot count</span>
            <span style="color:#f1f5f9;">${c.plot_count}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#94a3b8;">KVK Worker</span>
            <span style="color:#f1f5f9;">${c.worker_name || '⚠ Unassigned'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:#94a3b8;">Equipment</span>
            <span style="color:#f1f5f9;">${c.equipment_type || '—'}</span>
          </div>
        </div>
      `, { className: 'bs-popup', maxWidth: 240 });

      clustersLayer.addLayer(ring);
      clustersLayer.addLayer(centroidMarker);
    });

    // Both layers on by default
    scoresLayer.addTo(map);
    clustersLayer.addTo(map);

    // ── Layer toggle buttons ────────────────────────────────────
    const btnScores   = document.getElementById('btn-layer-scores');
    const btnClusters = document.getElementById('btn-layer-clusters');
    let showScores   = true;
    let showClusters = true;

    btnScores.addEventListener('click', () => {
      showScores = !showScores;
      showScores ? scoresLayer.addTo(map) : map.removeLayer(scoresLayer);
      btnScores.setAttribute('aria-pressed', String(showScores));
      btnScores.classList.toggle('btn--primary',   showScores);
      btnScores.classList.toggle('btn--secondary', !showScores);
    });

    btnClusters.addEventListener('click', () => {
      showClusters = !showClusters;
      showClusters ? clustersLayer.addTo(map) : map.removeLayer(clustersLayer);
      btnClusters.setAttribute('aria-pressed', String(showClusters));
      btnClusters.classList.toggle('btn--primary',   showClusters);
      btnClusters.classList.toggle('btn--secondary', !showClusters);
    });

    // Leaflet popup dark theme injection
    const style = document.createElement('style');
    style.textContent = `
      .bs-popup .leaflet-popup-content-wrapper {
        background: #1a2236;
        border: 1px solid #2a3d5a;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        color: #f1f5f9;
      }
      .bs-popup .leaflet-popup-tip { background: #1a2236; }
      .bs-popup .leaflet-popup-close-button { color: #94a3b8 !important; }
      .leaflet-control-zoom a {
        background: #1a2236 !important;
        color: #94a3b8 !important;
        border-color: #2a3d5a !important;
      }
      .leaflet-control-zoom a:hover {
        background: #2a3d5a !important;
        color: #f1f5f9 !important;
      }
      .leaflet-bar { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important; }
      .leaflet-control-layers {
        background: #1a2236 !important;
        border: 1px solid #2a3d5a !important;
        border-radius: 8px !important;
        color: #f1f5f9 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        font-family: Inter, sans-serif !important;
        font-size: 11px !important;
        padding: 6px 10px !important;
      }
      .leaflet-control-layers-toggle {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23f1f5f9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 2 7 12 12 22 7 12 2'/%3E%3Cpolyline points='2 17 12 22 22 17'/%3E%3Cpolyline points='2 12 12 17 22 12'/%3E%3C/svg%3E") !important;
        background-size: 20px 20px !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }
      .leaflet-control-layers label {
        color: #cbd5e1 !important;
        margin-bottom: 3px;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    // Keyboard navigation on the map div
    const mapEl = document.getElementById('bs-map');
    mapEl.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowUp')    map.panBy([0, -50 * step]);
      if (e.key === 'ArrowDown')  map.panBy([0,  50 * step]);
      if (e.key === 'ArrowLeft')  map.panBy([-50 * step, 0]);
      if (e.key === 'ArrowRight') map.panBy([ 50 * step, 0]);
      if (e.key === '+' || e.key === '=') map.zoomIn();
      if (e.key === '-') map.zoomOut();
    });

    return map;
  }

  /* ------------------------------------------------------------------
     SVG Vector Map Fallback (renders when Leaflet is unavailable/offline)
  ------------------------------------------------------------------ */
  function renderSvgMapFallback(plots, clusters) {
    const container = document.getElementById('bs-map');
    if (!container) return;
    const api = BurnSignal.api;

    const validPlots = (plots || []).filter(p => typeof p.lat === 'number' && typeof p.lon === 'number');
    const lats = validPlots.map(p => p.lat);
    const lons = validPlots.map(p => p.lon);

    const minLat = lats.length ? Math.min(...lats) - 0.03 : 30.12;
    const maxLat = lats.length ? Math.max(...lats) + 0.03 : 30.36;
    const minLon = lons.length ? Math.min(...lons) - 0.04 : 75.75;
    const maxLon = lons.length ? Math.max(...lons) + 0.04 : 75.95;

    const width = 800;
    const height = 480;
    const pad = 50;

    function projectX(lon) {
      if (maxLon === minLon) return width / 2;
      return pad + ((lon - minLon) / (maxLon - minLon)) * (width - 2 * pad);
    }
    function projectY(lat) {
      if (maxLat === minLat) return height / 2;
      return height - pad - ((lat - minLat) / (maxLat - minLat)) * (height - 2 * pad);
    }

    const clusterSvg = (clusters || []).map(c => {
      const cx = projectX(c.centroid_lon);
      const cy = projectY(c.centroid_lat);
      const tier = api.scoreToRiskTier(c.mean_score);
      const color = api.riskTierToColor(tier);
      return `
        <g class="svg-cluster-marker" data-cluster-id="${c.cluster_id}">
          <circle cx="${cx}" cy="${cy}" r="48" fill="#38bdf8" fill-opacity="0.08" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="5,4" />
          <rect x="${cx - 42}" y="${cy - 22}" width="84" height="20" rx="4" fill="${color}" fill-opacity="0.9" />
          <text x="${cx}" y="${cy - 8}" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle" font-family="Inter,sans-serif">${c.label || c.cluster_id}</text>
        </g>
      `;
    }).join('');

    const plotSvg = validPlots.map(p => {
      const px = projectX(p.lon);
      const py = projectY(p.lat);
      const tier = api.scoreToRiskTier(p.burn_likelihood_score);
      const color = api.riskTierToColor(tier);
      const r = Math.round(7 + p.burn_likelihood_score * 8);
      const scorePct = Math.round(p.burn_likelihood_score * 100);
      return `
        <g class="svg-plot-node" style="cursor:pointer;" data-plot-id="${p.plot_id}" tabindex="0" role="button" aria-label="${p.farmer_name}: ${scorePct}% burn likelihood">
          <circle cx="${px}" cy="${py}" r="${r + 4}" fill="${color}" fill-opacity="0.25" />
          <circle cx="${px}" cy="${py}" r="${r}" fill="${color}" stroke="#0b1120" stroke-width="2" />
          <title>${p.farmer_name} (${p.plot_id})&#10;Burn Likelihood: ${(p.burn_likelihood_score).toFixed(2)} (${scorePct}%)&#10;Residue: ${p.residue_index != null ? p.residue_index.toFixed(2) : '—'}&#10;Block: ${p.block_code}&#10;Area: ${p.plot_area_ha} ha</title>
        </g>
      `;
    }).join('');

    container.innerHTML = `
      <div style="position:relative;width:100%;height:100%;min-height:480px;background:#0b1120;border-radius:var(--radius-xl);overflow:hidden;display:flex;flex-direction:column;">
        <div style="position:absolute;top:12px;left:16px;z-index:10;display:flex;align-items:center;gap:8px;background:rgba(15,23,42,0.88);backdrop-filter:blur(6px);padding:6px 14px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);font-size:12px;color:#94a3b8;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;"></span>
          <span style="font-weight:600;color:#f8fafc;">Sangrur Pilot Vector Map</span> · ${validPlots.length} plots · ${(clusters || []).length} clusters
        </div>

        <div id="svg-map-tooltip" style="display:none;position:absolute;top:12px;right:16px;z-index:20;background:#1e293b;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.6);min-width:220px;font-size:12px;color:#f1f5f9;">
        </div>

        <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;flex:1;touch-action:none;" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="${width}" height="${height}" fill="#0b1120" />
          <rect width="${width}" height="${height}" fill="url(#grid-pattern)" />
          <rect x="25" y="25" width="${width - 50}" height="${height - 50}" rx="12" fill="none" stroke="rgba(56, 189, 248, 0.15)" stroke-width="1.5" stroke-dasharray="6,6" />

          ${clusterSvg}
          ${plotSvg}
        </svg>

        <div style="position:absolute;bottom:12px;right:16px;z-index:10;background:rgba(15,23,42,0.9);backdrop-filter:blur(6px);padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);font-size:11px;display:flex;gap:12px;align-items:center;">
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--color-risk-critical, #ef4444);"></span> Critical (&ge;0.75)</div>
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--color-risk-high, #f97316);"></span> High (0.60-0.74)</div>
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--color-risk-moderate, #eab308);"></span> Moderate (0.40-0.59)</div>
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--color-risk-low, #22c55e);"></span> Low (&lt;0.40)</div>
        </div>
      </div>
    `;

    // Add click listeners to plot nodes to show detail card
    const tooltip = document.getElementById('svg-map-tooltip');
    container.querySelectorAll('.svg-plot-node').forEach(node => {
      const pid = node.dataset.plotId;
      const p = validPlots.find(x => x.plot_id === pid);
      if (!p || !tooltip) return;
      const tier = api.scoreToRiskTier(p.burn_likelihood_score);
      const color = api.riskTierToColor(tier);
      const scorePct = Math.round(p.burn_likelihood_score * 100);

      node.addEventListener('click', (e) => {
        e.stopPropagation();
        tooltip.style.display = 'block';
        tooltip.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="font-size:13px;color:#f8fafc;">${p.farmer_name}</strong>
            <button onclick="document.getElementById('svg-map-tooltip').style.display='none'" style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:0;font-size:14px;">✕</button>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Plot ${p.plot_id} · Block ${p.block_code}</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="color:#94a3b8;">Burn likelihood:</span>
            <strong style="color:${color};">${p.burn_likelihood_score.toFixed(2)} (${scorePct}%)</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="color:#94a3b8;">Residue index:</span>
            <span>${p.residue_index != null ? p.residue_index.toFixed(2) : '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="color:#94a3b8;">Days since harvest:</span>
            <span>${p.days_since_harvest}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#94a3b8;">Area:</span>
            <span>${p.plot_area_ha} ha</span>
          </div>
        `;
      });
    });
  }

  /* ------------------------------------------------------------------
     Main init — called once by the shell router
  ------------------------------------------------------------------ */
  async function initDashboard(containerEl) {
    if (!containerEl) return;

    // 1. Inject template
    containerEl.innerHTML = buildTemplate();

    // Remove aria-busy now that real content is injected
    containerEl.removeAttribute('aria-busy');

    // 2. Fetch data in parallel
    const [summary, plots, clusters, pipelineLog] = await Promise.all([
      BurnSignal.api.getSummary(),
      BurnSignal.api.getPlotScores(),
      BurnSignal.api.getClusters(),
      BurnSignal.api.getPipelineLog(),
    ]);

    // 3. Demo mode chip
    const modeChip = document.getElementById('dash-mode-chip');
    if (modeChip) {
      modeChip.textContent = BurnSignal.api.isMock ? '⬡ Demo data' : '● Live data';
      modeChip.className   = `badge ${BurnSignal.api.isMock ? 'badge--unknown' : 'badge--ready'}`;
    }

    // 4. Populate stat cards (replace skeletons)
    function setStat(id, value, extraClass = '') {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = `card__value ${extraClass}`;
      el.style     = '';
      el.textContent = value;
      el.removeAttribute('aria-label');
    }

    setStat('stat-total-val',    summary.total_plots_scored);
    setStat('stat-highrisk-val', summary.plots_above_threshold, 'text-accent');
    setStat('stat-clusters-val', summary.active_clusters);
    setStat('stat-ready-val',    summary.tasks_ready);

    const escalEl = document.getElementById('stat-escalation-count');
    if (escalEl) escalEl.textContent = summary.tasks_escalation;

    // 5. Pipeline strip
    const strip = document.getElementById('pipeline-strip');
    if (strip && pipelineLog.length) {
      strip.innerHTML = renderPipelineStrip(pipelineLog);
    }

    // 6. Score table
    const tbody = document.getElementById('score-table-body');
    if (tbody) {
      const aboveThreshold = plots.filter(p => p.burn_likelihood_score >= 0.40);
      tbody.innerHTML = renderScoreRows(aboveThreshold);
    }

    // 7. View-clusters link routing
    const viewLink = document.getElementById('dash-view-clusters');
    if (viewLink) {
      viewLink.addEventListener('click', (e) => {
        e.preventDefault();
        history.pushState(null, '', '#clusters');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    }

    // 8. Init map (Leaflet if available, graceful SVG vector fallback)
    if (typeof L !== 'undefined') {
      try {
        initMap(plots, clusters);
      } catch (err) {
        console.warn('Leaflet init error, rendering SVG fallback:', err);
        renderSvgMapFallback(plots, clusters);
      }
    } else {
      renderSvgMapFallback(plots, clusters);
    }

    // 9. Listen for data refresh events from the topbar
    window.addEventListener('bs:datarefresh', async () => {
      const [freshPlots, freshClusters, freshLog, freshSummary] = await Promise.all([
        BurnSignal.api.getPlotScores(),
        BurnSignal.api.getClusters(),
        BurnSignal.api.getPipelineLog(),
        BurnSignal.api.getSummary(),
      ]);

      if (document.getElementById('score-table-body')) {
        document.getElementById('score-table-body').innerHTML =
          renderScoreRows(freshPlots.filter(p => p.burn_likelihood_score >= 0.40));
      }
      if (strip && freshLog.length) {
        strip.innerHTML = renderPipelineStrip(freshLog);
      }
      setStat('stat-total-val',    freshSummary.total_plots_scored);
      setStat('stat-highrisk-val', freshSummary.plots_above_threshold, 'text-accent');
      setStat('stat-clusters-val', freshSummary.active_clusters);
      setStat('stat-ready-val',    freshSummary.tasks_ready);
      if (escalEl) escalEl.textContent = freshSummary.tasks_escalation;
    }, { once: false });
  }

  /* ------------------------------------------------------------------
     Register component
  ------------------------------------------------------------------ */
  BurnSignal.components = BurnSignal.components || {};
  BurnSignal.components['dashboard'] = initDashboard;

})();
