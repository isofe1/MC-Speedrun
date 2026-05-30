// Data State
let serverData = { leaderboard: [], queue: [] };
let activeTab = 'leaderboard'; // 'leaderboard' or 'queue'
let currentPage = 1;
const runsPerPage = 100;
let dateSortState = 0; 

// Initialize

const HEADER = "https://www.speedrun.com/api/v1/";
const GAME_ID = "j1npme6p";
const CAT_ID = "mkeyl926";
const EXACT_VER_VAR_ID = "jlzkwql2";

async function fetchFromSrc(endpoint, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(endpoint.startsWith('http') ? endpoint : HEADER + endpoint);
            if (!res.ok) throw new Error(`Speedrun API returned ${res.status}`);
            return await res.json();
        } catch (error) {
            if (i === retries) throw error;
            console.warn(`Fetch failed for ${endpoint}, retrying in 1s... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function fetchServerData() {
    try {
        const varData = await fetchFromSrc(`https://www.speedrun.com/api/v1/games/${GAME_ID}/variables`);
        let var_map = {};
        let seedVarId, seedValId;
        let verSubVarId, verSubValId;

        for (let v of varData.data) {
            if (v.category && v.category !== CAT_ID) continue;
            for (let valId in v.values.values) {
                let label = v.values.values[valId].label;
                var_map[valId] = label;
                if (label === "Random Seed") { seedVarId = v.id; seedValId = valId; }
                if (label === "1.16+") { verSubVarId = v.id; verSubValId = valId; }
            }
        }

        let lbUrl = `https://www.speedrun.com/api/v1/leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players`;
        if (seedVarId && seedValId) lbUrl += `&var-${seedVarId}=${seedValId}`;
        if (verSubVarId && verSubValId) lbUrl += `&var-${verSubVarId}=${verSubValId}`;
        
        const queueOffsets = [0, 200, 400, 600, 800];
        const queuePromises = queueOffsets.map(offset =>
            fetchFromSrc(`https://www.speedrun.com/api/v1/runs?game=${GAME_ID}&category=${CAT_ID}&status=new&orderby=submitted&direction=desc&embed=players&max=200&offset=${offset}`)
            .catch(() => ({ data: [] }))
        );

        const [lbData, ...queueResults] = await Promise.all([
            fetchFromSrc(lbUrl),
            ...queuePromises
        ]);

        const lbPlayers = lbData.data.players.data;
        let officialRanks = {};
        let allCombined = [];

        const isTargetVersion = (verLbl) => {
            if (!verLbl) return false;
            let m = verLbl.match(/^1\.(\d+)/);
            return (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 19);
        };

        let officialRankCounter = 1;
        if (lbData && lbData.data && lbData.data.runs) {
            for (let item of lbData.data.runs) {
                let run = item.run;
                let verLbl = var_map[run.values[EXACT_VER_VAR_ID]];

                if (isTargetVersion(verLbl) && run.values[seedVarId] === seedValId) {
                    if (run.players) {
                        run.players.forEach(p => {
                            if (p.id && !officialRanks[p.id]) {
                                officialRanks[p.id] = officialRankCounter;
                            }
                        });
                    }
                    officialRankCounter++;

                    let resolvedPlayers = run.players.map(p => {
                        if (p.rel === 'user') return lbPlayers.find(u => u.id === p.id) || p;
                        return p;
                    });
                    let playerKey = resolvedPlayers.map(p => p.id || p.name).sort().join("|");

                    allCombined.push({
                        time: run.times.primary_t,
                        players: resolvedPlayers,
                        playerKey: playerKey,
                        version: verLbl,
                        date: run.date || (run.submitted ? run.submitted.split("T")[0] : "Unknown"),
                        timestamp: run.submitted || run.date || "1970-01-01",
                        weblink: run.weblink.replace("http://", "https://"),
                        status: 'Verified'
                    });
                }
            }
        }

        let allQueueRuns = [];
        for (let res of queueResults) {
            if (res && res.data) allQueueRuns.push(...res.data);
        }

        for (let run of allQueueRuns) {
            let verLbl = var_map[run.values[EXACT_VER_VAR_ID]];

            if (isTargetVersion(verLbl) && run.values[seedVarId] === seedValId) {
                let resolvedPlayers = (run.players && run.players.data) ? run.players.data : run.players;
                let playerKey = resolvedPlayers.map(p => p.id || p.name).sort().join("|");

                allCombined.push({
                    time: run.times.primary_t,
                    players: resolvedPlayers,
                    playerKey: playerKey,
                    version: verLbl,
                    date: run.date || (run.submitted ? run.submitted.split("T")[0] : "Unknown"),
                    timestamp: run.submitted || run.date || "1970-01-01",
                    weblink: run.weblink.replace("http://", "https://"),
                    status: 'Pending'
                });
            }
        }

        allCombined.sort((a, b) => a.time - b.time);

        let deduplicatedLeaderboard = [];
        let seenPlayers = new Set();
        
        for (let run of allCombined) {
            if (!seenPlayers.has(run.playerKey)) {
                deduplicatedLeaderboard.push(run);
                seenPlayers.add(run.playerKey);
            }
        }

        let pureQueue = allCombined.filter(r => r.status === 'Pending');
        pureQueue.sort((a, b) => a.time - b.time);

        serverData = {
            leaderboard: deduplicatedLeaderboard,
            queue: pureQueue,
            officialRanks: officialRanks,
            updated: new Date().toISOString()
        };

        document.getElementById('last-updated').innerText = `Last updated: Just now`;
        renderTab();

    } catch (error) {
        console.error("Error fetching data:", error);

let el = document.getElementById("status-container");
if (el) {
    el.innerHTML = `<span style="color:var(--error);">Failed to load data. Please refresh.</span>`;
} else {
    document.getElementById("table-body").innerHTML = `<tr><td colspan="7" style="text-align:center; color:#E44141; padding: 40px;"><b>Failed to fetch data from backend.</b></td></tr>`;
}

    }
}
function updateURL(tab, page) {
    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    if (page > 1) {
        url.searchParams.set('page', page);
    } else {
        url.searchParams.delete('page');
    }
    window.history.pushState({ tab, page }, '', url);
}

