import re

with open('api/runs.js', 'r') as f:
    content = f.read()

# For random seeds, filter out > 300. For set seeds, don't filter.
time_logic_lb = """
                // Only count the rank if it's a valid run and time is >= 5 minutes (300 seconds) for random seeds
                const minTime = seedTypeQuery === 'random' ? 300 : 0;
                if (run.times.primary_t >= minTime) {
"""
content = re.sub(r'                // Only count the rank if it\'s a valid run and time is >= 5 minutes \(300 seconds\)\n                if \(run\.times\.primary_t >= 300\) \{', time_logic_lb, content)


time_logic_queue = """
            // Note for queue runs we still need to filter because the API doesn't filter by vars on the /runs endpoint like it does on leaderboards
            const minTime = seedTypeQuery === 'random' ? 300 : 0;
            if (run.values && run.values[seedVarId] === seedValId && run.values[verSubVarId] === verSubValId && run.times.primary_t >= minTime) {
"""
content = re.sub(r'            // Note for queue runs we still need to filter because the API doesn\'t filter by vars on the /runs endpoint like it does on leaderboards\n            if \(run\.values && run\.values\[seedVarId\] === seedValId && run\.values\[verSubVarId\] === verSubValId && run\.times\.primary_t >= 300\) \{', time_logic_queue, content)


with open('api/runs.js', 'w') as f:
    f.write(content)
