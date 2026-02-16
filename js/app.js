/**
 * PoE Ladder Tracker — Core Application (Dashboard Layout v2)
 *
 * Features:
 *   • Left panel  : sortable/filterable ladder with XP/h column & column toggles
 *   • Right-top   : inline player detail w/ rate + time range toggles
 *   • Right-bottom: inline comparison panel
 *   • Horizontal resize between ladder & right panels
 *   • Vertical resize between detail & compare
 *   • localStorage persistence for all user preferences
 *   • Auto-refresh every 5 min
 *   • [NEW] Multi-interval XP & Rank tracking (1h, 4h, 12h, 1d, 3d)
 *   • [NEW] Weighted Class Distribution Bar
 */

// ---------------------------------------------------------------------------
// Storage Key
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'poe_ladder_prefs';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const App = {
    ladderData: [],
    filteredData: [],
    metaData: {},                 // Holds class distribution etc.
    selectedPlayers: new Set(),   // Checkboxed for comparison
    activePlayer: null,           // Currently viewing detail
    sortKey: 'rank',
    sortAsc: true,
    activeClassFilter: null,
    searchQuery: '',
    hiddenColumns: new Set(),

    // Ladder Settings
    ladderInterval: '1h',         // 1h, 4h, 12h, 1d, 3d
    showMeta: false,              // Class distribution visibility

    // Detail/Compare Settings
    detailRateInterval: 600,
    detailTimeRange: 0,           // 0 = All
    compareRateInterval: 600,
    compareTimeRange: 0,

    // Layout
    ladderWidthPct: 48,           // Percentage of main-content width
    detailHeightRatio: 0.5,       // Detail panel flex ratio
    refreshTimer: null,
};

// ---------------------------------------------------------------------------
// Class Colors
// ---------------------------------------------------------------------------
const CLASS_COLORS = {
    Marauder: '#e74c3c', Juggernaut: '#e74c3c', Berserker: '#e74c3c', Chieftain: '#e74c3c',
    Ranger: '#2ecc71', Deadeye: '#2ecc71', Raider: '#2ecc71', Pathfinder: '#2ecc71',
    Witch: '#9b59b6', Necromancer: '#9b59b6', Elementalist: '#9b59b6', Occultist: '#9b59b6',
    Duelist: '#e67e22', Slayer: '#e67e22', Gladiator: '#e67e22', Champion: '#e67e22',
    Templar: '#f1c40f', Inquisitor: '#f1c40f', Hierophant: '#f1c40f', Guardian: '#f1c40f',
    Shadow: '#3498db', Assassin: '#3498db', Trickster: '#3498db', Saboteur: '#3498db',
    Scion: '#ecf0f1', Ascendant: '#ecf0f1',
};

const ALL_CLASSES = new Set();
const VALID_INTERVALS = ['1h', '4h', '12h', '1d', '3d'];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function formatXP(xp) {
    if (xp >= 1e9) return (xp / 1e9).toFixed(2) + ' B';
    if (xp >= 1e6) return (xp / 1e6).toFixed(1) + ' M';
    if (xp >= 1e3) return (xp / 1e3).toFixed(0) + ' K';
    return xp.toString();
}

function formatNumber(n) { return n != null ? n.toLocaleString() : '—'; }

function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
}

// ---------------------------------------------------------------------------
// MD5 Implementation (Compact, self-contained)
// ---------------------------------------------------------------------------
function md5(string) {
    function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
    }
    function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function md5blk(s) {
        var md5blks = [], i;
        for (i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        return md5blks;
    }
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    function rhex(n) { var s = '', j; for (j = 0; j < 4; j++) s += "0123456789abcdef".charAt((n >> (j * 8 + 4)) & 0x0F) + "0123456789abcdef".charAt((n >> (j * 8)) & 0x0F); return s; }
    function hex(x) { for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(''); }

    var n = string.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(string.substring(i - 64, i)));
    string = string.substring(i - 64);
    var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < string.length; i++) tail[i >> 2] |= string.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return hex(state);
}

