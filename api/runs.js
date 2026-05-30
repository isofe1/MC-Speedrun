// api/runs.js
const HEADER = "https://www.speedrun.com/api/v1/";
const GAME_ID = "j1npme6p"; 
const CAT_ID = "mkeyl926"; 
const EXACT_VER_VAR_ID = "jlzkwql2";

export default async function handler(req, res) {
    try {
        const fetchFromSrc = async (endpoint) => {
            const response = await fetch(HEADER + endpoint);
            if (!response.ok) throw new Error(`SRC API Error: ${response.status}`);
            return response.json();
        };

        // 1. Resolve Variables
        const varData = await fetchFromSrc(`games/${GAME_ID}/variables`);
        let seedVarId, seedValId;
        for (let v of varData.data) {
            if (v.category !== CAT_ID) continue;
            for (let valId in v.values.values) {
                if (v.values.values[valId].label === "Random Seed") { seedVarId = v.id; seedValId = valId; }
            }
        }

        // 2. Fetch Leaderboard and Queue concurrently
        let lbUrl = `leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players&var-${seedVarId}=${seedValId}`;
        const queueOffsets = [0, 200, 400]; // 3 pages is usually enough to cover pending queue
        
        const [lbData, ...queueResults] = await Promise.all([
            fetchFromSrc(lbUrl).catch(() => ({ data: { runs: [], players: { data: [] } } })),
            ...queueOffsets.map(off => fetchFromSrc(`runs?game=${GAME_ID}&category=${CAT_ID}&status=new&max=200&offset=${off}`).catch(() => ({ data: [] })))
        ]);

        // 3. Map Official Ranks
        let officialRanks = {};
        if (lbData?.data?.runs) {
            lbData.data.runs.forEach(item => {
                const rank = item.rank;
                if (item.run?.players) {
                    item.run.players.forEach(p => { if(p.id) officialRanks[p.id] = rank; });
                }
            });
        }

        // 4. Combine and Filter
        let allCombined = [];
        
        // Add Leaderboard runs
        if (lbData?.data?.runs) {
            lbData.data.runs.forEach(item => {
                allCombined.push({
                    time: item.run.times.primary_t,
                    players: item.run.players,
                    version: "1.16-1.19",
                    date: item.run.date || "Unknown",
                    timestamp: item.run.submitted || item.run.date || "1970-01-01",
                    weblink: item.run.weblink,
                    status: 'Verified'
                });
            });
        }

        // Add Queue runs
        queueResults.forEach(res => {
            if (res?.data) {
                res.data.forEach(run => {
                    allCombined.push({
                        time: run.times.primary_t,
                        players: run.players.data || run.players,
                        version: "1.16-1.19",
                        date: run.date || "Unknown",
                        timestamp: run.submitted || run.date || "1970-01-01",
                        weblink: run.weblink,
                        status: 'Pending'
                    });
                });
            }
        });

        allCombined.sort((a, b) => a.time - b.time);

        // 5. Send back all data
        return res.status(200).json({ 
            leaderboard: allCombined.filter(r => r.status === 'Verified'), 
            queue: allCombined.filter(r => r.status === 'Pending'),
            officialRanks: officialRanks,
            updated: new Date().toISOString()
        });

    } catch (error) {
        console.error("Critical Backend Error:", error);
        return res.status(500).json({ error: 'Failed to fetch data' });
    }
}
