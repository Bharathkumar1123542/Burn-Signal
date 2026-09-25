/**
 * BurnSignal — Worker Call-List Component
 *
 * Renders into #page-worker.
 * Shows:
 *   - Worker selector (simulates per-worker login for demo)
 *   - Summary bar (ready, delivered, pending counts for selected worker)
 *   - Priority-sorted task cards with farmer details, equipment slot,
 *     and expandable Gemini TTS script preview
 *   - "Mark as Delivered" action (updates local state + badge)
 *   - Empty state when all tasks delivered or none assigned
 *
 * Registered on BurnSignal.components.worker
 *
 * Dependencies: api-client.js (BurnSignal.api), styles/index.css
 */

'use strict';

(function registerWorkerComponent() {

  /* ----------------------------------------------------------------
     Component-scoped styles
  ---------------------------------------------------------------- */
  const STYLES = `
    /* ── Worker selector bar ────────────────────────────────── */
    .worker-selector-bar {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-6);
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      flex-wrap: wrap;
    }
    .worker-avatar {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500));
      display: flex; align-items: center; justify-content: center;
      font-size: var(--text-sm); font-weight: var(--weight-bold);
      color: white; flex-shrink: 0;
      box-shadow: var(--shadow-glow-primary);
    }
    .worker-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .worker-info__name  { font-weight: var(--weight-semibold); color: var(--color-text-primary); font-size: var(--text-base); }
    .worker-info__role  { font-size: var(--text-xs); color: var(--color-text-tertiary); }
    .worker-select {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-default);
      color: var(--color-text-primary);
      border-radius: var(--radius-lg);
      padding: var(--space-2) var(--space-8) var(--space-2) var(--space-3);
      font-size: var(--text-sm);
      cursor: pointer;
      min-height: 40px;
      -webkit-appearance: none; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      transition: border-color var(--duration-fast) var(--ease-out);
    }
    .worker-select:focus { border-color: var(--color-primary-500); outline: none; }

    /* ── Task card ──────────────────────────────────────────── */
    .task-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      overflow: hidden;
      transition: box-shadow var(--duration-base) var(--ease-out),
                  border-color var(--duration-base) var(--ease-out);
      position: relative;
    }
    .task-card:hover { box-shadow: var(--shadow-md); border-color: var(--color-border-default); }

    /* Priority stripe on left edge */
    .task-card::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3px;
      background: var(--task-priority-color, var(--color-border-default));
      border-radius: var(--radius-xl) 0 0 var(--radius-xl);
    }

    .task-card--delivered {
      opacity: 0.55;
      pointer-events: none;
    }
    .task-card--delivered::before { background: var(--color-status-delivered); }

    .task-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-6) var(--space-4) calc(var(--space-6) + 3px);
      gap: var(--space-4);
      flex-wrap: wrap;
      cursor: pointer;
    }
    .task-card__header:hover { background: var(--color-hover-surface); }

    .task-card__farmer-group {
      display: flex; flex-direction: column; gap: var(--space-1); flex: 1; min-width: 180px;
    }
    .task-card__farmer-name {
      font-size: var(--text-base); font-weight: var(--weight-semibold);
      color: var(--color-text-primary);
    }
    .task-card__sub {
      font-size: var(--text-xs); color: var(--color-text-tertiary); font-family: var(--font-mono);
    }

    .task-card__actions {
      display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    }

    .task-card__body {
      display: none;
      border-top: 1px solid var(--color-border-subtle);
      padding: var(--space-5) var(--space-6);
      animation: fade-in var(--duration-base) var(--ease-out);
    }
    .task-card--open .task-card__body { display: block; }

    .task-card__chevron {
      color: var(--color-text-tertiary);
      transition: transform var(--duration-base) var(--ease-out);
      flex-shrink: 0;
    }
    .task-card--open .task-card__chevron { transform: rotate(180deg); }

    /* ── Script preview box ─────────────────────────────────── */
    .script-preview {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4) var(--space-5);
      margin-top: var(--space-4);
      position: relative;
    }
    .script-preview__label {
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      margin-bottom: var(--space-3);
      display: flex; align-items: center; gap: var(--space-2);
    }
    .script-preview__tts-badge {
      font-size: var(--text-xs);
      background: rgba(168, 139, 250, 0.12);
      color: #a78bfa;
      border: 1px solid rgba(168, 139, 250, 0.25);
      border-radius: var(--radius-full);
      padding: 1px 8px;
    }
    .script-preview__text {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: var(--leading-relaxed);
      font-style: italic;
    }
    .script-preview__lang {
      position: absolute; top: var(--space-3); right: var(--space-4);
      font-size: var(--text-xs); color: var(--color-text-tertiary);
      font-family: var(--font-mono);
    }
    .script-preview--unavailable {
      text-align: center; padding: var(--space-6);
      color: var(--color-text-tertiary);
    }

    /* ── Deliver button ─────────────────────────────────────── */
    .btn--deliver {
      background: rgba(34, 197, 94, 0.1);
      color: var(--color-status-ready);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .btn--deliver:hover {
      background: rgba(34, 197, 94, 0.2);
      box-shadow: 0 0 16px rgba(34, 197, 94, 0.2);
    }
    .btn--deliver:disabled {
      opacity: 0.4; cursor: not-allowed; pointer-events: none;
    }

    /* ── Section header ─────────────────────────────────────── */
    .tasks-section-label {
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: var(--tracking-widest);
      padding: var(--space-2) 0;
      margin-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    /* ── Empty state ────────────────────────────────────────── */
    .worker-empty {
      text-align: center;
      padding: var(--space-16) var(--space-6);
      color: var(--color-text-tertiary);
    }
    .worker-empty--all-done .worker-empty__icon { color: var(--color-status-ready); opacity: 0.6; }

    /* ── Detail grid (farmer info row) ─────────────────────── */
    .task-detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }
    .task-detail-item { display: flex; flex-direction: column; gap: 3px; }
    .task-detail-item__label {
      font-size: var(--text-xs);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }
    .task-detail-item__value {
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      color: var(--color-text-primary);
    }

    /* ── Progress indicator at top of page ─────────────────── */
    .delivery-progress {
      display: flex; align-items: center; gap: var(--space-4);
    }
    .delivery-progress__bar-wrap {
      flex: 1; height: 6px;
      background: var(--color-bg-elevated);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .delivery-progress__bar {
      height: 100%;
      border-radius: var(--radius-full);
      background: linear-gradient(90deg, var(--color-primary-700), var(--color-primary-500));
      transition: width var(--duration-slow) var(--ease-out);
    }
    .delivery-progress__label {
      font-size: var(--text-xs); color: var(--color-text-tertiary); white-space: nowrap;
    }
  `;

  /* ----------------------------------------------------------------
     Mock worker registry (mirrors api-client.js MOCK_DISPATCH_TASKS)
  ---------------------------------------------------------------- */
  const WORKERS = [
    { worker_id: 'KVK-001', name: 'Kirpal Singh Bains',  block: 'LEHRA',   phone: '+91-94171-XXXXX' },
    { worker_id: 'KVK-002', name: 'Surjit Kaur Dhillon', block: 'SANGRUR', phone: '+91-98725-XXXXX' },
  ];

  /* ----------------------------------------------------------------
     Inject styles once
  ---------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('bs-worker-styles')) return;
    const el = document.createElement('style');
    el.id = 'bs-worker-styles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  /* ----------------------------------------------------------------
     In-memory delivered-task tracker (session only)
     In production this would be a PATCH /api/v1/dispatch-tasks/:id
  ---------------------------------------------------------------- */
  const _deliveredIds = new Set();

  function markDelivered(taskId) {
    _deliveredIds.add(taskId);
  }
  function isDelivered(task) {
    return task.status === 'delivered' || _deliveredIds.has(task.task_id);
  }

  /* ----------------------------------------------------------------
     Script text generator
     Expands the abbreviated mock script_text into a full demo script.
  ---------------------------------------------------------------- */
  const SCRIPT_TEMPLATES = {
    'hi-IN': (t) => `
      ${t.farmer_name} जी को नमस्कार।
      मैं ${t.worker_name || 'आपका KVK कृषि सहायक'} बोल रहा हूं।
      हमारे उपग्रह डेटा से पता चला है कि आपके खेत (${t.plot_id}) में पराली की मात्रा अधिक है और अगले 72 घंटों में जलाने की संभावना बढ़ी है।
      हम आपको एक सुलभ विकल्प प्रदान करना चाहते हैं: ${t.equipment_type || 'हैप्पी सीडर'} ${t.slot_start ? `(स्लॉट: ${BurnSignal.api.formatTime(t.slot_start, 'datetime')})` : ''} आपके पास उपलब्ध है।
      पराली जलाने से बचने पर आपको सरकारी अनुदान भी मिलेगा।
      बुकिंग के लिए ${t.worker_name || 'हमसे'} से संपर्क करें।
      धन्यवाद।`,
    'pa-IN': (t) => `
      ${t.farmer_name} ਜੀ ਨੂੰ ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ।
      ਮੈਂ ${t.worker_name || 'ਤੁਹਾਡਾ KVK ਖੇਤੀਬਾੜੀ ਸਹਾਇਕ'} ਬੋਲ ਰਿਹਾ/ਰਹੀ ਹਾਂ।
      ਸਾਡੇ ਸੈਟੇਲਾਈਟ ਡੇਟਾ ਤੋਂ ਪਤਾ ਲੱਗਾ ਹੈ ਕਿ ਤੁਹਾਡੇ ਖੇਤ (${t.plot_id}) ਵਿੱਚ ਪਰਾਲੀ ਦੀ ਮਾਤਰਾ ਜ਼ਿਆਦਾ ਹੈ।
      ਅਸੀਂ ਤੁਹਾਨੂੰ ਇੱਕ ਸੁਵਿਧਾਜਨਕ ਵਿਕਲਪ ਦੇਣਾ ਚਾਹੁੰਦੇ ਹਾਂ: ${t.equipment_type || 'ਹੈਪੀ ਸੀਡਰ'} ਤੁਹਾਡੇ ਨੇੜੇ ਉਪਲਬਧ ਹੈ।
      ਪਰਾਲੀ ਨਾ ਸਾੜਨ 'ਤੇ ਸਰਕਾਰੀ ਸਹਾਇਤਾ ਵੀ ਮਿਲੇਗੀ।
      ਬੁਕਿੰਗ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਸਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।
      ਧੰਨਵਾਦ।`,
  };

  function getFullScript(task) {
    const lang = window.__BS_TTS_LANGUAGE__ || 'pa-IN';
    const tpl  = SCRIPT_TEMPLATES[lang] || SCRIPT_TEMPLATES['pa-IN'];
    return tpl(task).replace(/\n\s+/g, '\n').trim();
  }

  /* ----------------------------------------------------------------
     Build a single task card
  ---------------------------------------------------------------- */
  function buildTaskCard(task, plotData) {
    const api       = BurnSignal.api;
    const delivered = isDelivered(task);
    const tier      = api.scoreToRiskTier(plotData?.burn_likelihood_score ?? 0);
    const color     = api.riskTierToColor(tier);
    const scoreStr  = plotData?.burn_likelihood_score?.toFixed(2) ?? '—';
    const cardId    = `task-card-${task.task_id}`;
    const bodyId    = `task-body-${task.task_id}`;
    const headerId  = `task-header-${task.task_id}`;
    const script    = task.script_text ? getFullScript(task) : null;

    // Status badge
    let statusBadge;
    if (delivered) {
      statusBadge = `<span class="badge badge--delivered">
        <span class="badge__dot" aria-hidden="true"></span>Delivered
      </span>`;
    } else if (task.status === 'ready_for_delivery') {
      statusBadge = `<span class="badge badge--ready badge--pulse">
        <span class="badge__dot" aria-hidden="true"></span>Ready
      </span>`;
    } else if (task.status === 'pending_script') {
      statusBadge = `<span class="badge badge--pending">
        <span class="badge__dot" aria-hidden="true"></span>Script pending
      </span>`;
    } else {
      statusBadge = `<span class="badge badge--unknown">${task.status}</span>`;
    }

    // Deliver button (disabled when not ready or already delivered)
    const canDeliver = !delivered && task.status === 'ready_for_delivery';
    const deliverBtn = `
      <button
        class="btn btn--deliver btn--sm ${canDeliver ? '' : ''}"
        id="btn-deliver-${task.task_id}"
        data-task-id="${task.task_id}"
        ${canDeliver ? '' : 'disabled'}
        aria-label="Mark ${task.farmer_name}'s task as delivered"
        title="${canDeliver ? 'Mark as delivered after completing the call' : 'Task not yet ready for delivery'}"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        ${delivered ? 'Delivered' : 'Mark Delivered'}
      </button>`;

    // Script preview
    const scriptBlock = script
      ? `<div class="script-preview" role="region" aria-label="Generated voice script for ${task.farmer_name}">
           <div class="script-preview__label">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="#a78bfa" stroke-width="2" stroke-linecap="round" aria-hidden="true">
               <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
               <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
               <line x1="8" y1="23" x2="16" y2="23"/>
             </svg>
             Gemini TTS Script
             <span class="script-preview__tts-badge">AI-generated</span>
           </div>
           <span class="script-preview__lang">${window.__BS_TTS_LANGUAGE__ || 'pa-IN'}</span>
           <p class="script-preview__text" lang="${window.__BS_TTS_LANGUAGE__ || 'pa-IN'}">${script}</p>
           <div style="margin-top:var(--space-4);display:flex;align-items:center;gap:var(--space-3);">
             <button class="btn btn--secondary btn--sm"
                     aria-label="Play audio for ${task.farmer_name}'s script (demo placeholder)"
                     title="In production, plays the Gemini TTS audio file"
                     onclick="BurnSignal.toast('Audio playback requires production Gemini TTS — not available in demo mode', 'info', 4000)">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                 <polygon points="5 3 19 12 5 21 5 3"/>
               </svg>
               Play audio
             </button>
             <span style="font-size:var(--text-xs);color:var(--color-text-tertiary);">
               Max 45 seconds · ${window.__BS_TTS_LANGUAGE__ || 'pa-IN'}
             </span>
           </div>
         </div>`
      : `<div class="script-preview script-preview--unavailable">
           <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                style="margin:0 auto var(--space-2);opacity:0.3;" aria-hidden="true">
             <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
             <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
           </svg>
           <p style="font-size:var(--text-sm);">Script generation in progress — check back shortly.</p>
         </div>`;

    return `
      <article
        class="task-card ${delivered ? 'task-card--delivered' : ''}"
        id="${cardId}"
        style="--task-priority-color:${color};"
        aria-label="Dispatch task for ${task.farmer_name}"
        data-task-id="${task.task_id}"
        data-delivered="${delivered}"
      >
        <!-- Card header (click to expand) -->
        <div class="task-card__header"
             id="${headerId}"
             role="button"
             tabindex="${delivered ? -1 : 0}"
             aria-expanded="false"
             aria-controls="${bodyId}"
             data-task-header>

          <!-- Farmer info -->
          <div class="task-card__farmer-group">
            <div class="flex items-center gap-3">
              <span class="task-card__farmer-name">${task.farmer_name}</span>
              ${statusBadge}
            </div>
            <span class="task-card__sub">
              Task ${task.task_id} · Plot ${task.plot_id} · Cluster ${task.cluster_id || '—'}
            </span>
          </div>

          <div class="task-card__actions">
            <!-- Score badge -->
            <span class="badge badge--${tier}"
                  title="Burn likelihood: ${scoreStr}"
                  aria-label="Risk level ${tier}, score ${scoreStr}">
              🔥 ${scoreStr}
            </span>

            <!-- Slot time -->
            ${task.slot_start
              ? `<span style="font-size:var(--text-xs);color:var(--color-text-tertiary);white-space:nowrap;">
                   <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        style="display:inline;vertical-align:-1px;" aria-hidden="true">
                     <circle cx="12" cy="12" r="10"/>
                     <polyline points="12 6 12 12 16 14"/>
                   </svg>
                   ${api.formatTime(task.slot_start, 'datetime')}
                 </span>`
              : ''}

            <!-- Deliver button -->
            ${deliverBtn}

            <!-- Chevron -->
            <svg class="task-card__chevron" width="16" height="16"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

        </div><!-- /header -->

        <!-- Expandable body -->
        <div class="task-card__body" id="${bodyId}" role="region" aria-labelledby="${headerId}">

          <!-- Detail grid -->
          <div class="task-detail-grid">
            <div class="task-detail-item">
              <span class="task-detail-item__label">Equipment</span>
              <span class="task-detail-item__value">${task.equipment_type || '—'}</span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Slot time</span>
              <span class="task-detail-item__value">
                ${api.formatTime(task.slot_start, 'datetime')}
              </span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Plot area</span>
              <span class="task-detail-item__value">${plotData?.plot_area_ha ?? '—'} ha</span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Days since harvest</span>
              <span class="task-detail-item__value">${plotData?.days_since_harvest ?? '—'} days</span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Residue index</span>
              <span class="task-detail-item__value font-mono">
                ${plotData?.residue_index?.toFixed(2) ?? '—'}
              </span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Block</span>
              <span class="task-detail-item__value">${plotData?.block_code ?? '—'}</span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Signal quality</span>
              <span class="task-detail-item__value">
                ${plotData?.feature_confidence === 'degraded'
                  ? '<span style="color:var(--color-risk-moderate);">⚠ Degraded (stale imagery)</span>'
                  : '<span style="color:var(--color-status-ready);">✓ Normal</span>'}
              </span>
            </div>
            <div class="task-detail-item">
              <span class="task-detail-item__label">Task created</span>
              <span class="task-detail-item__value text-secondary">
                ${api.formatTime(task.created_at, 'relative')}
              </span>
            </div>
          </div>

          <!-- Script preview -->
          ${scriptBlock}

          <!-- Action footer -->
          <div class="flex items-center justify-between mt-4" style="flex-wrap:wrap;gap:8px;">
            <span style="font-size:var(--text-xs);color:var(--color-text-tertiary);">
              Task ID: <span class="font-mono">${task.task_id}</span>
            </span>
            <div class="flex gap-3">
              <button
                class="btn btn--secondary btn--sm"
                onclick="BurnSignal.toast('In production: opens the farmer\\'s plot on the district heatmap', 'info', 4000)"
                aria-label="View ${task.plot_id} on district map">
                View on map
              </button>
              ${canDeliver
                ? `<button
                     class="btn btn--deliver"
                     data-task-id="${task.task_id}"
                     aria-label="Confirm delivery for ${task.farmer_name}"
                     data-deliver-footer>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                       <polyline points="20 6 9 17 4 12"/>
                     </svg>
                     Confirm delivery
                   </button>`
                : ''}
            </div>
          </div>

        </div><!-- /body -->
      </article>`;
  }

  /* ----------------------------------------------------------------
     Build the full page template
  ---------------------------------------------------------------- */
  function buildTemplate(tasks, plots, selectedWorkerId) {
    const worker = WORKERS.find(w => w.worker_id === selectedWorkerId) || WORKERS[0];

    // Filter to selected worker's tasks only
    const myTasks = tasks.filter(t => t.worker_id === worker.worker_id);

    // Partition by state
    const ready     = myTasks.filter(t => !isDelivered(t) && t.status === 'ready_for_delivery');
    const pending   = myTasks.filter(t => !isDelivered(t) && t.status === 'pending_script');
    const delivered = myTasks.filter(t => isDelivered(t) || t.status === 'delivered');

    // Delivery progress
    const total       = myTasks.length;
    const doneCount   = delivered.length;
    const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    // Sort ready tasks by score desc
    const plotMap = Object.fromEntries(plots.map(p => [p.plot_id, p]));
    const sortByScore = (a, b) => {
      const sa = plotMap[a.plot_id]?.burn_likelihood_score ?? 0;
      const sb = plotMap[b.plot_id]?.burn_likelihood_score ?? 0;
      return sb - sa;
    };
    ready.sort(sortByScore);

    // Worker options
    const workerOptions = WORKERS.map(w =>
      `<option value="${w.worker_id}" ${w.worker_id === worker.worker_id ? 'selected' : ''}>
        ${w.name} (${w.block})
      </option>`
    ).join('');

    // Initials avatar
    const initials = worker.name.split(' ').map(n => n[0]).slice(0, 2).join('');

    // All-done state
    if (ready.length === 0 && pending.length === 0 && total > 0) {
      return `
        ${buildPageHeader(worker, initials, workerOptions, total, doneCount, progressPct)}
        <div class="worker-empty worker-empty--all-done" role="status" aria-live="polite">
          <div class="worker-empty__icon" style="margin:0 auto var(--space-4);">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="8 12 11 15 16 9"/>
            </svg>
          </div>
          <div style="font-size:var(--text-xl);font-weight:var(--weight-semibold);color:var(--color-status-ready);margin-bottom:var(--space-2);">
            All tasks delivered!
          </div>
          <p style="font-size:var(--text-sm);max-width:320px;margin:0 auto;">
            ${worker.name}, you've completed all ${total} outreach calls for today's run.
            The next pipeline run will surface new at-risk farmers.
          </p>
        </div>`;
    }

    // No tasks for this worker
    if (total === 0) {
      return `
        ${buildPageHeader(worker, initials, workerOptions, 0, 0, 0)}
        <div class="worker-empty" role="status" aria-live="polite">
          <div style="margin:0 auto var(--space-4);opacity:0.25;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
          </div>
          <div style="font-size:var(--text-lg);font-weight:var(--weight-semibold);color:var(--color-text-secondary);margin-bottom:var(--space-2);">
            No tasks assigned
          </div>
          <p style="font-size:var(--text-sm);">
            No at-risk plots are currently mapped to ${worker.name}'s jurisdiction.
            Check the district officer view for unassigned clusters.
          </p>
        </div>`;
    }

    // Main task list
    const readySection = ready.length > 0
      ? `<div class="tasks-section-label">
           Ready for outreach (${ready.length})
         </div>
         <div style="display:flex;flex-direction:column;gap:var(--space-4);margin-bottom:var(--space-6);">
           ${ready.map(t => buildTaskCard(t, plotMap[t.plot_id])).join('')}
         </div>`
      : '';

    const pendingSection = pending.length > 0
      ? `<div class="tasks-section-label" style="margin-top:var(--space-6);">
           Script generation in progress (${pending.length})
         </div>
         <div style="display:flex;flex-direction:column;gap:var(--space-4);margin-bottom:var(--space-6);">
           ${pending.map(t => buildTaskCard(t, plotMap[t.plot_id])).join('')}
         </div>`
      : '';

    const deliveredSection = delivered.length > 0
      ? `<details style="margin-top:var(--space-4);">
           <summary class="tasks-section-label"
                    style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:var(--space-2);">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
               <polyline points="6 9 12 15 18 9"/>
             </svg>
             Delivered (${delivered.length})
           </summary>
           <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-top:var(--space-3);">
             ${delivered.map(t => buildTaskCard(t, plotMap[t.plot_id])).join('')}
           </div>
         </details>`
      : '';

    return `
      ${buildPageHeader(worker, initials, workerOptions, total, doneCount, progressPct)}
      <div id="worker-task-list">
        ${readySection}
        ${pendingSection}
        ${deliveredSection}
      </div>`;
  }

  /* ----------------------------------------------------------------
     Page header (shared between states)
  ---------------------------------------------------------------- */
  function buildPageHeader(worker, initials, workerOptions, total, doneCount, progressPct) {
    return `
      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Worker Call List</h1>
          <p class="page-header__subtitle">
            Daily outreach tasks — KVK extension workers · Pilot district: Sangrur
          </p>
        </div>
      </div>

      <!-- Worker selector -->
      <div class="worker-selector-bar mb-6">
        <div class="worker-avatar" aria-hidden="true">${initials}</div>
        <div class="worker-info">
          <span class="worker-info__name">${worker.name}</span>
          <span class="worker-info__role">
            KVK Extension Worker · Block ${worker.block} · ${worker.phone}
          </span>
        </div>
        <label for="worker-select" class="text-sm text-secondary" style="white-space:nowrap;">
          Switch worker:
        </label>
        <select id="worker-select"
                class="worker-select"
                aria-label="Select worker to view their task list">
          ${workerOptions}
        </select>
      </div>

      <!-- Progress bar -->
      ${total > 0
        ? `<div class="card mb-6" style="padding:var(--space-4) var(--space-6);">
             <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:8px;">
               <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--color-text-secondary);">
                 Today's delivery progress
               </span>
               <span style="font-size:var(--text-sm);color:var(--color-text-tertiary);">
                 <strong style="color:var(--color-text-primary);">${doneCount}</strong> / ${total} tasks
               </span>
             </div>
             <div class="delivery-progress" role="progressbar"
                  aria-valuenow="${progressPct}"
                  aria-valuemin="0" aria-valuemax="100"
                  aria-label="Delivery progress: ${progressPct}%">
               <div class="delivery-progress__bar-wrap">
                 <div class="delivery-progress__bar" style="width:${progressPct}%;"></div>
               </div>
               <span class="delivery-progress__label">${progressPct}% done</span>
             </div>
           </div>`
        : ''}
    `;
  }

  /* ----------------------------------------------------------------
     Wire accordion expand/collapse
  ---------------------------------------------------------------- */
  function wireAccordion(containerEl) {
    containerEl.querySelectorAll('[data-task-header]').forEach(header => {
      function toggle() {
        const card   = header.closest('.task-card');
        const isOpen = card.classList.contains('task-card--open');
        const bodyId = header.getAttribute('aria-controls');
        const body   = document.getElementById(bodyId);

        if (isOpen) {
          card.classList.remove('task-card--open');
          header.setAttribute('aria-expanded', 'false');
          if (body) body.style.display = 'none';
        } else {
          card.classList.add('task-card--open');
          header.setAttribute('aria-expanded', 'true');
          if (body) body.style.display = 'block';
        }
      }
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  /* ----------------------------------------------------------------
     Wire "Mark Delivered" buttons
  ---------------------------------------------------------------- */
  function wireDeliverButtons(containerEl, tasks, plots, selectedWorkerId) {
    containerEl.querySelectorAll('[data-task-id][data-deliver-footer], [id^="btn-deliver-"]').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent card expand/collapse
        const taskId = btn.getAttribute('data-task-id');
        if (!taskId) return;

        markDelivered(taskId);

        // Re-render
        containerEl.innerHTML = buildTemplate(tasks, plots, selectedWorkerId);
        wireAccordion(containerEl);
        wireDeliverButtons(containerEl, tasks, plots, selectedWorkerId);
        wireWorkerSelect(containerEl, tasks, plots);

        // Update sidebar badge
        const remaining = tasks
          .filter(t => t.worker_id === selectedWorkerId && !isDelivered(t) && t.status === 'ready_for_delivery')
          .length;
        BurnSignal.updateBadge('worker', remaining);

        BurnSignal.toast(`Marked delivered — ${tasks.find(t => t.task_id === taskId)?.farmer_name ?? ''}`, 'success', 3500);
      });
    });
  }

  /* ----------------------------------------------------------------
     Wire worker selector
  ---------------------------------------------------------------- */
  function wireWorkerSelect(containerEl, tasks, plots) {
    const sel = containerEl.querySelector('#worker-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const workerId = sel.value;
      containerEl.innerHTML = buildTemplate(tasks, plots, workerId);
      wireAccordion(containerEl);
      wireDeliverButtons(containerEl, tasks, plots, workerId);
      wireWorkerSelect(containerEl, tasks, plots);
    });
  }

  /* ----------------------------------------------------------------
     Main init — called once by the shell router
  ---------------------------------------------------------------- */
  async function initWorker(containerEl) {
    if (!containerEl) return;

    injectStyles();

    // Skeleton
    containerEl.innerHTML = `
      <div class="loading-placeholder" aria-busy="true" aria-label="Loading worker tasks">
        <div class="skeleton" style="height:80px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton skeleton--sm" style="height:60px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:120px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:120px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
        <div class="skeleton" style="height:120px;border-radius:var(--radius-xl);" aria-hidden="true"></div>
      </div>`;

    const [tasks, plots] = await Promise.all([
      BurnSignal.api.getDispatchTasks(),
      BurnSignal.api.getPlotScores(),
    ]);

    const defaultWorker = WORKERS[0].worker_id;

    containerEl.innerHTML = buildTemplate(tasks, plots, defaultWorker);
    containerEl.removeAttribute('aria-busy');

    wireAccordion(containerEl);
    wireDeliverButtons(containerEl, tasks, plots, defaultWorker);
    wireWorkerSelect(containerEl, tasks, plots);

    // Badge: ready tasks for default worker
    const readyCount = tasks.filter(
      t => t.worker_id === defaultWorker && !isDelivered(t) && t.status === 'ready_for_delivery'
    ).length;
    BurnSignal.updateBadge('worker', readyCount);

    // Global refresh
    window.addEventListener('bs:datarefresh', async () => {
      const [freshTasks, freshPlots] = await Promise.all([
        BurnSignal.api.getDispatchTasks(),
        BurnSignal.api.getPlotScores(),
      ]);
      const currentWorkerSel = containerEl.querySelector('#worker-select');
      const currentWorker    = currentWorkerSel?.value || defaultWorker;
      containerEl.innerHTML  = buildTemplate(freshTasks, freshPlots, currentWorker);
      wireAccordion(containerEl);
      wireDeliverButtons(containerEl, freshTasks, freshPlots, currentWorker);
      wireWorkerSelect(containerEl, freshTasks, freshPlots);
    });
  }

  /* ----------------------------------------------------------------
     Register component
  ---------------------------------------------------------------- */
  BurnSignal.components = BurnSignal.components || {};
  BurnSignal.components['worker'] = initWorker;

})();
