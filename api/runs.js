// api/runs.js
const HEADER = "https://www.speedrun.com/api/v1/";
const GAME_ID = "j1npme6p"; 
const CAT_ID = "mkeyl926"; 
const EXACT_VER_VAR_ID = "jlzkwql2";


// In-memory cache for the serverless function. Map of paramKey -> {data, lastFetchTime}
let cacheMap = {};
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds


async function fetchFromSrc(endpoint, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(HEADER + endpoint);
            if (!res.ok) throw new Error(`Speedrun API returned ${res.status}`);
            return await res.json();
        } catch (error) {
            if (i === retries) throw error;
            console.warn(`Fetch failed for ${endpoint}, retrying in 1s... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}


export default async function handler(req, res) {
    const seedTypeQuery = req.query.seedType || 'random';
    const versionQuery = req.query.version || '4qye4731'; // default 1.16-1.19
    const cacheKey = `${seedTypeQuery}-${versionQuery}`;

    // 1. Check Cache
    const now = Date.now();
    if (cacheMap[cacheKey] && (now - cacheMap[cacheKey].lastFetchTime < CACHE_DURATION_MS)) {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).json(cacheMap[cacheKey].data);
    }


    try {

        // 2. Resolve Variables dynamically
        const varData = await fetchFromSrc(`games/${GAME_ID}/variables`);
        let var_map = {}; 

        let seedVarId = null;
        let seedValId = null;
        let verSubVarId = null;
        let verSubValId = versionQuery; // We already have the value from the frontend

        // Find the correct seed variable ID
        let targetSeedLabel = seedTypeQuery === 'set' ? 'Set Seed' : 'Random Seed';

        for (let v of varData.data) {
            if (v.category && v.category !== CAT_ID) continue;

            // Check if this variable is the Seed Type
            if (v.name && v.name.includes("Seed Type") && v.category === CAT_ID) {
               seedVarId = v.id;
               for (let valId in v.values.values) {
                   if (v.values.values[valId].label === targetSeedLabel) {
                       seedValId = valId;
                   }
               }
            }

            // Check if this variable is the Version Range
            if (v.name && v.name.includes("Version Range") && v.category === CAT_ID) {
                verSubVarId = v.id;
            }

            for (let valId in v.values.values) {
                let label = v.values.values[valId].label;
                var_map[valId] = label;
            }
        }



        // 3. Fetch Leaderboard (Verified)
        let lbUrl = `leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players`;
        if (seedVarId && seedValId) lbUrl += `&var-${seedVarId}=${seedValId}`;
        if (verSubVarId && verSubValId) lbUrl += `&var-${verSubVarId}=${verSubValId}`;
        
        console.log(`Fetching Leaderboard: ${lbUrl}`);


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
        let officialRanks = {};
        let allCombined = [];




        // Process Leaderboard
        let officialRankCounter = 1;
        if (lbData && lbData.data && lbData.data.runs) {
            for (let item of lbData.data.runs) {
                let run = item.run;
                let verLbl = "Unknown";
                if (run.values && run.values[EXACT_VER_VAR_ID]) {
                    verLbl = var_map[run.values[EXACT_VER_VAR_ID]] || "Unknown";
                }


                // Only count the rank if it's a valid run and time is >= 5 minutes (300 seconds) for random seeds
                const minTime = seedTypeQuery === 'random' ? 300 : 0;
                if (run.times.primary_t >= minTime) {



                    
                    // --- THE FIX: Assign exact rank manually based on valid runs ---
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


        // Process Queue
        let allQueueRuns = [];
        for (let res of queueResults) {
            if (res && res.data) allQueueRuns.push(...res.data);
        }


        for (let run of allQueueRuns) {
            let verLbl = "Unknown";
            if (run.values && run.values[EXACT_VER_VAR_ID]) {
                verLbl = var_map[run.values[EXACT_VER_VAR_ID]] || "Unknown";
            }


            // Note for queue runs we still need to filter because the API doesn't filter by vars on the /runs endpoint like it does on leaderboards
            const minTime = seedTypeQuery === 'random' ? 300 : 0;
            if (run.values && run.values[seedVarId] === seedValId && run.values[verSubVarId] === verSubValId && run.times.primary_t >= minTime) {



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
        let finalData = {
            leaderboard: deduplicatedLeaderboard,
            queue: pureQueue,
            officialRanks: officialRanks, 
            updated: new Date().toISOString()
        };

        cacheMap[cacheKey] = {
            data: finalData,
            lastFetchTime: Date.now()
        };

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).json(finalData);


    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: 'Failed to fetch data' });
    }
}