function safeFilename(name) {
    // 1. Sanitize (ASCII only)
    let safe = name.replace(/[^\w\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    // 2. Fallback to MD5 hash if sanitized name is empty (non-ASCII names)
    if (!safe) {
        const utf8Name = unescape(encodeURIComponent(name));
        const hash = md5(utf8Name).substring(0, 8);
        return `player_${hash}`;
    }
    return safe;
}

// ---------------------------------------------------------------------------
// LocalStorage Persistence
// ---------------------------------------------------------------------------
function savePrefs() {
    const prefs = {
        selectedPlayers: [...App.selectedPlayers],
        activePlayer: App.activePlayer,
        sortKey: App.sortKey,
        sortAsc: App.sortAsc,
        activeClassFilter: App.activeClassFilter,
        hiddenColumns: [...App.hiddenColumns],
        ladderInterval: App.ladderInterval,
        showMeta: App.showMeta,
        detailRateInterval: App.detailRateInterval,
        detailTimeRange: App.detailTimeRange,
        compareRateInterval: App.compareRateInterval,
        compareTimeRange: App.compareTimeRange,
        ladderWidthPct: App.ladderWidthPct,
        detailHeightRatio: App.detailHeightRatio,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) { }
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p.selectedPlayers) App.selectedPlayers = new Set(p.selectedPlayers);
        if (p.activePlayer) App.activePlayer = p.activePlayer;
        if (p.sortKey) App.sortKey = p.sortKey;
        if (p.sortAsc !== undefined) App.sortAsc = p.sortAsc;
        if (p.activeClassFilter !== undefined) App.activeClassFilter = p.activeClassFilter;
        if (p.hiddenColumns) App.hiddenColumns = new Set(p.hiddenColumns);
        if (p.ladderInterval && VALID_INTERVALS.includes(p.ladderInterval)) App.ladderInterval = p.ladderInterval;
        if (p.showMeta !== undefined) App.showMeta = p.showMeta;
        if (p.detailRateInterval) App.detailRateInterval = p.detailRateInterval;
        if (p.detailTimeRange !== undefined) App.detailTimeRange = p.detailTimeRange;
        if (p.compareRateInterval) App.compareRateInterval = p.compareRateInterval;
        if (p.compareTimeRange !== undefined) App.compareTimeRange = p.compareTimeRange;
        if (p.ladderWidthPct) App.ladderWidthPct = p.ladderWidthPct;
        if (p.detailHeightRatio) App.detailHeightRatio = p.detailHeightRatio;
    } catch (e) { }
}

// ---------------------------------------------------------------------------
// Data Fetching
// ---------------------------------------------------------------------------
async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
}

async function loadLadder(isRefresh) {
    const body = document.getElementById('ladder-body');
    if (!isRefresh) {
        body.innerHTML = '<tr><td colspan="11"><div class="loading-spinner">Loading…</div></td></tr>';
    }

    try {
        const [ladder, meta] = await Promise.all([
            fetchJSON('data/current_ladder.json'),
            fetchJSON('data/metadata.json'),
        ]);

        App.ladderData = ladder;
        App.metaData = meta;

        ALL_CLASSES.clear();
        ladder.forEach(p => ALL_CLASSES.add(p.class));

        document.getElementById('league-badge').textContent = meta.league || '?';
        document.getElementById('last-updated').textContent =
            meta.last_updated ? `Updated ${timeAgo(meta.last_updated)}` : '';

        renderClassFilters();
        renderMetaDistribution();
        applyFilters();

        // Restore active player detail if we have one
        if (!isRefresh && App.activePlayer) {
            openDetail(App.activePlayer);
        }
        // Restore comparison if we have selected players
        if (!isRefresh && App.selectedPlayers.size >= 2) {
            updateSelectionUI();
            triggerComparison();
        } else {
            updateSelectionUI();
        }
    } catch (err) {
        console.error(err);
        body.innerHTML = `<tr><td colspan="11">
      <div class="empty-panel"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>
    </td></tr>`;
    }
}