window.addEventListener('popstate', (event) => {
    if (event.state) {
        activeTab = event.state.tab || 'leaderboard';
        currentPage = event.state.page || 1;
    } else {
        activeTab = 'leaderboard';
        currentPage = 1;
    }
    dateSortState = 0;

    updateTabUI();
    renderTab();
});

function updateTabUI() {
    document.getElementById('tab-leaderboard').classList.toggle('active', activeTab === 'leaderboard');
    document.getElementById('tab-queue').classList.toggle('active', activeTab === 'queue');

    document.getElementById('page-desc').innerText = activeTab === 'leaderboard'
        ? "Combined Leaderboard (Verified & Pending)"
        : "Pending Verification Queue";
}

// Tab Switching
window.switchTab = function(tab) {
    if (activeTab === tab) return;
    activeTab = tab;
    currentPage = 1;
    dateSortState = 0; 
    
    updateTabUI();
    updateURL(activeTab, currentPage);
    renderTab();
}

// Formatting Helpers
function escape(str) { return String(str || "?").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function hex(num) { return Math.round(Math.max(0, Math.min(255, num))).toString(16); }
function splitRGB(rgb) { return rgb.match(/.{1,2}/g).map(x => parseInt(x, 16)); }
function joinRGB(rgb) { return rgb.map(x => hex(x).padStart(2, "0")).join(""); }
function gradient(start, end, len) {
    let colors = [];
    let s = splitRGB(start), e = splitRGB(end);
    for (let i = 0; i < len; i++) {
        let weight = len == 1 ? 0 : (i / (len - 1));
        colors.push(joinRGB(s.map((c, idx) => (c * (1 - weight) + e[idx] * weight))));
    }
    return colors;
}

// --- NEW: formatPlayer incorporates the CSS Tooltip ---
function formatPlayer(user, runStatus) {
    if (!user) return "?";
    let flagHtml = '<span class="player-flag-empty"></span>'; 
    let nameStr = user.names?.international || user.name || "?";
    let pid = user.id || user.name;
    
    let rankBadge = "";
    if (runStatus === 'Pending' && serverData.officialRanks && serverData.officialRanks[pid]) {
        rankBadge = `<span class="rank-badge tooltip">#${serverData.officialRanks[pid]}<span class="tooltiptext">Official Verified Rank</span></span>`;
    }

    if (user.location?.country?.code) {
        let cc = user.location.country.code.toLowerCase();
        flagHtml = `<img src="https://www.speedrun.com/images/flags/${cc}.png" alt="${cc}" class="player-flag">`;
    } else if (user.rel === "guest") {
        let match = nameStr.match(/^\[([a-z]{2,3})\](.*)/i);
        if (match) {
            let cc = match[1].toLowerCase();
            nameStr = match[2].trim();
            flagHtml = `<img src="https://www.speedrun.com/images/flags/${cc}.png" alt="${cc}" class="player-flag">`;
        }
    }

    let display = escape(nameStr);
    if (!("rel" in user) || user.rel == "user") {
        let style = user["name-style"];
        if (style?.style == "gradient") {
            let gr = gradient(style["color-from"].dark.slice(1), style["color-to"].dark.slice(1), nameStr.length);
            display = gr.map((c, i) => `<span style="color:#${c}">${escape(nameStr[i])}</span>`).join("");
        } else if (style?.style == "solid") {
            display = `<span style="color:${style.color.dark}">${escape(nameStr)}</span>`;
        }
        return `<span class="player-wrapper">${flagHtml}<b>${display}</b>${rankBadge}</span>`;
    } 
    return `<span class="player-wrapper">${flagHtml}<span>${display}</span>${rankBadge}</span>`;
}

function str_time(time) {
    let m = Math.round(time * 1000);
    let h = Math.floor(m / 3600000), min = Math.floor((m % 3600000) / 60000), s = Math.floor((m % 60000) / 1000), ms = m % 1000;
    let res = (h > 0) ? `${h}:${String(min).padStart(2,"0")}:${String(s).padStart(2,"0")}` : (min > 0) ? `${min}:${String(s).padStart(2,"0")}` : `0:${String(s).padStart(2,"0")}`;
    if (ms > 0) res += `.${String(ms).padStart(3,"0")}`;
    return res;
}

function timeAgo(dateString) {
    if (!dateString || dateString === "Unknown" || dateString === "1970-01-01") return "Unknown date";
    
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return "Just now";
}

window.toggleDateSort = function() {
    if (activeTab !== 'queue') return;
    dateSortState = (dateSortState + 1) % 3;
    
    if (dateSortState === 0) serverData.queue.sort((a, b) => a.time - b.time);
    else if (dateSortState === 1) serverData.queue.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    else serverData.queue.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    currentPage = 1;
    renderTab();
}

function renderTab() {
    const list = activeTab === 'leaderboard' ? serverData.leaderboard : serverData.queue;
    const isQueue = activeTab === 'queue';

    document.getElementById('run-count').innerText = `${list.length} ${isQueue ? 'Total Runs' : 'Unique Runners'}`;
    document.getElementById('avg-time').innerText = isQueue ? 'Pending Verification' : `${serverData.queue.length} pending verification`;

    let dateHeader = isQueue 
        ? `<th class="sortable-th" onclick="toggleDateSort()" title="Click to sort">Date Submitted <span id="date-sort-arrow">${dateSortState === 1 ? '▼' : dateSortState === 2 ? '▲' : ''}</span></th>`
        : `<th>Date</th>`;

    document.getElementById('table-head').innerHTML = `
        <th style="width: 50px; text-align: center;">${isQueue ? 'Row' : '#'}</th>
        <th>Player(s)</th>
        <th>Time</th>
        ${isQueue ? '' : '<th>Status</th>'}
        <th>Version</th>
        ${dateHeader}
        <th>Link</th>
    `;

    let tableHTML = "";
    if (list.length === 0) {
        tableHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color:#a0a0a0;">No runs found.</td></tr>`;
    } else {
        const start = (currentPage - 1) * runsPerPage;
        const pageRuns = list.slice(start, start + runsPerPage);

        pageRuns.forEach((run, index) => {
            let rank = start + index + 1;
            let rankDisplay = `#${rank}`;
            
            if (!isQueue) {
                if (rank === 1) rankDisplay = `<img src="1st.png" class="trophy-icon">`;
                if (rank === 2) rankDisplay = `<img src="2nd.png" class="trophy-icon">`;
                if (rank === 3) rankDisplay = `<img src="3rd.png" class="trophy-icon">`;
            }

            let p_html = run.players.map(p => formatPlayer(p, run.status)).join(", ");
            let stat = run.status === 'Verified' ? `<span class="status-badge status-verified">Verified</span>` : `<span class="status-badge status-pending">Unverified</span>`;

            tableHTML += `<tr>
                <td style="color:var(--text-muted); font-weight:700; text-align:center;">${rankDisplay}</td>
                <td>${p_html}</td>
                <td style="color:var(--accent); font-weight:600;">${str_time(run.time)}</td>
                ${isQueue ? '' : `<td>${stat}</td>`}
                <td><span style="background:#2a2a2a; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">${run.version}</span></td>
                <td><span title="${run.date}" style="cursor: help; border-bottom: 1px dotted var(--text-muted);">${timeAgo(run.timestamp || run.date)}</span></td>
                <td>
                    <a href="${run.weblink}" target="_blank" class="external" title="Review Run">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </td>
            </tr>`;
        });
    }

    document.getElementById("table-body").innerHTML = tableHTML;
    renderPagination(list.length);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / runsPerPage);
    let html = "";
    if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
            let act = (i === currentPage) ? "active" : "";
            html += `<button class="page-btn ${act}" onclick="changePage(${i})">${i}</button>`;
        }
    }
    document.getElementById("pagination").innerHTML = html;
}

