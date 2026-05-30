// Data State
let serverData = { leaderboard: [], queue: [], officialRanks: {}, updated: "" };
let activeTab = 'leaderboard';
let currentPage = 1;
const runsPerPage = 100;

async function fetchServerData() {
    try {
        const res = await fetch('/api/runs');
        if (!res.ok) throw new Error("Fetch failed");
        serverData = await res.json();
        if (serverData.updated) {
            document.getElementById('last-updated').innerText = `Last updated: ${new Date(serverData.updated).toLocaleTimeString()}`;
        }
        renderTab();
    } catch (err) {
        console.error(err);
    }
}

function escape(str) { return String(str || "?").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }

function formatPlayer(user, isPending) {
    const p = user.data || user;
    const name = p.names?.international || p.name || "?";
    let badge = "";
    
    // Only show rank if pending run and player has an official rank
    if (isPending && serverData.officialRanks && serverData.officialRanks[p.id]) {
        badge = `<span class="rank-badge" style="background:#2a2a2a; color:#a0a0a0; font-size:0.7rem; padding:1px 5px; border-radius:4px; margin-left:6px; border:1px solid #444;">#${serverData.officialRanks[p.id]}</span>`;
    }
    
    return `<span>${escape(name)} ${badge}</span>`;
}

function str_time(time) {
    let m = Math.round(time * 1000);
    let s = Math.floor(m / 1000) % 60;
    let min = Math.floor(m / 60000);
    return `${min}:${String(s).padStart(2,"0")}`;
}

function renderTab() {
    const list = activeTab === 'leaderboard' ? serverData.leaderboard : serverData.queue;
    const isQueue = activeTab === 'queue';
    document.getElementById('run-count').innerText = `${list.length} Runs`;
    
    let html = "";
    list.forEach((item, index) => {
        const run = item.run || item;
        const players = run.players || [];
        const p_html = players.map(p => formatPlayer(p, isQueue)).join(", ");
        
        html += `<tr>
            <td>#${index + 1}</td>
            <td>${p_html}</td>
            <td>${str_time(run.times.primary_t)}</td>
            <td><a href="${run.weblink}" target="_blank">Review</a></td>
        </tr>`;
    });
    
    document.getElementById("table-body").innerHTML = html;
}

window.switchTab = function(tab) {
    activeTab = tab;
    renderTab();
}

setInterval(fetchServerData, 60000);
window.onload = fetchServerData;
