import re

with open('api/runs.js', 'r') as f:
    content = f.read()

# Update the logic to not crash if the exact version ID is missing on some runs
fix_logic = """
        // Process Leaderboard
        let officialRankCounter = 1;
        if (lbData && lbData.data && lbData.data.runs) {
            for (let item of lbData.data.runs) {
                let run = item.run;
                let verLbl = "Unknown";
                if (run.values && run.values[EXACT_VER_VAR_ID]) {
                    verLbl = var_map[run.values[EXACT_VER_VAR_ID]] || "Unknown";
                }

                // Only count the rank if it's a valid run and time is >= 5 minutes (300 seconds)
                if (run.times.primary_t >= 300) {
"""
content = re.sub(r'        // Process Leaderboard\n        let officialRankCounter = 1;\n        if \(lbData && lbData\.data && lbData\.data\.runs\) \{\n            for \(let item of lbData\.data\.runs\) \{\n                let run = item\.run;\n                let verLbl = var_map\[run\.values\[EXACT_VER_VAR_ID\]\];\n\n                // Only count the rank if it\'s a valid run and time is >= 5 minutes \(300 seconds\)\n                if \(run\.times\.primary_t >= 300\) \{', fix_logic, content)


fix_logic_queue = """
        for (let run of allQueueRuns) {
            let verLbl = "Unknown";
            if (run.values && run.values[EXACT_VER_VAR_ID]) {
                verLbl = var_map[run.values[EXACT_VER_VAR_ID]] || "Unknown";
            }

            // Note for queue runs we still need to filter because the API doesn't filter by vars on the /runs endpoint like it does on leaderboards
            if (run.values && run.values[seedVarId] === seedValId && run.values[verSubVarId] === verSubValId && run.times.primary_t >= 300) {
"""
content = re.sub(r'        for \(let run of allQueueRuns\) \{\n            let verLbl = var_map\[run\.values\[EXACT_VER_VAR_ID\]\];\n\n            if \(run\.values\[seedVarId\] === seedValId && run\.values\[verSubVarId\] === verSubValId && run\.times\.primary_t >= 300\) \{', fix_logic_queue, content)


with open('api/runs.js', 'w') as f:
    f.write(content)
