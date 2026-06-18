import re

with open('api/runs.js', 'r') as f:
    content = f.read()

# Replace cache logic to include parameters in the cache key
cache_logic = """
// In-memory cache for the serverless function. Map of paramKey -> {data, lastFetchTime}
let cacheMap = {};
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds
"""
content = re.sub(r'// In-memory cache for the serverless function\nlet cachedData = null;\nlet lastFetchTime = 0;\nconst CACHE_DURATION_MS = 60 \* 1000; // 60 seconds', cache_logic, content)


handler_start = """
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
"""

content = re.sub(r"export default async function handler\(req, res\) {\n    // 1\. Check Cache\n    const now = Date\.now\(\);\n    if \(cachedData && \(now - lastFetchTime < CACHE_DURATION_MS\)\) {\n        res\.setHeader\('Cache-Control', 's-maxage=60, stale-while-revalidate'\);\n        return res\.status\(200\)\.json\(cachedData\);\n    }", handler_start, content)

# Write back
with open('api/runs.js', 'w') as f:
    f.write(content)
