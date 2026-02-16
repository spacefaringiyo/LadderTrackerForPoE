/**
 * PoE Ladder Tracker — Comparison Module (Dashboard Layout v2)
 * Renders overlay charts with time range filtering and persistent toggles.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const COMPARE_COLORS = [
    '#d4a853', '#e74c3c', '#2ecc71', '#3498db', '#9b59b6',
    '#e67e22', '#1abc9c', '#f39c12', '#e91e63', '#00bcd4',
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let _compareData = [];
let _compareCharts = { xp: null, rate: null, depth: null };

// ---------------------------------------------------------------------------
// Load & Render
// ---------------------------------------------------------------------------
async function loadComparison(playerNames) {
    const body = document.getElementById('compare-body');
    const countEl = document.getElementById('compare-count');
    const toggles = document.getElementById('compare-toggles');
    const clearBtn = document.getElementById('clear-compare-btn');

    body.innerHTML = '<div class="loading-spinner">Loading…</div>';

    const results = await Promise.allSettled(
        playerNames.map(async (name, i) => {
            const data = await fetchJSON(`data/players/${safeFilename(name)}.json`);
            return {
                name: data.name || name,
                class: data.class || '?',
                history: data.history || [],
                deaths: detectDeaths(data.history || []),
                color: COMPARE_COLORS[i % COMPARE_COLORS.length],
            };
        })
    );

    _compareData = results.filter(r => r.status === 'fulfilled').map(r => r.value);

    if (!_compareData.length) {
        body.innerHTML = '<div class="empty-panel"><p>No data available</p></div>';
        return;
    }

    countEl.textContent = `(${_compareData.length} players)`;
    toggles.style.display = '';
    clearBtn.style.display = '';

    renderCompareBody();
}

function renderCompareBody() {
    const body = document.getElementById('compare-body');
    const hasDepth = _compareData.some(p => p.history.some(s => s.d != null));

    body.innerHTML = `
    <div class="compare-tags" id="compare-tags">
      ${_compareData.map(p => `
        <div class="compare-tag">
          <span class="tag-dot" style="background:${p.color}"></span>
          <span style="cursor:pointer" onclick="openDetail('${escJs(p.name)}')">${esc(p.name)}</span>
          <span class="tag-class">${p.class}</span>
        </div>
      `).join('')}
    </div>
    <div class="charts-row">
      <div class="chart-box"><h4>Experience</h4><div class="chart-canvas-wrap"><canvas id="cmp-xp"></canvas></div></div>
      <div class="chart-box"><h4>XP Rate</h4><div class="chart-canvas-wrap"><canvas id="cmp-rate"></canvas></div></div>
    </div>
    ${hasDepth ? '<div class="charts-row single"><div class="chart-box"><h4>Depth</h4><div class="chart-canvas-wrap"><canvas id="cmp-depth"></canvas></div></div></div>' : ''}
  `;

    renderCmpXP();
    renderCmpRate(App.compareRateInterval);
    if (hasDepth) renderCmpDepth();

    // Restore toggle states
    restoreToggleState('compare-rate-toggle', 'data-interval', App.compareRateInterval);
    restoreToggleState('compare-range-toggle', 'data-range', App.compareTimeRange);
}

/**
 * Called when rate or range toggles change.
 * Re-renders all compare charts with current App state.
 */
function rerenderCompareCharts() {
    if (!_compareData.length) return;
    renderCmpXP();
    renderCmpRate(App.compareRateInterval);
    const hasDepth = _compareData.some(p => p.history.some(s => s.d != null));
    if (hasDepth) renderCmpDepth();
}

