// api/runs.js
const HEADER = "https://www.speedrun.com/api/v1/";
const GAME_ID = "j1npme6p"; 
const CAT_ID = "mkeyl926"; 
const EXACT_VER_VAR_ID = "jlzkwql2";

// In-memory cache for the serverless function
let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds

async function fetchFromSrc(endpoint) {
    const res = await fetch(HEADER + endpoint);
    if (!res.ok) throw new Error(`Speedrun API returned ${res.status}`);
    return res.json();
}

export default async function handler(req, res) {
    // 1. Check Cache
    const now = Date.now();
    if (cachedData && (now - lastFetchTime < CACHE_DURATION_MS)) {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).json(cachedData);
    }

    try {
        // 2. Resolve Variables dynamically
        const varData = await fetchFromSrc(`games/${GAME_ID}/variables`);
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

        // 3. Fetch Leaderboard (Verified)
        let lbUrl = `leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players`;
        if (seedVarId && seedValId) lbUrl += `&var-${seedVarId}=${seedValId}`;
        if (verSubVarId && verSubValId) lbUrl += `&var-${verSubVarId}=${verSubValId}`;
        
        // --- FASTER FETCHING START ---
        const queueOffsets = [0, 200, 400, 600, 800]; 
        const queuePromises = queueOffsets.map(offset => 
            fetchFromSrc(`runs?game=${GAME_ID}&category=${CAT_ID}&status=new&orderby=submitted&direction=desc&embed=players&max=200&offset=${offset}`)
            .catch(() => ({ data: [] })) 
        );

        // Run all API requests concurrently
        const [lbData, ...queueResults] = await Promise.all([
            fetchFromSrc(lbUrl),
            ...queuePromises
        ]);
        // --- FASTER FETCHING END ---

        const lbPlayers = lbData.data.players.data;

        // --- NEW: Safely map Official Ranks ---
        let officialRanks = {};
        if (lbData && lbData.data && lbData.data.runs) {
            lbData.data.runs.forEach(item => {
                if (item.run && item.run.players) {
                    item.run.players.forEach(p => {
                        if (p.id) officialRanks[p.id] = item.rank;
                    });
                }
            });
        }

        let allCombined = [];

        // Helper function to check 1.16 - 1.19
        const isTargetVersion = (verLbl) => {
            if (!verLbl) return false;
            let m = verLbl.match(/^1\.(\d+)/);
            return (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 19);
        };

        // Process Leaderboard
        for (let item of lbData.data.runs) {
            let run = item.run;
            let verLbl = var_map[run.values[EXACT_VER_VAR_ID]];

            if (isTargetVersion(verLbl) && run.values[seedVarId] === seedValId) {
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

        // Process Queue
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

        // 5. Sort & Deduplicate
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

        // 6. Save to Cache and Send
        cachedData = {
            leaderboard: deduplicatedLeaderboard,
            queue: pureQueue,
            officialRanks: officialRanks, // --- NEW: Include ranks in output ---
            updated: new Date().toISOString()
        };
        lastFetchTime = Date.now();

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).json(cachedData);

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: 'Failed to fetch data' });
    }
}
