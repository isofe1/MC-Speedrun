package com.mcspeedruns.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.util.Locale

class RunAdapter : RecyclerView.Adapter<RunAdapter.RunViewHolder>() {

    private val runs = mutableListOf<RunModel>()
    private var isQueue = false

    fun submitList(newRuns: List<RunModel>, isQueueTab: Boolean) {
        runs.clear()
        runs.addAll(newRuns)
        isQueue = isQueueTab
        notifyDataSetDataSetChanged()
    }

    // Workaround since notifyDataSetChanged is sometimes a bit weird in raw adapters,
    // it's just standard notifyDataSetChanged.
    fun notifyDataSetDataSetChanged() {
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RunViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_run, parent, false)
        return RunViewHolder(view)
    }

    override fun onBindViewHolder(holder: RunViewHolder, position: Int) {
        val run = runs[position]
        holder.bind(run, position, isQueue)
    }

    override fun getItemCount(): Int = runs.size

    class RunViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvRank: TextView = itemView.findViewById(R.id.tvRank)
        private val tvPlayer: TextView = itemView.findViewById(R.id.tvPlayer)
        private val tvVersion: TextView = itemView.findViewById(R.id.tvVersion)
        private val tvDate: TextView = itemView.findViewById(R.id.tvDate)
        private val tvTime: TextView = itemView.findViewById(R.id.tvTime)
        private val tvStatus: TextView = itemView.findViewById(R.id.tvStatus)

        fun bind(run: RunModel, position: Int, isQueue: Boolean) {
            tvRank.text = "#${position + 1}"
            tvPlayer.text = run.playersDisplay
            tvVersion.text = run.version
            tvDate.text = run.dateDisplay
            tvTime.text = formatTime(run.time)

            if (isQueue) {
                tvStatus.visibility = View.GONE
            } else {
                tvStatus.visibility = View.VISIBLE
                if (run.status == "Verified") {
                    tvStatus.text = "VERIFIED"
                    tvStatus.setTextColor(Color.parseColor("#00b070"))
                    tvStatus.setBackgroundColor(Color.parseColor("#1A00b070"))
                } else {
                    tvStatus.text = "PENDING"
                    tvStatus.setTextColor(Color.parseColor("#f39c12"))
                    tvStatus.setBackgroundColor(Color.parseColor("#1Af39c12"))
                }
            }

            itemView.setOnClickListener {
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(run.weblink))
                itemView.context.startActivity(browserIntent)
            }
        }

        private fun formatTime(seconds: Double): String {
            val ms = Math.round(seconds * 1000).toLong()
            val h = ms / 3600000
            val min = (ms % 3600000) / 60000
            val s = (ms % 60000) / 1000
            val millis = ms % 1000

            return if (h > 0) {
                String.format(Locale.US, "%d:%02d:%02d.%03d", h, min, s, millis)
            } else {
                String.format(Locale.US, "%d:%02d.%03d", min, s, millis)
            }
        }
    }
}
