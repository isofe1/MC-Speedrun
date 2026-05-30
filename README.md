# Minecraft Speedrun Leaderboard & Queue (1.16 - 1.19) 🏆

A lightning-fast, serverless web application that provides an unofficial, combined view of the Speedrun.com Verified Leaderboard and the Pending Verification Queue for the **Minecraft: Java Edition (Any% Glitchless - Random Seed)** category.

This project was built to solve the issue of browser rate-limiting and slow load times when fetching thousands of runs directly from the Speedrun.com API.

## ✨ Features

* **Serverless Caching:** Uses a Vercel Serverless Function (`api/runs.js`) to fetch, merge, sort, and deduplicate runs in the background. The data is cached at the edge for 60 seconds, meaning the website loads almost instantly for end users.
* **Single Page Application (SPA):** Seamlessly switch between the Leaderboard and Queue views without the page reloading.
* **Custom Pagination:** Client-side pagination (100 runs per page) allows users to scrub through thousands of runs effortlessly.
* **Dynamic Sorting:** Sort the unverified queue by Fastest Time, Newest Submission, or Oldest Submission.
* **SRDC Asset Integration:** Automatically fetches and displays player country flags, dynamic name gradients, and rank trophies directly from the Speedrun.com asset servers.

## 📂 Project Structure

This repository is structured specifically for zero-configuration deployment on Vercel.

```text
mc-speedrun-site/
│
├── api/                  # Backend Serverless Functions
│   └── runs.js           # Fetches & caches data from Speedrun.com
│
├── public/               # Frontend Assets (SPA)
│   ├── index.html        # Main HTML layout
│   ├── style.css         # Dark theme & responsive UI
│   └── app.js            # Tab routing, fetching, and pagination logic
│
└── package.json          # Node.js project configuration
