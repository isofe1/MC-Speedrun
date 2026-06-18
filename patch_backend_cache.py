import re

with open('api/runs.js', 'r') as f:
    content = f.read()

# Update processing queue
cache_update = """
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
"""
content = re.sub(r'        // 6\. Save to Cache and Send\n        cachedData = \{\n            leaderboard: deduplicatedLeaderboard,\n            queue: pureQueue,\n            officialRanks: officialRanks, \n            updated: new Date\(\)\.toISOString\(\)\n        \};\n        lastFetchTime = Date\.now\(\);\n\n        res\.setHeader\(\'Cache-Control\', \'s-maxage=60, stale-while-revalidate\'\);\n        return res\.status\(200\)\.json\(cachedData\);', cache_update, content)

with open('api/runs.js', 'w') as f:
    f.write(content)