window.changePage = function(page) {
    if (currentPage === page) return;
    currentPage = page;
    updateURL(activeTab, currentPage);
    renderTab();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// In Capacitor, the Android Back button natively triggers popstate when there is history
window.addEventListener('popstate', (event) => {
    if (event.state) {
        activeTab = event.state.tab || 'leaderboard';
        currentPage = event.state.page || 1;
        updateTabUI();
        renderTab();
    }
});

window.onload = () => {
    // Read initial state from URL
    const urlParams = new URLSearchParams(window.location.search);
    activeTab = urlParams.get('tab') === 'queue' ? 'queue' : 'leaderboard';
    currentPage = parseInt(urlParams.get('page')) || 1;

    // Set initial history state to allow popstate to work correctly returning to the very first load
    window.history.replaceState({ tab: activeTab, page: currentPage }, '', window.location.href);

    updateTabUI();
    fetchServerData();
};

// Auto-refresh every 60 seconds (1 minute)
setInterval(fetchServerData, 60000);





document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        fetchServerData();
    }
});


// Register Capacitor App Back Button if available (Capacitor 3+)
if (window.Capacitor) {
    // The App plugin is automatically available in the webview context on Capacitor when installed.
    // However, the best cross-compatibility way without a bundler is to rely on history API.
}
