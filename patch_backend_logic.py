import re

with open('api/runs.js', 'r') as f:
    content = f.read()

# Update dynamic variable resolution to use our request arguments
resolve_logic = """
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
"""
content = re.sub(r'        // 2\. Resolve Variables dynamically.*?            }\n        }', resolve_logic, content, count=1, flags=re.DOTALL)


# Remove isTargetVersion and update filtering logic
is_target_regex = r'        // Helper function to check 1\.16 - 1\.19.*?        };\n'
content = re.sub(is_target_regex, '', content, flags=re.DOTALL)


# Update processing leaderboard
process_lb = """
        // Process Leaderboard
        let officialRankCounter = 1;
        if (lbData && lbData.data && lbData.data.runs) {
            for (let item of lbData.data.runs) {
                let run = item.run;
                let verLbl = var_map[run.values[EXACT_VER_VAR_ID]];

                // Only count the rank if it's a valid run and time is >= 5 minutes (300 seconds)
                if (run.times.primary_t >= 300) {
"""
content = re.sub(r'        // Process Leaderboard\n        let officialRankCounter = 1;\n        if \(lbData && lbData\.data && lbData\.data\.runs\) \{\n            for \(let item of lbData\.data\.runs\) \{\n                let run = item\.run;\n                let verLbl = var_map\[run\.values\[EXACT_VER_VAR_ID\]\];\n\n                // Only count the rank if it\'s a valid 1\.16-1\.19 Random Seed run, and time is >= 5 minutes \(300 seconds\)\n                if \(isTargetVersion\(verLbl\) && run\.values\[seedVarId\] === seedValId && run\.times\.primary_t >= 300\) \{', process_lb, content, count=1)


# Update processing queue
process_queue = """
        // Process Queue
        let allQueueRuns = [];
        for (let res of queueResults) {
            if (res && res.data) allQueueRuns.push(...res.data);
        }

        for (let run of allQueueRuns) {
            let verLbl = var_map[run.values[EXACT_VER_VAR_ID]];

            if (run.values[seedVarId] === seedValId && run.values[verSubVarId] === verSubValId && run.times.primary_t >= 300) {
"""
content = re.sub(r'        // Process Queue\n        let allQueueRuns = \[\];\n        for \(let res of queueResults\) \{\n            if \(res && res\.data\) allQueueRuns\.push\(\.\.\.res\.data\);\n        \}\n\n        for \(let run of allQueueRuns\) \{\n            let verLbl = var_map\[run\.values\[EXACT_VER_VAR_ID\]\];\n\n            if \(isTargetVersion\(verLbl\) && run\.values\[seedVarId\] === seedValId && run\.times\.primary_t >= 300\) \{', process_queue, content, count=1)


# Write back
with open('api/runs.js', 'w') as f:
    f.write(content)
