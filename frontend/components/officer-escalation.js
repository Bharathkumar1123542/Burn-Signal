/**
 * BurnSignal — Officer Escalation Component
 *
 * Renders into #page-officer.
 *
 * Audience: District Agriculture Officer
 *
 * Shows (per architecture.md §9.4 privacy rules):
 *   - Escalation summary banner (counts only — no farmer PII at top level)
 *   - Escalation cluster cards — clusters where no KVK worker is mapped
 *     OR no equipment slot could be attached (status = 'escalation_required')
 *   - Per-cluster escalated dispatch tasks (minimal PII: farmer name + plot ID
 *     visible here per implementation.md §5.3 — officer needs this to act)
 *   - Equipment gap panel (which blocks have no available inventory)
 *   - Pollution Control Board view — fully anonymised cluster heatmap table
 *     (no dispatch_task join, no PII — compliant with architecture.md §9.4)
 *   - Acknowledge / note action per escalation cluster
 *
 * Registered on BurnSignal.components.officer
 *
 * Dependencies: api-client.js (BurnSignal.api), styles/index.css
 */

'use strict';

(function registerOfficerComponent() {

  /* ----------------------------------------------------------------
     Component-scoped styles
  ---------------------------------------------------------------- */
  const STYLES = `
    /* ── Escalation cluster card ────────────────────────────── */
    .escal-card {
      background: var(--color-bg-surface);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: var(--radius-xl);
      overflow: hidden;
      transition: box-shadow var(--duration-base) var(--ease-out);
    }
    .escal-card:hover { box-shadow: var(--shadow-glow-critical); }

    .escal-card__accent {
      height: 3px;
      background: linear-gradient(90deg, var(--color-risk-critical), var(--color-risk-high));
    }

    .escal-card__header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: var(--space-5) var(--space-6);
      gap: var(--space-4); flex-wrap: wrap;
    }

    .escal-card__title-wrap { flex: 1; min-width: 200px; }
    .escal-card__title {
      font-size: var(--text-base); font-weight: var(--weight-semibold);
      color: var(--color-text-primary); margin-bottom: var(--space-1);
    }
    .escal-card__sub {
      font-size: var(--text-xs); color: var(--color-text-tertiary);
      font-family: var(--font-mono);
    }
    .escal-card__badges { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }

    .escal-card__meta {
      display: flex; align-items: center; gap: var(--space-5); flex-wrap: wrap;
    }
    .escal-meta-item { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .escal-meta-item__label {
      font-size: var(--text-xs); color: var(--color-text-tertiary);
      text-transform: uppercase; letter-spacing: var(--tracking-wide);
    }
    .escal-meta-item__value {
      font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text-primary);
    }

    /* Gap indicators */
    .gap-item {
      display: flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      font-size: var(--text-sm);
    }
    .gap-item--critical {
      background: rgba(239,68,68,0.07);
      border-color: rgba(239,68,68,0.2);
    }
    .gap-item--warn {
      background: rgba(234,179,8,0.07);
      border-color: rgba(234,179,8,0.2);
    }
    .gap-item__label { color: var(--color-text-secondary); }
    .gap-item__value { font-weight: var(--weight-semibold); margin-left: auto; }

    /* ── Escalated tasks mini-table ─────────────────────────── */
    .escal-tasks-section {
      border-top: 1px solid var(--color-border-subtle);
      padding: var(--space-4) var(--space-6);
      background: var(--color-bg-elevated);
    }
    .escal-tasks-label {
      font-size: var(--text-xs); font-weight: var(--weight-semibold);
      color: var(--color-text-tertiary); text-transform: uppercase;
      letter-spacing: var(--tracking-wide); margin-bottom: var(--space-3);
    }

    /* ── Acknowledge banner ──────────────────────────────────── */
    .ack-banner {
      background: rgba(34,197,94,0.07);
      border: 1px solid rgba(34,197,94,0.2);
      border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-4);
      display: flex; align-items: center; gap: var(--space-3);
      font-size: var(--text-sm); color: var(--color-status-ready);
    }

    /* ── PCB view table ─────────────────────────────────────── */
    .pcb-section {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      overflow: hidden;
      margin-top: var(--space-8);
    }
    .pcb-header {
      padding: var(--space-4) var(--space-6);
      border-bottom: 1px solid var(--color-border-subtle);
      background: var(--color-bg-elevated);
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: var(--space-3);
    }
    .pcb-privacy-note {
      font-size: var(--text-xs); color: var(--color-text-tertiary);
      display: flex; align-items: center; gap: var(--space-1);
    }

    /* ── Summary tiles ──────────────────────────────────────── */
    .officer-stat {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-5) var(--space-6);
      display: flex; align-items: center; gap: var(--space-4);
    }
    .officer-stat__icon-wrap {
      width: 44px; height: 44px; border-radius: var(--radius-lg);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .officer-stat__label {
      font-size: var(--text-xs); color: var(--color-text-tertiary);
      text-transform: uppercase; letter-spacing: var(--tracking-wide); margin-bottom: var(--space-1);
    }
    .officer-stat__value {
      font-size: var(--text-2xl); font-weight: var(--weight-bold);
      line-height: 1; color: var(--color-text-primary);
    }

    /* ── Acknowledged state on card ─────────────────────────── */
    .escal-card--acked { opacity: 0.6; }
    .escal-card--acked .escal-card__accent {
      background: var(--color-status-delivered);
    }

    /* ── All-clear state ────────────────────────────────────── */
    .officer-all-clear {
      text-align: center; padding: var(--space-12) var(--space-6);
      color: var(--color-text-tertiary);
    }

    /* ── Section divider label ──────────────────────────────── */
    .section-divider {
      font-size: var(--text-xs); font-weight: var(--weight-semibold);
      color: var(--color-text-tertiary); text-transform: uppercase;
      letter-spacing: var(--tracking-widest);
      padding: var(--space-2) 0 var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
      margin-bottom: var(--space-4);
    }
  `;

  /* ----------------------------------------------------------------
     Inject styles once
  ---------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('bs-officer-styles')) return;
    const el = document.createElement('style');
    el.id = 'bs-officer-styles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  /* ----------------------------------------------------------------
     In-memory acknowledged-cluster tracker (session only)
  ---------------------------------------------------------------- */
  const _ackedClusters = new Set();

  /* ----------------------------------------------------------------
     Build escalation gap indicators for a cluster
  ---------------------------------------------------------------- */
  function buildGapItems(cluster) {
    const items = [];

    if (!cluster.worker_name) {
      items.push(`
        <div class="gap-item gap-item--critical">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="var(--color-risk-critical)" stroke-width="2"
               stroke-linecap="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="23" y1="11" x2="17" y2="11"/>
          </svg>
          <span class="gap-item__label">KVK worker</span>
          <span class="gap-item__value" style="color:var(--color-risk-critical);">Unmapped</span>
        </div>`);
    }

    if (!cluster.equipment_type) {
      items.push(`
        <div class="gap-item gap-item--warn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="var(--color-risk-moderate)" stroke-width="2"
               stroke-linecap="round" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
          <span class="gap-item__label">Equipment slot</span>
          <span class="gap-item__value" style="color:var(--color-risk-moderate);">None within 15 km</span>
        </div>`);
    }

    if (!cluster.slot_start && cluster.worker_name) {
      items.push(`
        <div class="gap-item gap-item--warn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="var(--color-risk-moderate)" stroke-width="2"
               stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="gap-item__label">Slot timing</span>
          <span class="gap-item__value" style="color:var(--color-risk-moderate);">No slot in window</span>
        </div>`);
    }

    return items.join('');
  }

  /* ----------------------------------------------------------------
     Build a single escalation cluster card
  ---------------------------------------------------------------- */
  function buildEscalCard(cluster, escalTasks, plots) {
    const api      = BurnSignal.api;
    const tier     = api.scoreToRiskTier(cluster.mean_score);
    const color    = api.riskTierToColor(tier);
    const acked    = _ackedClusters.has(cluster.cluster_id);
    const cardId   = `escal-card-${cluster.cluster_id}`;
    const diffHrs  = cluster.effective_deadline
      ? (new Date(cluster.effective_deadline) - Date.now()) / 3_600_000
      : null;

    // Deadline urgency
    let deadlineEl = '—';
    if (cluster.effective_deadline) {
      const label = api.formatTime(cluster.effective_deadline, 'relative');
      const cls   = diffHrs < 12 ? 'style="color:var(--color-risk-critical);font-weight:600;"'
                  : diffHrs < 36 ? 'style="color:var(--color-risk-moderate);font-weight:500;"'
                  : 'style="color:var(--color-text-secondary);"';
      deadlineEl  = `<span ${cls} title="${cluster.effective_deadline}">${label}</span>`;
    }

    // Escalated task rows (minimal PII per implementation.md §5.3 officer view)
    const plotMap  = Object.fromEntries(plots.map(p => [p.plot_id, p]));
    const taskRows = escalTasks.map(t => {
      const plot  = plotMap[t.plot_id];
      const ptier = api.scoreToRiskTier(plot?.burn_likelihood_score ?? 0);
      const pclr  = api.riskTierToColor(ptier);
      return `
        <tr>
          <td style="font-family:var(--font-mono);font-size:var(--text-xs);">${t.plot_id}</td>
          <td style="font-size:var(--text-sm);">${t.farmer_name}</td>
          <td>
            <span class="score-cell font-mono text-sm" style="color:${pclr};">
              ${plot?.burn_likelihood_score?.toFixed(2) ?? '—'}
            </span>
          </td>
          <td><span class="badge badge--${ptier}">${ptier}</span></td>
          <td style="font-size:var(--text-sm);color:var(--color-text-secondary);">
            ${plot?.plot_area_ha ?? '—'} ha
          </td>
          <td>
            <span class="badge badge--escalation">
              <span class="badge__dot" aria-hidden="true"></span>
              ${t.worker_id ? 'No equipment' : 'No worker'}
            </span>
          </td>
        </tr>`;
    }).join('');

    return `
      <article class="escal-card ${acked ? 'escal-card--acked' : ''}"
               id="${cardId}"
               aria-label="Escalation cluster: ${cluster.label}">

        <div class="escal-card__accent" aria-hidden="true"></div>

        <div class="escal-card__header">

          <div class="escal-card__title-wrap">
            <div class="escal-card__title">${cluster.label}</div>
            <div class="escal-card__sub">
              ${cluster.cluster_id} · Block ${cluster.block_code}
              · ${cluster.plot_count} plot${cluster.plot_count !== 1 ? 's' : ''}
              · Mean score <strong style="color:${color};">${cluster.mean_score.toFixed(2)}</strong>
            </div>
            <div class="escal-card__badges">
              <span class="badge badge--escalation">
                <span class="badge__dot" aria-hidden="true"></span>Escalation required
              </span>
              <span class="badge badge--${tier}" aria-label="Risk tier: ${tier}">${tier}</span>
              ${acked
                ? `<span class="badge badge--delivered">
                     <span class="badge__dot" aria-hidden="true"></span>Acknowledged
                   </span>`
                : ''}
            </div>
          </div>

          <div class="escal-card__meta">

            <div class="escal-meta-item">
              <span class="escal-meta-item__label">Window closes</span>
              <span class="escal-meta-item__value">${deadlineEl}</span>
            </div>

            <div class="escal-meta-item">
              <span class="escal-meta-item__label">Centroid</span>
              <span class="escal-meta-item__value font-mono" style="font-size:var(--text-xs);">
                ${cluster.centroid_lat.toFixed(3)}°N,
                ${cluster.centroid_lon.toFixed(3)}°E
              </span>
            </div>

            ${!acked
              ? `<button
                   class="btn btn--secondary btn--sm"
                   data-ack-cluster="${cluster.cluster_id}"
                   aria-label="Acknowledge escalation for cluster ${cluster.label}">
                   Acknowledge
                 </button>`
              : `<span class="text-xs text-tertiary">Noted</span>`
            }

          </div>

        </div><!-- /header -->

        <!-- Gap indicators -->
        <div style="padding: var(--space-3) var(--space-6); display:flex; gap:var(--space-3); flex-wrap:wrap;">
          <span style="font-size:var(--text-xs);font-weight:600;color:var(--color-text-tertiary);
                       text-transform:uppercase;letter-spacing:var(--tracking-wide);
                       align-self:center;">Gaps:</span>
          ${buildGapItems(cluster)}
        </div>

        <!-- Recommended actions -->
        <div style="padding: 0 var(--space-6) var(--space-4);
                    display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:center;">
          <span style="font-size:var(--text-xs);color:var(--color-text-tertiary);">Actions:</span>
          ${!cluster.worker_name
            ? `<button class="btn btn--secondary btn--sm"
                       aria-label="Request KVK worker assignment for ${cluster.label}"
                       onclick="BurnSignal.toast('In production: opens KVK worker roster to assign jurisdiction for block ${cluster.block_code}', 'info', 5000)">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                   <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                   <circle cx="8.5" cy="7" r="4"/>
                   <line x1="20" y1="8" x2="20" y2="14"/>
                   <line x1="23" y1="11" x2="17" y2="11"/>
                 </svg>
                 Assign worker
               </button>`
            : ''}
          ${!cluster.equipment_type
            ? `<button class="btn btn--secondary btn--sm"
                       aria-label="Request equipment deployment to ${cluster.label}"
                       onclick="BurnSignal.toast('In production: opens equipment request form pre-filled for block ${cluster.block_code}', 'info', 5000)">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                   <rect x="2" y="7" width="20" height="14" rx="2"/>
                   <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                   <line x1="12" y1="12" x2="12" y2="16"/>
                   <line x1="10" y1="14" x2="14" y2="14"/>
                 </svg>
                 Request equipment
               </button>`
            : ''}
          <a href="#clusters"
             class="btn btn--ghost btn--sm"
             data-go-clusters
             aria-label="View ${cluster.label} in the full cluster list">
            View cluster →
          </a>
        </div>

        <!-- Escalated tasks table -->
        ${escalTasks.length > 0
          ? `<div class="escal-tasks-section">
               <div class="escal-tasks-label">
                 Affected farmers (${escalTasks.length}) — pending officer action
               </div>
               <div class="table-container">
                 <table aria-label="Escalated dispatch tasks for cluster ${cluster.label}">
                   <thead>
                     <tr>
                       <th scope="col">Plot ID</th>
                       <th scope="col">Farmer</th>
                       <th scope="col">Score</th>
                       <th scope="col">Risk</th>
                       <th scope="col">Area</th>
                       <th scope="col">Reason</th>
                     </tr>
                   </thead>
                   <tbody>${taskRows}</tbody>
                 </table>
               </div>
             </div>`
          : ''}

      </article>`;
  }

  /* ----------------------------------------------------------------
     Pollution Control Board anonymised table
     (cluster-level only — no dispatch_task join, no PII)
  ---------------------------------------------------------------- */
  function buildPCBTable(clusters) {
    const api   = BurnSignal.api;
    const rows  = [...clusters]
      .sort((a, b) => b.mean_score - a.mean_score)
      .map(c => {
        const tier  = api.scoreToRiskTier(c.mean_score);
        const color = api.riskTierToColor(tier);
        return `
          <tr>
            <td style="font-family:var(--font-mono);font-size:var(--text-xs);">${c.cluster_id}</td>
            <td style="font-size:var(--text-sm);">${c.label}</td>
            <td style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-text-tertiary);">
              ${c.centroid_lat.toFixed(4)}°N, ${c.centroid_lon.toFixed(4)}°E
            </td>
            <td>
              <div class="score-bar" role="meter"
                   aria-valuenow="${Math.round(c.mean_score * 100)}"
                   aria-valuemin="0" aria-valuemax="100"
                   aria-label="Mean score: ${c.mean_score.toFixed(2)}">
                <span class="score-cell font-mono text-sm" style="color:${color};min-width:32px;">
                  ${c.mean_score.toFixed(2)}
                </span>
                <div class="score-bar__track" style="min-width:60px;" aria-hidden="true">
                  <div class="score-bar__fill"
                       style="width:${Math.round(c.mean_score * 100)}%;--fill-color:${color};"></div>
                </div>
              </div>
            </td>
            <td><span class="badge badge--${tier}">${tier}</span></td>
            <td style="font-size:var(--text-sm);color:var(--color-text-secondary);">${c.plot_count}</td>
            <td style="font-size:var(--text-sm);color:var(--color-text-secondary);">
              ${api.formatTime(c.effective_deadline, 'relative')}
            </td>
          </tr>`;
      }).join('');

    return `
      <div class="pcb-section" role="region"
           aria-label="Pollution Control Board anonymised cluster view">

        <div class="pcb-header">
          <div>
            <span class="panel__title">State Pollution Control Board View</span>
            <p style="font-size:var(--text-xs);color:var(--color-text-tertiary);margin-top:2px;">
              Aggregated cluster data · No farmer PII
            </p>
          </div>
          <div class="pcb-privacy-note" role="note" aria-label="Privacy compliance note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Compliant with architecture.md §9.4 — no PII
          </div>
        </div>

        <div class="table-container">
          <table aria-label="Anonymised hotspot cluster heatmap for State Pollution Control Board">
            <thead>
              <tr>
                <th scope="col">Cluster ID</th>
                <th scope="col">Region</th>
                <th scope="col">Centroid</th>
                <th scope="col">Mean Score</th>
                <th scope="col">Risk</th>
                <th scope="col">Plots</th>
                <th scope="col">Window closes</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

      </div>`;
  }

  /* ----------------------------------------------------------------
     Build full page template
  ---------------------------------------------------------------- */
  function buildTemplate(clusters, tasks, plots) {
    const api = BurnSignal.api;

    const escalClusters = clusters.filter(c => c.status === 'escalation_required');
    const escalTasks    = tasks.filter(t => t.status === 'escalation_required');
    const totalAtRisk   = escalClusters.reduce((s, c) => s + c.plot_count, 0);
    const noWorker      = escalClusters.filter(c => !c.worker_name).length;
    const noEquipment   = escalClusters.filter(c => !c.equipment_type).length;
    const ackedCount    = escalClusters.filter(c => _ackedClusters.has(c.cluster_id)).length;

    // Earliest escalation deadline
    const earliest = escalClusters
      .filter(c => c.effective_deadline)
      .sort((a, b) => new Date(a.effective_deadline) - new Date(b.effective_deadline))[0];

    // Deadline urgency colour for summary
    const deadlineHrs = earliest
      ? (new Date(earliest.effective_deadline) - Date.now()) / 3_600_000
      : null;
    const deadlineColor = deadlineHrs == null ? 'var(--color-text-secondary)'
      : deadlineHrs < 12 ? 'var(--color-risk-critical)'
      : deadlineHrs < 36 ? 'var(--color-risk-moderate)'
      : 'var(--color-status-ready)';

    const escalSection = escalClusters.length > 0
      ? escalClusters.map(c => {
          const clusterEscalTasks = escalTasks.filter(t => t.cluster_id === c.cluster_id);
          return buildEscalCard(c, clusterEscalTasks, plots);
        }).join('')
      : `<div class="officer-all-clear" role="status" aria-live="polite">
           <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                stroke="var(--color-status-ready)" stroke-width="1.5" stroke-linecap="round"
                style="margin:0 auto var(--space-4);opacity:0.5;" aria-hidden="true">
             <circle cx="12" cy="12" r="10"/>
             <polyline points="8 12 11 15 16 9"/>
           </svg>
           <div style="font-size:var(--text-xl);font-weight:var(--weight-semibold);
                       color:var(--color-status-ready);margin-bottom:var(--space-2);">
             No escalations
           </div>
           <p style="font-size:var(--text-sm);max-width:320px;margin:0 auto;">
             All active clusters have a mapped KVK worker and an attached equipment slot.
             The system is operating within normal parameters.
           </p>
         </div>`;

    return /* html */`

      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Officer Escalation View</h1>
          <p class="page-header__subtitle">
            Clusters requiring district officer intervention · Sangrur pilot district
          </p>
        </div>
        <button id="btn-officer-refresh"
                class="btn btn--secondary btn--sm"
                aria-label="Refresh escalation data">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.86-3.36L23 10M1 14l4.63 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      <!-- Summary stat tiles -->
      <div class="grid-4 mb-6" role="region" aria-label="Escalation summary">

        <div class="officer-stat">
          <div class="officer-stat__icon-wrap"
               style="background:rgba(239,68,68,0.1);" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-risk-critical)" stroke-width="2" stroke-linecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <div class="officer-stat__label">Clusters escalated</div>
            <div class="officer-stat__value" style="color:var(--color-risk-critical);"
                 id="o-stat-escal">${escalClusters.length}</div>
          </div>
        </div>

        <div class="officer-stat">
          <div class="officer-stat__icon-wrap"
               style="background:rgba(249,115,22,0.1);" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-risk-high)" stroke-width="2" stroke-linecap="round">
              <path d="M12 2C12 2 8 6 8 12a4 4 0 0 0 8 0c0-2-1-4-1-4s2 2 2 5a5 5 0 0 1-10 0C7 7 12 2 12 2z"/>
            </svg>
          </div>
          <div>
            <div class="officer-stat__label">Plots at risk</div>
            <div class="officer-stat__value" style="color:var(--color-risk-high);">${totalAtRisk}</div>
          </div>
        </div>

        <div class="officer-stat">
          <div class="officer-stat__icon-wrap"
               style="background:rgba(234,179,8,0.1);" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-risk-moderate)" stroke-width="2" stroke-linecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <div>
            <div class="officer-stat__label">Worker gaps</div>
            <div class="officer-stat__value" style="color:var(--color-risk-moderate);">${noWorker}</div>
          </div>
        </div>

        <div class="officer-stat">
          <div class="officer-stat__icon-wrap"
               style="background:rgba(${deadlineHrs != null && deadlineHrs < 12 ? '239,68,68' : '100,116,139'},0.1);"
               aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke="${deadlineColor}" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div class="officer-stat__label">Earliest deadline</div>
            <div class="officer-stat__value" style="font-size:var(--text-base);color:${deadlineColor};">
              ${earliest ? api.formatTime(earliest.effective_deadline, 'relative') : 'None'}
            </div>
          </div>
        </div>

      </div><!-- /summary tiles -->

      <!-- Acknowledged progress note -->
      ${ackedCount > 0
        ? `<div class="ack-banner mb-6" role="status">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
               <polyline points="20 6 9 17 4 12"/>
             </svg>
             You have acknowledged ${ackedCount} of ${escalClusters.length} escalation${escalClusters.length !== 1 ? 's' : ''} this session.
           </div>`
        : ''}

      <!-- Escalation cluster cards -->
      <div class="section-divider">
        Escalation queue (${escalClusters.length})
      </div>

      <div id="officer-escal-list"
           role="list"
           aria-label="Escalation cluster list"
           style="display:flex;flex-direction:column;gap:var(--space-4);margin-bottom:var(--space-6);">
        ${escalSection}
      </div>

      <!-- PCB anonymised view -->
      ${buildPCBTable(clusters)}
    `;
  }

  /* ----------------------------------------------------------------
     Wire acknowledge buttons
  ---------------------------------------------------------------- */
  function wireAckButtons(containerEl, clusters, tasks, plots) {
    containerEl.querySelectorAll('[data-ack-cluster]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clusterId = btn.getAttribute('data-ack-cluster');
        if (!clusterId) return;
        _ackedClusters.add(clusterId);

        const card = document.getElementById(`escal-card-${clusterId}`);
        if (card) card.classList.add('escal-card--acked');

        // Swap button to "Noted" text
        btn.outerHTML = `<span class="text-xs text-tertiary">Noted</span>`;

        // Update badge
        const remaining = clusters.filter(
          c => c.status === 'escalation_required' && !_ackedClusters.has(c.cluster_id)
        ).length;
        BurnSignal.updateBadge('officer', remaining);

        BurnSignal.toast(`Cluster ${clusterId} acknowledged`, 'success', 3000);
      });
    });
  }

  /* ----------------------------------------------------------------
     Wire "View cluster" links inside cards
  ---------------------------------------------------------------- */
  function wireClusterLinks(containerEl) {
    containerEl.querySelectorAll('[data-go-clusters]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        history.pushState(null, '', '#clusters');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  }

  /* ----------------------------------------------------------------
     Main init
  ---------------------------------------------------------------- */
  async function initOfficer(containerEl) {
    if (!containerEl) return;

    injectStyles();

    // Skeleton
    containerEl.innerHTML = `
      <div class="loading-placeholder" aria-busy="true" aria-label="Loading escalation data">
        <div class="skeleton" style="height:100px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:220px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:180px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
      </div>`;

    // Fetch: officer view joins hotspot_clusters with escalation-status dispatch_tasks
    const [clusters, tasks, plots] = await Promise.all([
      BurnSignal.api.getClusters(),
      BurnSignal.api.getDispatchTasks({ status: 'escalation_required' }),
      BurnSignal.api.getPlotScores(),
    ]);

    containerEl.innerHTML = buildTemplate(clusters, tasks, plots);
    containerEl.removeAttribute('aria-busy');

    wireAckButtons(containerEl, clusters, tasks, plots);
    wireClusterLinks(containerEl);

    // Update sidebar badge
    const escalCount = clusters.filter(c => c.status === 'escalation_required').length;
    BurnSignal.updateBadge('officer', escalCount);

    // Refresh button
    const refreshBtn = containerEl.querySelector('#btn-officer-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('btn--loading');
        refreshBtn.setAttribute('aria-disabled', 'true');
        try {
          const [fc, ft, fp] = await Promise.all([
            BurnSignal.api.getClusters(),
            BurnSignal.api.getDispatchTasks({ status: 'escalation_required' }),
            BurnSignal.api.getPlotScores(),
          ]);
          containerEl.innerHTML = buildTemplate(fc, ft, fp);
          containerEl.removeAttribute('aria-busy');
          wireAckButtons(containerEl, fc, ft, fp);
          wireClusterLinks(containerEl);
          BurnSignal.toast('Escalation data refreshed', 'success', 3000);
        } catch (err) {
          BurnSignal.toast('Refresh failed', 'warning', 4000);
          console.error('[BurnSignal] Officer refresh error:', err);
        } finally {
          const nb = containerEl.querySelector('#btn-officer-refresh');
          if (nb) { nb.classList.remove('btn--loading'); nb.removeAttribute('aria-disabled'); }
        }
      });
    }

    // Global refresh
    window.addEventListener('bs:datarefresh', async () => {
      const [fc, ft, fp] = await Promise.all([
        BurnSignal.api.getClusters(),
        BurnSignal.api.getDispatchTasks({ status: 'escalation_required' }),
        BurnSignal.api.getPlotScores(),
      ]);
      containerEl.innerHTML = buildTemplate(fc, ft, fp);
      containerEl.removeAttribute('aria-busy');
      wireAckButtons(containerEl, fc, ft, fp);
      wireClusterLinks(containerEl);
    });
  }

  /* ----------------------------------------------------------------
     Register component
  ---------------------------------------------------------------- */
  BurnSignal.components = BurnSignal.components || {};
  BurnSignal.components['officer'] = initOfficer;

})();
