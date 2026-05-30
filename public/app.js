// Data State
let serverData = { leaderboard: [], queue: [] };
let activeTab = 'leaderboard'; // 'leaderboard' or 'queue'
let currentPage = 1;
const runsPerPage = 100;
let dateSortState = 0; 

// Initialize
async function fetchServerData() {
    try {
        const res = await fetch('/api/runs'); 
        if (!res.ok) throw new Error("Server error");
        serverData = await res.json();
        
        // Show update time
        const date = new Date(serverData.updated);
        document.getElementById('last-updated').innerText = `Last updated: ${date.toLocaleTimeString()}`;
        
        renderTab();
    } catch (err) {
        console.error(err);
        document.getElementById('table-body').innerHTML = `<tr><td colspan="7" style="text-align:center; color:#E44141; padding: 40px;"><b>Failed to fetch data from backend.</b></td></tr>`;
    }
}

// Auto-refresh every 60 seconds (1 minute)
setInterval(fetchServerData, 60000);

// Tab Switching
window.switchTab = function(tab) {
    activeTab = tab;
    currentPage = 1;
    dateSortState = 0; 
    
    document.getElementById('tab-leaderboard').classList.toggle('active', tab === 'leaderboard');
    document.getElementById('tab-queue').classList.toggle('active', tab === 'queue');
    
    // Update headers text
    document.getElementById('page-desc').innerText = tab === 'leaderboard' 
        ? "Combined Leaderboard (Verified & Pending)" 
        : "Pending Verification Queue";
        
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
                <td><a href="${run.weblink}" target="_blank" class="external">Review</a></td>
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
    currentPage = page;
    renderTab();
    document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.onload = fetchServerData;
