/**
 * BurnSignal — Cluster Table Component
 *
 * Renders into #page-clusters.
 * Shows:
 *   - Summary bar (cluster count, total at-risk plots, earliest deadline)
 *   - Filter/sort controls (by status, risk tier, block)
 *   - Expandable cluster cards — each card shows cluster metadata,
 *     KVK worker assignment, equipment slot, and member plots inline
 *   - Empty state when no clusters meet the filter
 *
 * Registered on BurnSignal.components.clusters — called once by the
 * shell router when the clusters page is first activated.
 *
 * Dependencies: api-client.js (BurnSignal.api), styles/index.css
 */

'use strict';

(function registerClustersComponent() {

  /* ----------------------------------------------------------------
     Extra styles scoped to this component
  ---------------------------------------------------------------- */
  const STYLES = `
    /* ── Cluster card ──────────────────────────────────────── */
    .cluster-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      overflow: hidden;
      transition: box-shadow var(--duration-base) var(--ease-out),
                  border-color var(--duration-base) var(--ease-out);
    }
    .cluster-card:hover {
      box-shadow: var(--shadow-lg);
      border-color: var(--color-border-default);
    }

    /* Coloured left accent bar driven by --cluster-accent */
    .cluster-card__accent {
      height: 4px;
      background: var(--cluster-accent, var(--color-primary-500));
    }

    .cluster-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-6);
      gap: var(--space-4);
      flex-wrap: wrap;
      cursor: pointer;
      user-select: none;
    }
    .cluster-card__header:hover { background: var(--color-hover-surface); }

    .cluster-card__title-group { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; min-width: 160px; }
    .cluster-card__title { font-size: var(--text-base); font-weight: var(--weight-semibold); color: var(--color-text-primary); }
    .cluster-card__sub   { font-size: var(--text-xs);  color: var(--color-text-tertiary); font-family: var(--font-mono); }

    .cluster-card__meta {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .cluster-meta-item {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .cluster-meta-item__label {
      font-size: var(--text-xs);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      white-space: nowrap;
    }
    .cluster-meta-item__value {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      color: var(--color-text-primary);
      white-space: nowrap;
    }

    /* Expand chevron */
    .cluster-card__chevron {
      color: var(--color-text-tertiary);
      transition: transform var(--duration-base) var(--ease-out);
      flex-shrink: 0;
    }
    .cluster-card--open .cluster-card__chevron { transform: rotate(180deg); }

    /* Body (collapsible) */
    .cluster-card__body {
      display: none;
      border-top: 1px solid var(--color-border-subtle);
    }
    .cluster-card--open .cluster-card__body { display: block; }

    /* Worker / equipment assignment row */
    .cluster-assignment {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-6);
      background: var(--color-bg-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    @media (max-width: 600px) { .cluster-assignment { grid-template-columns: 1fr; } }

    .assignment-block {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .assignment-block__label {
      font-size: var(--text-xs);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }
    .assignment-block__value {
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      color: var(--color-text-primary);
    }
    .assignment-block__value--warn { color: var(--color-risk-moderate); }
    .assignment-block__value--err  { color: var(--color-risk-critical); }

    /* Member plots mini table inside card body */
    .member-plots-table th { background: var(--color-bg-surface); }

    /* ── Filter bar ─────────────────────────────────────────── */
    .filter-bar {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    .filter-select {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-default);
      color: var(--color-text-primary);
      border-radius: var(--radius-lg);
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-sm);
      cursor: pointer;
      min-height: 40px;
      transition: border-color var(--duration-fast) var(--ease-out);
      -webkit-appearance: none;
      appearance: none;
      padding-right: var(--space-8);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
    }
    .filter-select:focus { border-color: var(--color-primary-500); outline: none; }

    /* ── Summary banner ─────────────────────────────────────── */
    .clusters-summary-bar {
      display: flex;
      gap: var(--space-6);
      align-items: center;
      padding: var(--space-4) var(--space-6);
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      flex-wrap: wrap;
    }
    .summary-stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .summary-stat__val {
      font-size: var(--text-xl);
      font-weight: var(--weight-bold);
      color: var(--color-text-primary);
      line-height: 1;
    }
    .summary-stat__label {
      font-size: var(--text-xs);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }
    .summary-divider {
      width: 1px;
      height: 36px;
      background: var(--color-border-subtle);
    }

    /* ── Empty state ────────────────────────────────────────── */
    .clusters-empty {
      text-align: center;
      padding: var(--space-16) var(--space-6);
      color: var(--color-text-tertiary);
    }
    .clusters-empty__icon { margin: 0 auto var(--space-4); opacity: 0.25; }
    .clusters-empty__title {
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-2);
    }

    /* ── Deadline countdown ─────────────────────────────────── */
    .deadline-urgent { color: var(--color-risk-critical); font-weight: var(--weight-semibold); }
    .deadline-warn   { color: var(--color-risk-moderate); font-weight: var(--weight-medium); }
  `;

  /* ----------------------------------------------------------------
     Inject styles once
  ---------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('bs-cluster-styles')) return;
    const el = document.createElement('style');
    el.id = 'bs-cluster-styles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  /* ----------------------------------------------------------------
     Helpers
  ---------------------------------------------------------------- */
  const api = () => BurnSignal.api;

  /**
   * Formats the deadline with urgency colouring.
   * @param {string} iso
   * @returns {string} HTML string
   */
  function formatDeadline(iso) {
    if (!iso) return '<span style="color:var(--color-text-tertiary)">—</span>';
    const diffHours = (new Date(iso) - Date.now()) / 3_600_000;
    const label     = api().formatTime(iso, 'relative');
    if (diffHours < 12) return `<span class="deadline-urgent" title="${iso}">${label}</span>`;
    if (diffHours < 36) return `<span class="deadline-warn"   title="${iso}">${label}</span>`;
    return `<span style="color:var(--color-text-secondary)" title="${iso}">${label}</span>`;
  }

  /**
   * Build a single cluster card HTML string.
   * @param {object} cluster
   * @param {object[]} memberPlots  — from MOCK_PLOT_SCORES, filtered by cluster_id
   */
  function buildClusterCard(cluster, memberPlots) {
    const tier    = api().scoreToRiskTier(cluster.mean_score);
    const color   = api().riskTierToColor(tier);
    const scorePC = Math.round(cluster.mean_score * 100);

    // Status badge
    let statusBadge = '';
    if (cluster.status === 'ready_for_delivery') {
      statusBadge = `<span class="badge badge--ready">
        <span class="badge__dot badge--pulse" aria-hidden="true"></span>Ready to dispatch
      </span>`;
    } else if (cluster.status === 'escalation_required') {
      statusBadge = `<span class="badge badge--escalation">
        <span class="badge__dot" aria-hidden="true"></span>Escalation required
      </span>`;
    } else if (cluster.status === 'pending_script') {
      statusBadge = `<span class="badge badge--pending">
        <span class="badge__dot" aria-hidden="true"></span>Script pending
      </span>`;
    }

    // Worker section
    const workerSection = cluster.worker_name
      ? `<div class="assignment-block">
           <span class="assignment-block__label">KVK Extension Worker</span>
           <span class="assignment-block__value">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" style="display:inline;vertical-align:-1px;margin-right:4px;" aria-hidden="true">
               <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
               <circle cx="12" cy="7" r="4"/>
             </svg>
             ${cluster.worker_name}
           </span>
           <span class="assignment-block__label" style="margin-top:2px;">Worker ID: ${cluster.worker_id}</span>
         </div>`
      : `<div class="assignment-block">
           <span class="assignment-block__label">KVK Extension Worker</span>
           <span class="assignment-block__value assignment-block__value--err">
             ⚠ No worker mapped — routed to district officer queue
           </span>
         </div>`;

    // Equipment section
    const equipSection = cluster.equipment_type
      ? `<div class="assignment-block">
           <span class="assignment-block__label">Equipment Slot</span>
           <span class="assignment-block__value">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" style="display:inline;vertical-align:-1px;margin-right:4px;" aria-hidden="true">
               <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
             </svg>
             ${cluster.equipment_type}
           </span>
           <span class="assignment-block__label" style="margin-top:2px;">
             Slot: ${api().formatTime(cluster.slot_start, 'datetime')}
           </span>
         </div>`
      : `<div class="assignment-block">
           <span class="assignment-block__label">Equipment Slot</span>
           <span class="assignment-block__value assignment-block__value--warn">
             No slot available — escalation pending
           </span>
         </div>`;

    // Member plots mini-table
    const memberRows = memberPlots.map(p => {
      const ptier  = api().scoreToRiskTier(p.burn_likelihood_score);
      const pcolor = api().riskTierToColor(ptier);
      return `
        <tr>
          <td>
            <span class="font-mono text-sm">${p.plot_id}</span>
          </td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${p.farmer_name}">${p.farmer_name}</td>
          <td>
            <div class="score-bar" role="meter"
                 aria-valuenow="${Math.round(p.burn_likelihood_score * 100)}"
                 aria-valuemin="0" aria-valuemax="100"
                 aria-label="Score: ${p.burn_likelihood_score.toFixed(2)}">
              <span class="score-cell" style="color:${pcolor};min-width:32px;">
                ${p.burn_likelihood_score.toFixed(2)}
              </span>
              <div class="score-bar__track" aria-hidden="true" style="min-width:48px;">
                <div class="score-bar__fill"
                     style="width:${Math.round(p.burn_likelihood_score * 100)}%;--fill-color:${pcolor};"></div>
              </div>
            </div>
          </td>
          <td><span class="badge badge--${ptier}">${ptier}</span></td>
          <td style="font-size:var(--text-sm);color:var(--color-text-secondary);">${p.plot_area_ha} ha</td>
          <td style="font-size:var(--text-sm);color:var(--color-text-secondary);">${p.days_since_harvest}d</td>
          <td>
            ${p.feature_confidence === 'degraded'
              ? `<span class="badge badge--moderate" title="Stale imagery">⚠ Degraded</span>`
              : `<span class="badge badge--low">Normal</span>`}
          </td>
        </tr>`;
    }).join('');

    const cardId      = `cluster-card-${cluster.cluster_id}`;
    const bodyId      = `cluster-body-${cluster.cluster_id}`;
    const headerId    = `cluster-header-${cluster.cluster_id}`;
    const tableId     = `cluster-table-${cluster.cluster_id}`;

    return `
      <article class="cluster-card"
               id="${cardId}"
               style="--cluster-accent:${color};"
               aria-label="Cluster ${cluster.label}">

        <!-- Accent bar -->
        <div class="cluster-card__accent" aria-hidden="true"></div>

        <!-- Collapsible header -->
        <div class="cluster-card__header"
             id="${headerId}"
             role="button"
             tabindex="0"
             aria-expanded="false"
             aria-controls="${bodyId}"
             data-cluster-id="${cluster.cluster_id}">

          <div class="cluster-card__title-group">
            <div class="flex items-center gap-3 flex-wrap">
              <span class="cluster-card__title">${cluster.label}</span>
              ${statusBadge}
            </div>
            <span class="cluster-card__sub">
              ${cluster.cluster_id} · Block ${cluster.block_code} · ${cluster.plot_count} plot${cluster.plot_count !== 1 ? 's' : ''}
            </span>
          </div>

          <div class="cluster-card__meta">

            <!-- Mean score -->
            <div class="cluster-meta-item">
              <span class="cluster-meta-item__label">Mean Score</span>
              <span class="cluster-meta-item__value" style="color:${color};">
                ${cluster.mean_score.toFixed(2)}
              </span>
            </div>

            <!-- Risk tier -->
            <div class="cluster-meta-item">
              <span class="cluster-meta-item__label">Risk</span>
              <span class="badge badge--${tier}">${tier}</span>
            </div>

            <!-- Deadline -->
            <div class="cluster-meta-item">
              <span class="cluster-meta-item__label">Window closes</span>
              <span class="cluster-meta-item__value">
                ${formatDeadline(cluster.effective_deadline)}
              </span>
            </div>

            <!-- Chevron -->
            <svg class="cluster-card__chevron" width="18" height="18"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>

          </div>
        </div><!-- /header -->

        <!-- Collapsible body -->
        <div class="cluster-card__body" id="${bodyId}" role="region" aria-labelledby="${headerId}">

          <!-- Worker & equipment assignment -->
          <div class="cluster-assignment">
            ${workerSection}
            ${equipSection}
          </div>

          <!-- Member plots table -->
          <div style="padding:var(--space-4) var(--space-6);">
            <div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:8px;">
              <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--color-text-secondary);">
                Member plots (${memberPlots.length})
              </span>
              <a href="#dashboard"
                 class="btn btn--ghost btn--sm"
                 data-go-dashboard
                 aria-label="View these plots on the district heatmap">
                View on map →
              </a>
            </div>

            ${memberPlots.length > 0
              ? `<div class="table-container">
                   <table id="${tableId}"
                          class="member-plots-table"
                          aria-label="Member plots for cluster ${cluster.label}">
                     <thead>
                       <tr>
                         <th scope="col">Plot ID</th>
                         <th scope="col">Farmer</th>
                         <th scope="col">Score</th>
                         <th scope="col">Risk</th>
                         <th scope="col">Area</th>
                         <th scope="col">Days Since Harvest</th>
                         <th scope="col">Signal Quality</th>
                       </tr>
                     </thead>
                     <tbody>${memberRows}</tbody>
                   </table>
                 </div>`
              : `<p style="color:var(--color-text-tertiary);font-size:var(--text-sm);">No member plots found.</p>`
            }
          </div>

        </div><!-- /body -->

      </article>`;
  }

  /* ----------------------------------------------------------------
     Build the full page template
  ---------------------------------------------------------------- */
  function buildTemplate(clusters, plots) {
    const allStatuses = [...new Set(clusters.map(c => c.status))];
    const allBlocks   = [...new Set(clusters.map(c => c.block_code))].sort();

    // Summary stats
    const totalPlots   = clusters.reduce((s, c) => s + c.plot_count, 0);
    const earliestDead = clusters
      .filter(c => c.effective_deadline)
      .sort((a, b) => new Date(a.effective_deadline) - new Date(b.effective_deadline))[0];
    const readyCount  = clusters.filter(c => c.status === 'ready_for_delivery').length;
    const escalCount  = clusters.filter(c => c.status === 'escalation_required').length;

    const statusOptions = [
      { value: '',                   label: 'All statuses' },
      { value: 'ready_for_delivery', label: 'Ready to dispatch' },
      { value: 'escalation_required',label: 'Escalation required' },
      { value: 'pending_script',     label: 'Script pending' },
    ].map(o =>
      `<option value="${o.value}">${o.label}</option>`
    ).join('');

    const blockOptions = [
      `<option value="">All blocks</option>`,
      ...allBlocks.map(b => `<option value="${b}">${b}</option>`),
    ].join('');

    const clusterCards = clusters.map(c => {
      const members = plots.filter(p => p.cluster_id === c.cluster_id);
      return buildClusterCard(c, members);
    }).join('');

    return /* html */`
      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Hotspot Clusters</h1>
          <p class="page-header__subtitle">
            Geographic/temporal clusters of high-risk plots — 72-hour scoring window
          </p>
        </div>
        <button id="btn-clusters-refresh"
                class="btn btn--secondary btn--sm"
                aria-label="Refresh cluster data">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.86-3.36L23 10M1 14l4.63 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      <!-- Summary bar -->
      <div class="clusters-summary-bar mb-6"
           role="region"
           aria-label="Cluster summary statistics">
        <div class="summary-stat">
          <span class="summary-stat__val" id="cs-cluster-count">${clusters.length}</span>
          <span class="summary-stat__label">Active clusters</span>
        </div>
        <div class="summary-divider" aria-hidden="true"></div>
        <div class="summary-stat">
          <span class="summary-stat__val">${totalPlots}</span>
          <span class="summary-stat__label">At-risk plots</span>
        </div>
        <div class="summary-divider" aria-hidden="true"></div>
        <div class="summary-stat">
          <span class="summary-stat__val" style="color:var(--color-status-ready);">${readyCount}</span>
          <span class="summary-stat__label">Ready to dispatch</span>
        </div>
        <div class="summary-divider" aria-hidden="true"></div>
        <div class="summary-stat">
          <span class="summary-stat__val" style="color:var(--color-risk-critical);">${escalCount}</span>
          <span class="summary-stat__label">Escalation required</span>
        </div>
        <div class="summary-divider" aria-hidden="true"></div>
        <div class="summary-stat">
          <span class="summary-stat__val" style="font-size:var(--text-base);">
            ${earliestDead ? formatDeadline(earliestDead.effective_deadline) : '—'}
          </span>
          <span class="summary-stat__label">Earliest deadline</span>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="filter-bar mb-6" role="search" aria-label="Filter clusters">
        <label for="filter-status" class="text-sm text-secondary" style="white-space:nowrap;">
          Filter:
        </label>
        <select id="filter-status"
                class="filter-select"
                aria-label="Filter by dispatch status">
          ${statusOptions}
        </select>
        <select id="filter-block"
                class="filter-select"
                aria-label="Filter by block">
          ${blockOptions}
        </select>
        <select id="sort-clusters"
                class="filter-select"
                aria-label="Sort clusters">
          <option value="score-desc">Highest risk first</option>
          <option value="score-asc">Lowest risk first</option>
          <option value="deadline-asc">Earliest deadline first</option>
          <option value="plots-desc">Most plots first</option>
        </select>
        <span id="filter-result-count"
              class="text-sm text-tertiary"
              aria-live="polite"
              aria-atomic="true">
          Showing ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''}
        </span>
      </div>

      <!-- Cluster cards list -->
      <div id="cluster-cards-list"
           role="list"
           aria-label="Hotspot cluster cards"
           style="display:flex;flex-direction:column;gap:var(--space-4);">
        ${clusters.length > 0
          ? clusterCards
          : buildEmptyState('No clusters active', 'All plots are currently below the score threshold (0.60). The next pipeline run may surface new hotspots.')
        }
      </div>
    `;
  }

  /* ----------------------------------------------------------------
     Empty state
  ---------------------------------------------------------------- */
  function buildEmptyState(title, desc) {
    return `
      <div class="clusters-empty" role="status" aria-live="polite">
        <div class="clusters-empty__icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <circle cx="12" cy="12" r="8" opacity=".4"/>
          </svg>
        </div>
        <div class="clusters-empty__title">${title}</div>
        <p style="font-size:var(--text-sm);max-width:360px;margin:0 auto;">${desc}</p>
      </div>`;
  }

  /* ----------------------------------------------------------------
     Collapse / expand logic
  ---------------------------------------------------------------- */
  function wireAccordion(containerEl) {
    containerEl.querySelectorAll('[data-cluster-id]').forEach(header => {
      function toggle() {
        const card     = header.closest('.cluster-card');
        const isOpen   = card.classList.contains('cluster-card--open');
        const bodyId   = header.getAttribute('aria-controls');
        const body     = document.getElementById(bodyId);

        if (isOpen) {
          card.classList.remove('cluster-card--open');
          header.setAttribute('aria-expanded', 'false');
          if (body) body.style.display = 'none';
        } else {
          card.classList.add('cluster-card--open');
          header.setAttribute('aria-expanded', 'true');
          if (body) body.style.display = 'block';
        }
      }

      header.addEventListener('click', toggle);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

    // "View on map" links inside cards → navigate to dashboard
    containerEl.querySelectorAll('[data-go-dashboard]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        history.pushState(null, '', '#dashboard');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  }

  /* ----------------------------------------------------------------
     Filter + sort logic
  ---------------------------------------------------------------- */
  function wireFilters(containerEl, clusters, plots) {
    const statusSel  = containerEl.querySelector('#filter-status');
    const blockSel   = containerEl.querySelector('#filter-block');
    const sortSel    = containerEl.querySelector('#sort-clusters');
    const listEl     = containerEl.querySelector('#cluster-cards-list');
    const countEl    = containerEl.querySelector('#filter-result-count');

    if (!statusSel || !blockSel || !sortSel || !listEl) return;

    function applyFilters() {
      const status = statusSel.value;
      const block  = blockSel.value;
      const sort   = sortSel.value;

      let filtered = clusters.filter(c => {
        if (status && c.status     !== status) return false;
        if (block  && c.block_code !== block)  return false;
        return true;
      });

      // Sort
      filtered = filtered.sort((a, b) => {
        if (sort === 'score-desc')    return b.mean_score - a.mean_score;
        if (sort === 'score-asc')     return a.mean_score - b.mean_score;
        if (sort === 'deadline-asc')  return new Date(a.effective_deadline) - new Date(b.effective_deadline);
        if (sort === 'plots-desc')    return b.plot_count - a.plot_count;
        return 0;
      });

      // Re-render list
      if (filtered.length === 0) {
        listEl.innerHTML = buildEmptyState(
          'No clusters match your filter',
          'Try adjusting the status or block filter above.'
        );
      } else {
        listEl.innerHTML = filtered.map(c => {
          const members = plots.filter(p => p.cluster_id === c.cluster_id);
          return buildClusterCard(c, members);
        }).join('');
        wireAccordion(listEl);
      }

      // Update result count
      if (countEl) {
        countEl.textContent = `Showing ${filtered.length} cluster${filtered.length !== 1 ? 's' : ''}`;
      }

      // Auto-expand first card if only one result
      if (filtered.length === 1) {
        const firstHeader = listEl.querySelector('[data-cluster-id]');
        if (firstHeader) firstHeader.click();
      }
    }

    statusSel.addEventListener('change', applyFilters);
    blockSel.addEventListener('change',  applyFilters);
    sortSel.addEventListener('change',   applyFilters);
  }

  /* ----------------------------------------------------------------
     Main init — called once by the shell router
  ---------------------------------------------------------------- */
  async function initClusters(containerEl) {
    if (!containerEl) return;

    injectStyles();

    // Show skeleton while fetching
    containerEl.innerHTML = `
      <div class="loading-placeholder" aria-busy="true" aria-label="Loading cluster data">
        <div class="skeleton" style="height:100px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:180px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:180px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:180px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
      </div>`;

    // Fetch
    const [clusters, plots] = await Promise.all([
      BurnSignal.api.getClusters(),
      BurnSignal.api.getPlotScores(),
    ]);

    // Render
    containerEl.innerHTML = buildTemplate(clusters, plots);
    containerEl.removeAttribute('aria-busy');

    // Wire interactions
    wireAccordion(containerEl);
    wireFilters(containerEl, clusters, plots);

    // Refresh button
    const refreshBtn = containerEl.querySelector('#btn-clusters-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('btn--loading');
        refreshBtn.setAttribute('aria-disabled', 'true');
        try {
          const [freshClusters, freshPlots] = await Promise.all([
            BurnSignal.api.getClusters(),
            BurnSignal.api.getPlotScores(),
          ]);
          containerEl.innerHTML = buildTemplate(freshClusters, freshPlots);
          containerEl.removeAttribute('aria-busy');
          wireAccordion(containerEl);
          wireFilters(containerEl, freshClusters, freshPlots);
          BurnSignal.toast('Clusters refreshed', 'success', 3000);
        } catch (err) {
          BurnSignal.toast('Refresh failed', 'warning', 5000);
          console.error('[BurnSignal] Cluster refresh error:', err);
        } finally {
          const newBtn = containerEl.querySelector('#btn-clusters-refresh');
          if (newBtn) {
            newBtn.classList.remove('btn--loading');
            newBtn.removeAttribute('aria-disabled');
          }
        }
      });
    }

    // Update global badges
    BurnSignal.updateBadge('clusters', clusters.length);
    BurnSignal.updateBadge('officer',  clusters.filter(c => c.status === 'escalation_required').length);

    // Listen for global refresh events
    window.addEventListener('bs:datarefresh', async () => {
      const [freshClusters, freshPlots] = await Promise.all([
        BurnSignal.api.getClusters(),
        BurnSignal.api.getPlotScores(),
      ]);
      const listEl   = containerEl.querySelector('#cluster-cards-list');
      const countEl  = containerEl.querySelector('#filter-result-count');
      const summaryEl = containerEl.querySelector('[aria-label="Cluster summary statistics"]');

      if (listEl) {
        listEl.innerHTML = freshClusters.map(c => {
          const members = freshPlots.filter(p => p.cluster_id === c.cluster_id);
          return buildClusterCard(c, members);
        }).join('');
        wireAccordion(listEl);
      }
      if (countEl) {
        countEl.textContent = `Showing ${freshClusters.length} cluster${freshClusters.length !== 1 ? 's' : ''}`;
      }
      const csCount = containerEl.querySelector('#cs-cluster-count');
      if (csCount) csCount.textContent = freshClusters.length;
    });
  }

  /* ----------------------------------------------------------------
     Register component
  ---------------------------------------------------------------- */
  BurnSignal.components = BurnSignal.components || {};
  BurnSignal.components['clusters'] = initClusters;

})();
