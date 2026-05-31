package com.mcspeedruns.app

data class RunModel(
    val playerKey: String,
    val playersDisplay: String,
    val time: Double,
    val version: String,
    val status: String,
    val dateDisplay: String,
    val weblink: String,
    val timestampMs: Long
)
