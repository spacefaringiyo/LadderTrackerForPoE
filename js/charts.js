/**
 * PoE Ladder Tracker — Charts Module (Dashboard Layout v2)
 * Renders charts with time range filtering and persistent rate intervals.
 */

// ---------------------------------------------------------------------------
// Chart.js Defaults
// ---------------------------------------------------------------------------
if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#9b97a0';
    Chart.defaults.borderColor = 'rgba(212, 168, 83, 0.08)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 10;
}

// ---------------------------------------------------------------------------
// Module State (last rendered data for re-render on toggle change)
// ---------------------------------------------------------------------------
var _lastDetailHistory = null;
var _lastDetailDeaths = null;
var _lastDetailHasDepth = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTimeShort(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        '\n' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function calculateXPRates(history, intervalSeconds) {
    const rates = [];
    for (let i = 0; i < history.length; i++) {
        const cur = history[i];
        let past = null;
        for (let j = i - 1; j >= 0; j--) {
            if (cur.t - history[j].t >= intervalSeconds) { past = history[j]; break; }
        }
        if (past) {
            const td = cur.t - past.t;
            const xd = cur.x - past.x;
            rates.push({ t: cur.t, rate: Math.max(0, (xd / td) * 3600) });
        } else if (i > 0) {
            const td = cur.t - history[0].t;
            if (td > 0) {
                const xd = cur.x - history[0].x;
                rates.push({ t: cur.t, rate: Math.max(0, (xd / td) * 3600) });
            }
        }
    }
    return rates;
}

/**
 * Filter history to only include data within `rangeSeconds` from the latest point.
 * If rangeSeconds is 0 or falsy, returns all data.
 */
function filterByTimeRange(history, rangeSeconds) {
    if (!rangeSeconds || rangeSeconds <= 0 || !history.length) return history;
    const latest = history[history.length - 1].t;
    const cutoff = latest - rangeSeconds;
    return history.filter(s => s.t >= cutoff);
}

function baseChartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(10, 10, 15, 0.95)',
                borderColor: 'rgba(212, 168, 83, 0.25)',
                borderWidth: 1,
                padding: 8,
                titleFont: { size: 10, weight: '600' },
                bodyFont: { size: 10 },
                callbacks: {
                    title: (items) => items.length ? formatTime(items[0].parsed.x / 1000) : '',
                },
            },
        },
        scales: {
            x: {
                type: 'linear',
                ticks: { callback: (v) => formatTimeShort(v / 1000), maxTicksLimit: 6, maxRotation: 0, font: { size: 9 } },
                grid: { color: 'rgba(212, 168, 83, 0.04)' },
            },
            y: {
                ticks: { callback: (v) => formatXP(v), font: { size: 9 } },
                title: { display: false },
                grid: { color: 'rgba(212, 168, 83, 0.04)' },
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Detail Panel Charts
// ---------------------------------------------------------------------------
let _detailCharts = { xp: null, rate: null, depth: null };

function renderDetailCharts(history, deaths, hasDepth, rateInterval, timeRange) {
    // Save for re-renders on toggle change
    _lastDetailHistory = history;
    _lastDetailDeaths = deaths;
    _lastDetailHasDepth = hasDepth;

    const filtered = filterByTimeRange(history, timeRange);
    const filteredDeaths = deaths.filter(d => filtered.some(s => s.t === d.timestamp));

    renderDetailXP(filtered, filteredDeaths);
    renderDetailRate(filtered, rateInterval);
    if (hasDepth) renderDetailDepth(filtered);
}

function renderDetailXP(history, deaths) {
    const ctx = document.getElementById('detail-xp-chart');
    if (!ctx) return;
    if (_detailCharts.xp) _detailCharts.xp.destroy();

    const datasets = [{
        label: 'XP',
        data: history.map(s => ({ x: s.t * 1000, y: s.x })),
        borderColor: '#d4a853',
        backgroundColor: 'rgba(212, 168, 83, 0.08)',
        borderWidth: 1.5,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.3,
    }];

    if (deaths.length > 0) {
        datasets.push({
            label: 'Deaths',
            data: deaths.map(d => ({ x: d.timestamp * 1000, y: d.xpAfter })),
            borderColor: 'transparent',
            backgroundColor: '#e74c3c',
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: 'crossRot',
            showLine: false,
        });
    }

    const opts = baseChartOptions('XP');
    opts.plugins.tooltip.callbacks.label = (item) => {
        if (item.datasetIndex === 1) {
            const d = deaths[item.dataIndex];
            return `💀 Lost ${formatXP(d.xpLost)} (${d.percentLost}%)`;
        }
        return `XP: ${formatXP(item.parsed.y)}`;
    };

    _detailCharts.xp = new Chart(ctx, { type: 'line', data: { datasets }, options: opts });
}

function renderDetailRate(history, interval) {
    const ctx = document.getElementById('detail-rate-chart');
    if (!ctx) return;
    if (_detailCharts.rate) _detailCharts.rate.destroy();

    const rates = calculateXPRates(history, interval);
    const opts = baseChartOptions('XP/h');
    opts.plugins.tooltip.callbacks.label = (item) => `${formatXP(Math.round(item.parsed.y))}/h`;

    _detailCharts.rate = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'XP Rate',
                data: rates.map(r => ({ x: r.t * 1000, y: r.rate })),
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.08)',
                borderWidth: 1.5,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0.3,
            }]
        },
        options: opts,
    });
}

function renderDetailDepth(history) {
    const ctx = document.getElementById('detail-depth-chart');
    if (!ctx) return;
    if (_detailCharts.depth) _detailCharts.depth.destroy();

    const data = history.filter(s => s.d != null).map(s => ({ x: s.t * 1000, y: s.d }));
    const opts = baseChartOptions('Depth');
    opts.plugins.tooltip.callbacks.label = (item) => `Depth: ${formatNumber(item.parsed.y)}`;

    _detailCharts.depth = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Depth',
                data,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.08)',
                borderWidth: 1.5,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0.3,
            }]
        },
        options: opts,
    });
}

// ---------------------------------------------------------------------------
// Rate Toggle (legacy helper, still used by compare.js)
// ---------------------------------------------------------------------------
function setupRateToggle(containerId, onChange) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            c.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(parseInt(btn.dataset.interval, 10));
        });
    });
}
