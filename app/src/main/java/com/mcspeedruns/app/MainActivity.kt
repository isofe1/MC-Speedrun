package com.mcspeedruns.app

import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.tabs.TabLayout
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity() {

    private lateinit var rvRuns: RecyclerView
    private lateinit var tabLayout: TabLayout
    private lateinit var tvRunCount: TextView
    private lateinit var tvStatus: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout

    private val runAdapter = RunAdapter()

    private var leaderboardData = listOf<RunModel>()
    private var queueData = listOf<RunModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        rvRuns = findViewById(R.id.recyclerView)
        tabLayout = findViewById(R.id.tabLayout)
        tvRunCount = findViewById(R.id.tvRunCount)
        tvStatus = findViewById(R.id.tvStatus)
        progressBar = findViewById(R.id.progressBar)
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)

        rvRuns.adapter = runAdapter

        tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab?) {
                updateUI()
            }
            override fun onTabUnselected(tab: TabLayout.Tab?) {}
            override fun onTabReselected(tab: TabLayout.Tab?) {}
        })

        swipeRefreshLayout.setOnRefreshListener {
            fetchData(isRefresh = true)
        }

        fetchData(isRefresh = false)
    }

    private fun fetchData(isRefresh: Boolean) {
        if (!isRefresh) {
            progressBar.visibility = View.VISIBLE
        }
        tvStatus.text = "Fetching data from speedrun.com..."

        CoroutineScope(Dispatchers.Main).launch {
            val result = SpeedrunApi.getRuns()

            if (!isRefresh) {
                progressBar.visibility = View.GONE
            }
            swipeRefreshLayout.isRefreshing = false

            if (result != null) {
                leaderboardData = result.first
                queueData = result.second
                tvStatus.text = "Last updated: Just now"
                updateUI()
            } else {
                tvStatus.text = "Failed to load data. Swipe down to refresh."
            }
        }
    }

    private fun updateUI() {
        val isQueue = tabLayout.selectedTabPosition == 1
        val list = if (isQueue) queueData else leaderboardData

        tvRunCount.text = "${list.size} ${if (isQueue) "Pending Runs" else "Unique Runners"}"
        runAdapter.submitList(list, isQueue)
    }
}