// ---------------------------------------------------------------------------
// Meta Distribution
// ---------------------------------------------------------------------------
function renderMetaDistribution() {
    const container = document.getElementById('meta-distribution');
    const toggleBtn = document.getElementById('meta-toggle-btn');

    // UI State
    container.style.display = App.showMeta ? 'flex' : 'none';
    if (toggleBtn) toggleBtn.classList.toggle('active', App.showMeta);

    if (!App.showMeta) return;

    // Calculate or use pre-calculated weights
    let classWeights = App.metaData.class_distribution || {};

    // Sort classes by weight desc
    const sorted = Object.entries(classWeights)
        .sort((a, b) => b[1] - a[1]);

    const totalWeight = sorted.reduce((sum, [, w]) => sum + w, 0);

    if (totalWeight === 0) {
        container.innerHTML = '<span style="color:var(--text-muted)">No data available</span>';
        return;
    }

    // Take top 5, group rest as "Other"
    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5);
    const otherWeight = others.reduce((sum, [, w]) => sum + w, 0);

    if (otherWeight > 0) top5.push(['Other', otherWeight]);

    container.innerHTML = top5.map(([cls, weight]) => {
        const pct = ((weight / totalWeight) * 100).toFixed(1);
        const color = CLASS_COLORS[cls] || '#7f8c8d'; // Grey for Other
        return `
            <div class="meta-bar-segment" style="width:${pct}%; background-color:${color}" title="${cls}: ${pct}%">
                <span class="meta-bar-label">${pct}% ${cls}</span>
            </div>
        `;
    }).join('');
}


// ---------------------------------------------------------------------------
// Filtering & Sorting
// ---------------------------------------------------------------------------
function applyFilters() {
    let data = [...App.ladderData];
    if (App.searchQuery) {
        const q = App.searchQuery.toLowerCase();
        data = data.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.account && p.account.toLowerCase().includes(q)) ||
            p.class.toLowerCase().includes(q));
    }
    if (App.activeClassFilter) data = data.filter(p => p.class === App.activeClassFilter);

    // Sort Logic with Interval support
    data.sort((a, b) => {
        let va, vb;

        // Handle special sort keys for intervals
        if (App.sortKey === 'xp_per_hour') {
            const ra = a.xp_rates || {};
            const rb = b.xp_rates || {};
            va = ra[App.ladderInterval] || 0;
            vb = rb[App.ladderInterval] || 0;
        } else {
            va = a[App.sortKey];
            vb = b[App.sortKey];
        }

        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return App.sortAsc ? -1 : 1;
        if (va > vb) return App.sortAsc ? 1 : -1;
        return 0;
    });

    App.filteredData = data;
    renderTable();
}

