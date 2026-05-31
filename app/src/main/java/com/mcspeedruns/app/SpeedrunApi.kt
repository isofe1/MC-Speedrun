package com.mcspeedruns.app

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll

object SpeedrunApi {
    private val client = OkHttpClient()
    private const val HEADER = "https://www.speedrun.com/api/v1/"
    private const val GAME_ID = "j1npme6p"
    private const val CAT_ID = "mkeyl926"
    private const val EXACT_VER_VAR_ID = "jlzkwql2"

    private suspend fun fetch(endpoint: String): String? = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(HEADER + endpoint).build()
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                return@withContext response.body?.string()
            }
        } catch (e: IOException) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getRuns(): Pair<List<RunModel>, List<RunModel>>? = withContext(Dispatchers.Default) {
        val varRes = fetch("games/${GAME_ID}/variables") ?: return@withContext null
        val varJson = JSONObject(varRes).getJSONArray("data")

        val varMap = mutableMapOf<String, String>()
        var seedVarId = ""
        var seedValId = ""
        var verSubVarId = ""
        var verSubValId = ""

        for (i in 0 until varJson.length()) {
            val v = varJson.getJSONObject(i)
            if (v.has("category") && !v.isNull("category") && v.getString("category") != CAT_ID) continue

            val valuesObj = v.getJSONObject("values").getJSONObject("values")
            val keys = valuesObj.keys()
            while (keys.hasNext()) {
                val valId = keys.next()
                val label = valuesObj.getJSONObject(valId).getString("label")
                varMap[valId] = label
                if (label == "Random Seed") { seedVarId = v.getString("id"); seedValId = valId }
                if (label == "1.16+") { verSubVarId = v.getString("id"); verSubValId = valId }
            }
        }

        var lbUrl = "leaderboards/${GAME_ID}/category/${CAT_ID}?top=1000&embed=players"
        if (seedVarId.isNotEmpty() && seedValId.isNotEmpty()) lbUrl += "&var-${seedVarId}=${seedValId}"
        if (verSubVarId.isNotEmpty() && verSubValId.isNotEmpty()) lbUrl += "&var-${verSubVarId}=${verSubValId}"

        // Fetch leaderboard and queue concurrently
        val offsets = listOf(0, 200, 400, 600, 800)
        val queueDeferreds = offsets.map { offset ->
            async(Dispatchers.IO) {
                fetch("runs?game=${GAME_ID}&category=${CAT_ID}&status=new&orderby=submitted&direction=desc&embed=players&max=200&offset=${offset}")
            }
        }

        val lbRes = fetch(lbUrl) ?: return@withContext null
        val queueResults = queueDeferreds.awaitAll()

        val lbData = JSONObject(lbRes).getJSONObject("data")

        val lbPlayersArray = lbData.getJSONObject("players").getJSONArray("data")
        val lbPlayersMap = mutableMapOf<String, String>()
        for (i in 0 until lbPlayersArray.length()) {
            val p = lbPlayersArray.getJSONObject(i)
            val name = if (p.has("names")) p.getJSONObject("names").getString("international") else p.optString("name", "Unknown")
            lbPlayersMap[p.optString("id", name)] = name
        }

        val allCombined = mutableListOf<RunModel>()

        fun isTargetVersion(verLbl: String?): Boolean {
            if (verLbl == null) return false
            val regex = Regex("^1\\.(\\d+)")
            val match = regex.find(verLbl)
            if (match != null) {
                val minor = match.groupValues[1].toIntOrNull() ?: 0
                return minor in 16..19
            }
            return false
        }

        // Process Leaderboard
        val runsArray = lbData.getJSONArray("runs")
        for (i in 0 until runsArray.length()) {
            val runObj = runsArray.getJSONObject(i).getJSONObject("run")
            val values = runObj.getJSONObject("values")
            val verLbl = varMap[values.optString(EXACT_VER_VAR_ID)]

            if (isTargetVersion(verLbl) && values.optString(seedVarId) == seedValId) {
                parseRunAndAdd(runObj, verLbl!!, lbPlayersMap, allCombined, "Verified")
            }
        }

        for (queueRes in queueResults) {
            if (queueRes == null) continue
            val queueArray = JSONObject(queueRes).getJSONArray("data")

            for (i in 0 until queueArray.length()) {
                val runObj = queueArray.getJSONObject(i)
                val values = runObj.getJSONObject("values")
                val verLbl = varMap[values.optString(EXACT_VER_VAR_ID)]

                if (isTargetVersion(verLbl) && values.optString(seedVarId) == seedValId) {
                    parseRunAndAdd(runObj, verLbl!!, lbPlayersMap, allCombined, "Pending")
                }
            }
        }

        // Sort and Deduplicate
        allCombined.sortBy { it.time }

        val deduplicatedLeaderboard = mutableListOf<RunModel>()
        val seenPlayers = mutableSetOf<String>()

        for (run in allCombined) {
            if (!seenPlayers.contains(run.playerKey)) {
                deduplicatedLeaderboard.add(run)
                seenPlayers.add(run.playerKey)
            }
        }

        val pureQueue = allCombined.filter { it.status == "Pending" }.sortedBy { it.time }
        return@withContext Pair(deduplicatedLeaderboard, pureQueue)
    }

    private fun parseRunAndAdd(runObj: JSONObject, verLbl: String, lbPlayersMap: Map<String, String>, list: MutableList<RunModel>, status: String) {
        val time = runObj.getJSONObject("times").getDouble("primary_t")
        val dateStr = runObj.optString("date", "")
        val subStr = runObj.optString("submitted", "")
        val weblink = runObj.optString("weblink", "").replace("http://", "https://")

        val playersArr = runObj.optJSONArray("players") ?: runObj.optJSONObject("players")?.optJSONArray("data") ?: JSONArray()
        val playerNames = mutableListOf<String>()
        val playerIds = mutableListOf<String>()

        for (j in 0 until playersArr.length()) {
            val p = playersArr.getJSONObject(j)
            val pid = p.optString("id", "")
            if (p.optString("rel") == "user" && lbPlayersMap.containsKey(pid)) {
                playerNames.add(lbPlayersMap[pid]!!)
                playerIds.add(pid)
            } else {
                val fallbackName = p.optString("name", "Unknown")
                playerNames.add(fallbackName)
                playerIds.add(fallbackName)
            }
        }

        val playerKey = playerIds.sorted().joinToString("|")
        val playersDisplay = playerNames.joinToString(", ")

        val displayDate = if (dateStr.isNotEmpty() && dateStr != "null") dateStr else subStr.split("T").firstOrNull() ?: "Unknown"

        list.add(RunModel(
            playerKey = playerKey,
            playersDisplay = playersDisplay,
            time = time,
            version = verLbl,
            status = status,
            dateDisplay = displayDate,
            weblink = weblink,
            timestampMs = System.currentTimeMillis() // Simplification for Android demo
        ))
    }
}
