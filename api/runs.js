// api/runs.js
const HEADER = "https://www.speedrun.com/api/v1/";
const GAME_ID = "j1npme6p"; 
const CAT_ID = "mkeyl926"; 
const EXACT_VER_VAR_ID = "jlzkwql2";

export default async function handler(req, res) {
    try {
        console.log("DEBUG: Starting API fetch...");

        const fetchFromSrc = async (endpoint) => {
            console.log(`DEBUG: Fetching ${endpoint}`);
            const res = await fetch(HEADER + endpoint);
            if (!res.ok) throw new Error(`SRC API returned ${res.status}`);
            return res.json();
        };

        // 2. Resolve Variables
        const varData = await fetchFromSrc(`games/${GAME_ID}/variables`);
        let seedVarId, seedValId;
        for (let v of varData.data) {
            if (v.category !== CAT_ID) continue;
            for (let valId in v.values.values) {
                if (v.values.values[valId].label === "Random Seed") { seedVarId = v.id; seedValId = valId; }
            }
        }

        // 3. Fetch Data Concurrently
        let lbUrl = `leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players&var-${seedVarId}=${seedValId}`;
        const queueOffsets = [0, 200, 400]; // Reduced to 3 pages for testing
        
        console.log("DEBUG: Executing all requests...");
        const results = await Promise.all([
            fetchFromSrc(lbUrl).catch(e => { console.error("DEBUG: LB Error", e); return { data: { runs: [] } }; }),
            ...queueOffsets.map(off => fetchFromSrc(`runs?game=${GAME_ID}&category=${CAT_ID}&status=new&max=200&offset=${off}`).catch(e => { console.error("DEBUG: Queue Error", e); return { data: [] }; }))
        ]);

        console.log("DEBUG: Fetched successfully. Processing...");
        // ... (rest of your logic to combine data)
        
        // Return success
        return res.status(200).json({ leaderboard: [], queue: [], updated: new Date().toISOString() });

    } catch (error) {
        console.error("DEBUG: CRITICAL ERROR in api/runs.js", error);
        return res.status(500).json({ error: error.message });
    }
}