// ---------------------------------------------------------------------------
// Table Rendering
// ---------------------------------------------------------------------------
function renderTable() {
    const body = document.getElementById('ladder-body');
    const hidden = App.hiddenColumns;

    if (!App.filteredData.length) {
        body.innerHTML = '<tr><td colspan="11"><div class="empty-panel"><div class="empty-icon">🔍</div><p>No players found</p></div></td></tr>';
        return;
    }

    // Use interval-specific data
    const interval = App.ladderInterval;

    body.innerHTML = App.filteredData.map(p => {
        const sel = App.selectedPlayers.has(p.name);
        const act = App.activePlayer === p.name;
        const cc = CLASS_COLORS[p.class] || '#999';

        // XP Rate for current interval
        const rates = p.xp_rates || {};
        const xph = rates[interval];
        // Fallback for old data or missing interval: use 0
        const xphDisplay = (xph != null) ? formatXP(Math.round(xph)) : '—';
        const isIdle = xph != null && xph === 0;

        // Rank Change
        const changes = p.rank_changes || {};
        const rankDelta = changes[interval];
        let rankChangeHtml = '';
        if (rankDelta != null && rankDelta !== 0) {
            const isPos = rankDelta > 0;
            const color = isPos ? '#2ecc71' : '#e74c3c';
            const sign = isPos ? '▲' : '▼';
            rankChangeHtml = `<div style="color:${color};font-size:0.75rem;margin-left:4px;" title="${isPos ? 'Gained' : 'Lost'} ${Math.abs(rankDelta)} ranks in last ${interval}">${sign}${Math.abs(rankDelta)}</div>`;
        }

        return `<tr class="${sel ? 'selected' : ''} ${act ? 'active-player' : ''} ${p.dead ? 'dead-char' : ''}" data-name="${escAttr(p.name)}">
      <td class="cell-cb" onclick="event.stopPropagation()">
        <input type="checkbox" ${sel ? 'checked' : ''} onchange="toggleSelect('${escJs(p.name)}')">
      </td>
      <td class="cell-rank ${p.rank <= 3 ? 'top-3' : ''}">
        <div style="display:flex;align-items:center;justify-content:center;">
            ${p.rank}
            ${rankChangeHtml}
        </div>
      </td>
      <td>
        <div class="char-name">${esc(p.name)}</div>
        ${hidden.has('col-account') ? '' : `<div class="char-account">${esc(p.account || '')}</div>`}
      </td>
      <td class="cell-class"><span class="class-dot" style="background:${cc}"></span>${p.class}</td>
      <td class="cell-level">${p.level}</td>
      <td class="cell-xp">${formatXP(p.experience)}</td>
      <td class="cell-xph ${isIdle ? 'idle' : ''} ${hidden.has('col-xph') ? 'col-hidden' : ''}">${xphDisplay}</td>
      <td class="cell-depth ${hidden.has('col-depth') ? 'col-hidden' : ''}">${p.depth != null ? formatNumber(p.depth) : '—'}</td>
      <td class="cell-status ${hidden.has('col-status') ? 'col-hidden' : ''}">
        <span class="status-badge ${p.dead ? 'status-dead' : 'status-alive'}">${p.dead ? '💀' : '✓'}</span>
      </td>
      <td class="cell-twitch ${hidden.has('col-twitch') ? 'col-hidden' : ''}">
        ${p.twitch ? `<a href="https://twitch.tv/${p.twitch}" target="_blank" onclick="event.stopPropagation()">📺 ${esc(p.twitch)}</a>` : '—'}
      </td>
      <td class="cell-challenges ${hidden.has('col-challenges') ? 'col-hidden' : ''}">${p.challenges}/${p.challenges_max}</td>
    </tr>`;
    }).join('');

    // Click → open detail
    body.querySelectorAll('tr[data-name]').forEach(row => {
        row.addEventListener('click', () => openDetail(row.dataset.name));
    });
}

function renderClassFilters() {
    const c = document.getElementById('class-filters');
    const sorted = [...ALL_CLASSES].sort();
    c.innerHTML = `
    <button class="class-filter-btn ${!App.activeClassFilter ? 'active' : ''}" onclick="setClassFilter(null)">All</button>
    ${sorted.map(cls => `<button class="class-filter-btn ${App.activeClassFilter === cls ? 'active' : ''}" onclick="setClassFilter('${cls}')">
      <span class="class-dot" style="background:${CLASS_COLORS[cls] || '#999'};display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:2px;vertical-align:middle;"></span>${cls}
    </button>`).join('')}`;
}

function updateColumnVisibility() {
    // Header cells
    document.querySelectorAll('.ladder-table th').forEach(th => {
        const cls = [...th.classList].find(c => c.startsWith('col-'));
        if (cls) th.classList.toggle('col-hidden', App.hiddenColumns.has(cls));
    });
    // Settings dropdown checkboxes
    document.querySelectorAll('#settings-dropdown input[type="checkbox"]').forEach(cb => {
        cb.checked = !App.hiddenColumns.has(cb.dataset.col);
    });
    renderTable();
    savePrefs();
}

function updateSelectionUI() {
    const n = App.selectedPlayers.size;
    const info = document.getElementById('selected-info');
    const btn = document.getElementById('compare-btn');
    info.innerHTML = n > 0
        ? `<strong>${n}</strong> player${n > 1 ? 's' : ''} selected`
        : 'Click a row to view details';
    btn.disabled = n < 2;
}

