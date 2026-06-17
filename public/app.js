// Data State
let serverData = { leaderboard: [], queue: [] };
let activeTab = 'leaderboard'; // 'leaderboard' or 'queue'
let currentPage = 1;
const runsPerPage = 100;
let dateSortState = 0; 

// Filter State
let selectedCountryFilter = 'all'; // 'all', 'unknown', or country code (e.g., 'ca')

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

// URL State Management
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
        const urlParams = new URLSearchParams(window.location.search);
        activeTab = urlParams.get('tab') === 'queue' ? 'queue' : 'leaderboard';
        currentPage = parseInt(urlParams.get('page')) || 1;
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
    selectedCountryFilter = 'all'; // Reset filter on tab switch
    document.getElementById('country-dropdown-text').innerText = "All Regions";
    document.querySelector('#country-dropdown-btn .dropdown-icon').innerHTML = "🌐";
    
    updateTabUI();
    updateURL(activeTab, currentPage);
    renderTab();
}

// --- NEW: Custom Country Dropdown Logic ---
function getCountryCode(user) {
    if (!user) return null;
    let nameStr = user.names?.international || user.name || "?";

    if (user.location?.country?.code) {
        return user.location.country.code.toLowerCase();
    } else if (user.rel === "guest") {
        let match = nameStr.match(/^\[([a-z]{2,3})\](.*)/i);
        if (match) {
            return match[1].toLowerCase();
        }
    }
    return null;
}

function getCountryName(user) {
    if (!user) return null;
    if (user.location?.country?.names?.international) {
        return user.location.country.names.international;
    }
    return null; // Guest names usually just have code, so we don't have the full English name without a map. But API returns full names for real users.
}

// Full country name mapping for common guest codes or missing full names
const countryNameMap = {
    "us": "United States", "ca": "Canada", "gb": "United Kingdom", "au": "Australia",
    "de": "Germany", "fr": "France", "it": "Italy", "es": "Spain", "nl": "Netherlands",
    "se": "Sweden", "no": "Norway", "fi": "Finland", "dk": "Denmark", "pl": "Poland",
    "ru": "Russia", "br": "Brazil", "jp": "Japan", "kr": "South Korea", "cn": "China",
    "mx": "Mexico", "ar": "Argentina", "cl": "Chile", "za": "South Africa"
};

function extractCountries(runs) {
    const counts = {};
    const names = {};

    runs.forEach(run => {
        // Run qualifies if ANY player matches the region.
        // To build the list of available regions, we look at all players in the run.
        run.players.forEach(p => {
            const code = getCountryCode(p);
            if (code) {
                counts[code] = (counts[code] || 0) + 1;
                if (!names[code]) {
                    const apiName = getCountryName(p);
                    names[code] = apiName || countryNameMap[code] || code.toUpperCase();
                }
            } else {
                counts['unknown'] = (counts['unknown'] || 0) + 1;
            }
        });
    });

    const countryArray = Object.keys(counts).map(code => ({
        code: code,
        name: code === 'unknown' ? 'Unknown Region' : (names[code] || code.toUpperCase()),
        count: counts[code]
    }));

    // Sort: highest count first, then alphabetical
    countryArray.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
    });

    return countryArray;
}

function populateCountryDropdown(runs) {
    const menu = document.getElementById('country-dropdown-menu');
    const countries = extractCountries(runs);

    let html = `<div class="dropdown-item ${selectedCountryFilter === 'all' ? 'selected' : ''}" data-value="all">
        <span class="dropdown-item-icon">🌐</span>
        <span class="dropdown-item-name">All Regions</span>
    </div>`;

    countries.forEach(c => {
        const isSelected = selectedCountryFilter === c.code;
        let iconHtml = '';
        if (c.code === 'unknown') {
            iconHtml = `<span class="dropdown-item-icon" style="font-size:0.9rem; color: #a0a0a0;">❓</span>`;
        } else {
            iconHtml = `<img src="https://www.speedrun.com/images/flags/${c.code}.png" class="dropdown-item-flag" alt="${c.code}">`;
        }

        html += `<div class="dropdown-item ${isSelected ? 'selected' : ''}" data-value="${c.code}">
            ${iconHtml}
            <span class="dropdown-item-name">${escape(c.name)}</span>
            <span class="dropdown-item-count">(${c.count})</span>
        </div>`;
    });

    menu.innerHTML = html;

    // Attach event listeners to items
    menu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent closing immediately from outside click
            selectedCountryFilter = item.getAttribute('data-value');

            // Update button text and icon
            const nameEl = item.querySelector('.dropdown-item-name');
            document.getElementById('country-dropdown-text').innerText = nameEl ? nameEl.innerText : "All Regions";

            const btnIconEl = document.querySelector('#country-dropdown-btn .dropdown-icon');
            if (selectedCountryFilter === 'all') {
                btnIconEl.innerHTML = "🌐";
            } else if (selectedCountryFilter === 'unknown') {
                btnIconEl.innerHTML = "❓";
            } else {
                btnIconEl.innerHTML = `<img src="https://www.speedrun.com/images/flags/${selectedCountryFilter}.png" alt="${selectedCountryFilter}" style="width: 18px; height: 12px; border-radius: 2px; object-fit: cover;">`;
            }

            // Close dropdown
            menu.classList.remove('show');
            document.getElementById('country-filter-dropdown').classList.remove('open');

            // Reset page and render
            currentPage = 1;
            updateURL(activeTab, currentPage);
            renderTab();
        });
    });
}

// Dropdown toggle listener
document.addEventListener('DOMContentLoaded', () => {
    const dropdownBtn = document.getElementById('country-dropdown-btn');
    const dropdownMenu = document.getElementById('country-dropdown-menu');
    const dropdownContainer = document.getElementById('country-filter-dropdown');

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
        dropdownContainer.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdownContainer.contains(e.target)) {
            dropdownMenu.classList.remove('show');
            dropdownContainer.classList.remove('open');
        }
    });
});

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
    let list = activeTab === 'leaderboard' ? serverData.leaderboard : serverData.queue;
    const isQueue = activeTab === 'queue';

    // Apply country filter
    if (selectedCountryFilter !== 'all') {
        list = list.filter(run => {
            return run.players.some(p => {
                const code = getCountryCode(p);
                if (selectedCountryFilter === 'unknown') {
                    return !code;
                }
                return code === selectedCountryFilter;
            });
        });
    }

    // Populate dropdown dynamically based on the CURRENT un-filtered list for this tab
    // so we always show the available regions for the current tab.
    const baseList = activeTab === 'leaderboard' ? serverData.leaderboard : serverData.queue;
    populateCountryDropdown(baseList);


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
    document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
