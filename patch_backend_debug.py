import re

with open('api/runs.js', 'r') as f:
    content = f.read()

# Update logging to trace why Set Seed is empty
debug_logic = """
        // 3. Fetch Leaderboard (Verified)
        let lbUrl = `leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players`;
        if (seedVarId && seedValId) lbUrl += `&var-${seedVarId}=${seedValId}`;
        if (verSubVarId && verSubValId) lbUrl += `&var-${verSubVarId}=${verSubValId}`;

        console.log(`Fetching Leaderboard: ${lbUrl}`);
"""
content = re.sub(r'        // 3\. Fetch Leaderboard \(Verified\)\n        let lbUrl = `leaderboards/\$\{GAME_ID\}/category/\$\{CAT_ID\}\?top=1000&embed=players`;\n        if \(seedVarId && seedValId\) lbUrl \+= `&var-\$\{seedVarId\}=\$\{seedValId\}`;\n        if \(verSubVarId && verSubValId\) lbUrl \+= `&var-\$\{verSubVarId\}=\$\{verSubValId\}`;', debug_logic, content)


with open('api/runs.js', 'w') as f:
    f.write(content)
