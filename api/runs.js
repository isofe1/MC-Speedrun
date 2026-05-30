// api/runs.js
const HEADER = "https://www.speedrun.com/api/v1/";
const GAME_ID = "j1npme6p"; 
const CAT_ID = "mkeyl926"; 

export default async function handler(req, res) {
    try {
        // Fetch Leaderboard and Queue
        const [lbRes, queueRes] = await Promise.all([
            fetch(`${HEADER}leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players`).then(r => r.json()),
            fetch(`${HEADER}runs?game=${GAME_ID}&category=${CAT_ID}&status=new&max=200`).then(r => r.json())
        ]);

        // Map official ranks for players
        let officialRanks = {};
        if (lbRes?.data?.runs) {
            lbRes.data.runs.forEach(item => {
                if(item.run?.players) {
                    item.run.players.forEach(p => { if(p.id) officialRanks[p.id] = item.rank; });
                }
            });
        }

        return res.status(200).json({
            leaderboard: lbRes?.data?.runs || [],
            queue: queueRes?.data || [],
            officialRanks: officialRanks,
            updated: new Date().toISOString()
        });
    } catch (e) {
        return res.status(500).json({ error: 'Failed' });
    }
}