function renderCmpXP() {
    const ctx = document.getElementById('cmp-xp');
    if (!ctx) return;
    if (_compareCharts.xp) _compareCharts.xp.destroy();

    const timeRange = App.compareTimeRange;
    const datasets = [];
    _compareData.forEach(p => {
        const filtered = filterByTimeRange(p.history, timeRange);
        const filteredDeaths = p.deaths.filter(d => filtered.some(s => s.t === d.timestamp));

        datasets.push({
            label: p.name,
            data: filtered.map(s => ({ x: s.t * 1000, y: s.x })),
            borderColor: p.color,
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.3,
        });
        if (filteredDeaths.length) {
            datasets.push({
                label: `${p.name} (deaths)`,
                data: filteredDeaths.map(d => ({ x: d.timestamp * 1000, y: d.xpAfter })),
                borderColor: 'transparent',
                backgroundColor: p.color,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointStyle: 'crossRot',
                showLine: false,
            });
        }
    });

    const opts = baseChartOptions('XP');
    opts.plugins.legend = {
        display: true, position: 'top',
        labels: { usePointStyle: true, padding: 10, font: { size: 9 }, filter: i => !i.text.includes('(deaths)') },
    };
    opts.plugins.tooltip.callbacks.label = (item) => {
        if (item.dataset.label.includes('(deaths)')) return `💀 Death`;
        return `${item.dataset.label}: ${formatXP(item.parsed.y)}`;
    };

    _compareCharts.xp = new Chart(ctx, { type: 'line', data: { datasets }, options: opts });
}

function renderCmpRate(interval) {
    const ctx = document.getElementById('cmp-rate');
    if (!ctx) return;
    if (_compareCharts.rate) _compareCharts.rate.destroy();

    const timeRange = App.compareTimeRange;
    const datasets = _compareData.map(p => {
        const filtered = filterByTimeRange(p.history, timeRange);
        return {
            label: p.name,
            data: calculateXPRates(filtered, interval).map(r => ({ x: r.t * 1000, y: r.rate })),
            borderColor: p.color,
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.3,
        };
    });

    const opts = baseChartOptions('XP/h');
    opts.plugins.legend = {
        display: true, position: 'top',
        labels: { usePointStyle: true, padding: 10, font: { size: 9 } },
    };
    opts.plugins.tooltip.callbacks.label = (item) =>
        `${item.dataset.label}: ${formatXP(Math.round(item.parsed.y))}/h`;

    _compareCharts.rate = new Chart(ctx, { type: 'line', data: { datasets }, options: opts });
}

function renderCmpDepth() {
    const ctx = document.getElementById('cmp-depth');
    if (!ctx) return;
    if (_compareCharts.depth) _compareCharts.depth.destroy();

    const timeRange = App.compareTimeRange;
    const datasets = _compareData
        .filter(p => p.history.some(s => s.d != null))
        .map(p => {
            const filtered = filterByTimeRange(p.history, timeRange).filter(s => s.d != null);
            return {
                label: p.name,
                data: filtered.map(s => ({ x: s.t * 1000, y: s.d })),
                borderColor: p.color,
                borderWidth: 1.5,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0.3,
            };
        });

    const opts = baseChartOptions('Depth');
    opts.plugins.legend = {
        display: true, position: 'top',
        labels: { usePointStyle: true, padding: 10, font: { size: 9 } },
    };
    opts.plugins.tooltip.callbacks.label = (item) =>
        `${item.dataset.label}: ${formatNumber(item.parsed.y)}`;

    _compareCharts.depth = new Chart(ctx, { type: 'line', data: { datasets }, options: opts });
}

function clearComparison() {
    const body = document.getElementById('compare-body');
    const countEl = document.getElementById('compare-count');
    const toggles = document.getElementById('compare-toggles');
    const clearBtn = document.getElementById('clear-compare-btn');

    if (_compareCharts.xp) { _compareCharts.xp.destroy(); _compareCharts.xp = null; }
    if (_compareCharts.rate) { _compareCharts.rate.destroy(); _compareCharts.rate = null; }
    if (_compareCharts.depth) { _compareCharts.depth.destroy(); _compareCharts.depth = null; }
    _compareData = [];

    countEl.textContent = '';
    toggles.style.display = 'none';
    clearBtn.style.display = 'none';
    body.innerHTML = '<div class="empty-panel"><div class="empty-icon">⚔</div><p>Select 2+ players to compare</p><span class="empty-hint">Use the checkboxes, then click Compare</span></div>';
}