// ---------------------------------------------------------------------------
// Player Detail (Right-Top Panel)
// ---------------------------------------------------------------------------
async function openDetail(name) {
    App.activePlayer = name;
    savePrefs();
    renderTable(); // Highlight active row

    const nameEl = document.getElementById('detail-player-name');
    const body = document.getElementById('detail-body');
    const toggles = document.getElementById('detail-toggles');
    const player = App.ladderData.find(p => p.name === name);
    if (!player) return;

    nameEl.textContent = `— ${player.name}`;
    body.innerHTML = '<div class="loading-spinner">Loading history…</div>';
    toggles.style.display = 'none';

    try {
        const safeName = safeFilename(name);
        const data = await fetchJSON(`data/players/${safeName}.json`);
        renderDetail(player, data);
    } catch (err) {
        body.innerHTML = `<div class="empty-panel"><p>No history data available</p><span class="empty-hint">${err.message}</span></div>`;
    }
}

function renderDetail(player, historyData) {
    const history = historyData.history || [];
    const body = document.getElementById('detail-body');
    const toggles = document.getElementById('detail-toggles');
    const deaths = detectDeaths(history);

    // Stats
    const totalGain = history.length > 1 ? history[history.length - 1].x - history[0].x : 0;
    const hours = history.length > 1 ? (history[history.length - 1].t - history[0].t) / 3600 : 0;
    const avgXph = hours > 0 ? totalGain / hours : 0;
    const hasDepth = history.some(s => s.d != null);
    const maxDepth = hasDepth ? Math.max(...history.filter(s => s.d != null).map(s => s.d)) : null;
    const cc = CLASS_COLORS[player.class] || '#999';

    body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span class="class-dot" style="background:${cc};width:10px;height:10px"></span>
      <span style="color:var(--text-secondary);font-size:0.8rem;">${player.class} · Lvl ${player.level} · ${player.account || ''} ${player.dead ? '· <span style="color:var(--red)">💀 Dead</span>' : ''}</span>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Current XP</div><div class="stat-value gold">${formatXP(player.experience)}</div></div>
      <div class="stat-card"><div class="stat-label">XP Gained</div><div class="stat-value">${formatXP(totalGain)}</div></div>
      <div class="stat-card"><div class="stat-label">Avg XP/h</div><div class="stat-value green">${formatXP(Math.round(avgXph))}</div></div>
      <div class="stat-card"><div class="stat-label">Deaths</div><div class="stat-value ${deaths.length ? 'red' : ''}">${deaths.length}</div></div>
      ${hasDepth ? `<div class="stat-card"><div class="stat-label">Max Depth</div><div class="stat-value gold">${formatNumber(maxDepth)}</div></div>` : ''}
      <div class="stat-card"><div class="stat-label">Snapshots</div><div class="stat-value">${history.length}</div></div>
    </div>
    <div class="charts-row">
      <div class="chart-box"><h4>Experience</h4><div class="chart-canvas-wrap"><canvas id="detail-xp-chart"></canvas></div></div>
      <div class="chart-box"><h4>XP Rate</h4><div class="chart-canvas-wrap"><canvas id="detail-rate-chart"></canvas></div></div>
    </div>
    ${hasDepth ? '<div class="charts-row single"><div class="chart-box"><h4>Depth</h4><div class="chart-canvas-wrap"><canvas id="detail-depth-chart"></canvas></div></div></div>' : ''}
  `;

    toggles.style.display = '';

    // Render charts via charts.js
    if (typeof renderDetailCharts === 'function') {
        renderDetailCharts(history, deaths, hasDepth, App.detailRateInterval, App.detailTimeRange);
    }

    // Restore toggle active states
    restoreToggleState('detail-rate-toggle', 'data-interval', App.detailRateInterval);
    restoreToggleState('detail-range-toggle', 'data-range', App.detailTimeRange);
}

// ---------------------------------------------------------------------------
// Comparison (Right-Bottom Panel)
// ---------------------------------------------------------------------------
function triggerComparison() {
    if (App.selectedPlayers.size < 2) return;
    if (typeof loadComparison === 'function') {
        loadComparison([...App.selectedPlayers]);
    }
}

// ---------------------------------------------------------------------------
// Death Detection
// ---------------------------------------------------------------------------
function detectDeaths(history) {
    const deaths = [];
    for (let i = 1; i < history.length; i++) {
        if (history[i].x < history[i - 1].x) {
            const lost = history[i - 1].x - history[i].x;
            deaths.push({
                index: i,
                timestamp: history[i].t,
                xpBefore: history[i - 1].x,
                xpAfter: history[i].x,
                xpLost: lost,
                percentLost: ((lost / history[i - 1].x) * 100).toFixed(1),
            });
        }
    }
    return deaths;
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
function toggleSelect(name) {
    if (App.selectedPlayers.has(name)) App.selectedPlayers.delete(name);
    else App.selectedPlayers.add(name);
    updateSelectionUI();
    renderTable();
    savePrefs();
}

function setClassFilter(cls) {
    App.activeClassFilter = cls;
    applyFilters();
    renderClassFilters();
    savePrefs();
}

function setSort(key) {
    if (App.sortKey === key) App.sortAsc = !App.sortAsc;
    else { App.sortKey = key; App.sortAsc = (key === 'rank' || key === 'name' || key === 'class'); }
    updateSortHeaders();
    applyFilters();
    savePrefs();
}

function updateSortHeaders() {
    document.querySelectorAll('.ladder-table th[data-sort]').forEach(th => {
        const k = th.dataset.sort;
        const a = th.querySelector('.sort-arrow');
        th.classList.toggle('sort-active', k === App.sortKey);
        a.textContent = k === App.sortKey ? (App.sortAsc ? '▲' : '▼') : '';
    });
}

// HTML escaping
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function escJs(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ---------------------------------------------------------------------------
// Toggle Helpers
// ---------------------------------------------------------------------------
function restoreToggleState(containerId, attr, value) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.querySelectorAll('button').forEach(btn => {
        // Handle string values (e.g. '1h') and int values
        const btnVal = btn.getAttribute(attr);
        const match = btnVal === String(value);
        btn.classList.toggle('active', match);
    });
}

// ---------------------------------------------------------------------------
// Vertical (Detail/Compare) Resize
// ---------------------------------------------------------------------------
function initPanelResize() {
    const handle = document.getElementById('panel-resize-handle');
    const detail = document.getElementById('detail-panel');
    const compare = document.getElementById('compare-panel');
    const rightPanel = document.getElementById('right-panel');
    let dragging = false;

    // Restore saved ratio
    detail.style.flex = `${App.detailHeightRatio}`;
    compare.style.flex = `${1 - App.detailHeightRatio}`;

    handle.addEventListener('mousedown', (e) => {
        dragging = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = rightPanel.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const total = rect.height;
        const ratio = Math.max(0.15, Math.min(0.85, y / total));
        detail.style.flex = `${ratio}`;
        compare.style.flex = `${1 - ratio}`;
        App.detailHeightRatio = ratio;
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            savePrefs();
        }
    });
}

// ---------------------------------------------------------------------------
// Horizontal (Ladder/Right) Resize
// ---------------------------------------------------------------------------
function initHorizontalResize() {
    const handle = document.getElementById('h-resize-handle');
    const ladder = document.getElementById('ladder-panel');
    const right = document.getElementById('right-panel');
    const main = document.querySelector('.main-content');
    let dragging = false;

    // Restore saved width
    applyHorizontalSplit();

    handle.addEventListener('mousedown', (e) => {
        dragging = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = main.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const total = rect.width;
        const pct = Math.max(25, Math.min(75, (x / total) * 100));
        App.ladderWidthPct = pct;
        applyHorizontalSplit();
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            savePrefs();
        }
    });
}

function applyHorizontalSplit() {
    const ladder = document.getElementById('ladder-panel');
    const right = document.getElementById('right-panel');
    ladder.style.flex = `0 0 ${App.ladderWidthPct}%`;
    right.style.flex = `1`;
}

// ---------------------------------------------------------------------------
// Column Settings
// ---------------------------------------------------------------------------
function initColumnSettings() {
    const btn = document.getElementById('settings-btn');
    const dropdown = document.getElementById('settings-dropdown');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => dropdown.classList.remove('open'));
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const col = cb.dataset.col;
            if (cb.checked) App.hiddenColumns.delete(col);
            else App.hiddenColumns.add(col);
            updateColumnVisibility();
        });
    });
}

// ---------------------------------------------------------------------------
// Toggle Wiring (rate + time range for detail & compare)
// ---------------------------------------------------------------------------
function initToggles() {
    // Ladder Interval Toggle
    setupToggleGroup('ladder-interval-toggle', 'data-interval', (v) => {
        App.ladderInterval = v; // v is "1h", "4h" string here, not int
        savePrefs();
        applyFilters(); // Re-sort and render
    });

    // Meta Distribution Toggle
    const metaBtn = document.getElementById('meta-toggle-btn');
    if (metaBtn) {
        metaBtn.addEventListener('click', () => {
            App.showMeta = !App.showMeta;
            savePrefs();
            renderMetaDistribution();
        });
    }

    // Detail rate toggle
    setupToggleGroup('detail-rate-toggle', 'data-interval', (v) => {
        App.detailRateInterval = parseInt(v, 10);
        savePrefs();
        rerenderDetailCharts();
    });

    // Detail time range toggle
    setupToggleGroup('detail-range-toggle', 'data-range', (v) => {
        App.detailTimeRange = parseInt(v, 10);
        savePrefs();
        rerenderDetailCharts();
    });

    // Compare rate toggle
    setupToggleGroup('compare-rate-toggle', 'data-interval', (v) => {
        App.compareRateInterval = parseInt(v, 10);
        savePrefs();
        if (typeof rerenderCompareCharts === 'function') rerenderCompareCharts();
    });

    // Compare time range toggle
    setupToggleGroup('compare-range-toggle', 'data-range', (v) => {
        App.compareTimeRange = parseInt(v, 10);
        savePrefs();
        if (typeof rerenderCompareCharts === 'function') rerenderCompareCharts();
    });
}

function setupToggleGroup(containerId, attr, onChange) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            c.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(btn.getAttribute(attr));
        });
    });
}

function rerenderDetailCharts() {
    if (typeof _lastDetailHistory !== 'undefined' && _lastDetailHistory) {
        renderDetailCharts(_lastDetailHistory, _lastDetailDeaths, _lastDetailHasDepth,
            App.detailRateInterval, App.detailTimeRange);
    }
}

// ---------------------------------------------------------------------------
// Auto-Refresh
// ---------------------------------------------------------------------------
function startAutoRefresh() {
    App.refreshTimer = setInterval(() => {
        loadLadder(true); // silent refresh
    }, 5 * 60 * 1000); // every 5 minutes
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    loadPrefs();

    loadLadder(false);

    document.getElementById('search-input').addEventListener('input', (e) => {
        App.searchQuery = e.target.value;
        applyFilters();
    });

    document.querySelectorAll('.ladder-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => setSort(th.dataset.sort));
    });

    document.getElementById('select-all').addEventListener('change', (e) => {
        if (e.target.checked) App.filteredData.forEach(p => App.selectedPlayers.add(p.name));
        else App.selectedPlayers.clear();
        updateSelectionUI();
        renderTable();
        savePrefs();
    });

    document.getElementById('compare-btn').addEventListener('click', triggerComparison);

    document.getElementById('clear-compare-btn').addEventListener('click', () => {
        App.selectedPlayers.clear();
        document.getElementById('select-all').checked = false;
        updateSelectionUI();
        renderTable();
        clearComparison();
        savePrefs();
    });

    initPanelResize();
    initHorizontalResize();
    initColumnSettings();
    initToggles();
    startAutoRefresh();

    // Restore states
    updateColumnVisibility();
    updateSortHeaders();

    // Restore ladder interval toggle active state
    restoreToggleState('ladder-interval-toggle', 'data-interval', App.ladderInterval);
});
