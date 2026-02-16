This document outlines the architecture for a serverless, zero-cost Path of Exile Ladder Tracker using **GitHub Actions** as the backend engine and **GitHub Pages** for the frontend.
Written by Gemini.

Extra requests is interjected with # comment
---

# Project: PoE Niche Ladder Tracker

## 1. High-Level Architecture
The system operates on a "Git Scraping" model. Instead of a database, we use the file system.
*   **Source:** PoE Official API (`api.pathofexile.com`)
*   **Ingestion (Backend):** Python script triggered by GitHub Actions (Cron Schedule).
*   **Storage:** JSON files committed directly to the repository.
*   **Presentation (Frontend):** Static HTML/JS website styled with Tailwind CSS, hosted on GitHub Pages.

---

## 2. Backend & Data Structure (The Engine)

### 2.1. The Data Schema
To support "Instant Load" for comparisons and graphs, data is split into two categories: **Index** (fast list) and **Details** (deep history).

**Folder Structure:**
```text
/
├── .github/workflows/  (The Automation)
├── data/
│   ├── metadata.json       (Last update timestamp)
│   ├── current_ladder.json (Top 200 list with current stats)
│   └── players/            (Individual history files)
│       ├── Mathil.json
│       ├── Zizaran.json
│       └── ...
└── index.html          (The App)
```

**File Formats:**

*   **`data/current_ladder.json`**:
    *   *Purpose:* Populates the main table instantly.
    *   *Content:* Array of objects `[{ rank, name, class, level, current_xp, depth }]`.
*   **`data/players/{Name}.json`**:
    *   *Purpose:* Populates the graphs and calculations.
    *   *Content:*
    ```json
    {
      "name": "CharacterName",
      "class": "Deadeye",
      "history": [
        {"t": 1697000000, "x": 45000000, "d": 105}, 
        {"t": 1697000600, "x": 46000000, "d": 110} 
        // t=timestamp, x=xp, d=depth (minimized keys to save space)
      ]
    }
    ```

### 2.2. The Ingestion Script (Python)
Runs every **10 minutes**.

**Workflow Logic:**
1.  **Fetch:** GET `https://api.pathofexile.com/ladders/{League}?limit=200`.
2.  **Process List:**
    *   Save the simplified list to `current_ladder.json`.
3.  **Process History:**
    *   Loop through every character in the response.
    *   Sanitize filename (handle spaces/special chars in names).
    *   Check if `data/players/{Name}.json` exists.
    *   **Append** new snapshot `{t, x, d}` to the history array.
    *   *Optimization:* Only append if XP or Depth has changed since the last entry to save space.
4.  **Commit:** Git add, commit, and push changes to the repo.

---

## 3. Frontend Application (The UI)

### 3.1. Tech Stack
*   **Structure:** HTML5
*   **Styling:** Tailwind CSS (via CDN for simplicity, or CLI if preferred).
*   **Logic:** Vanilla JavaScript (ES6+).
*   **Visualization:** **Chart.js** (Best balance of features/ease) or **uPlot** (Faster for massive datasets).

### 3.2. Core Features & Logic

#### A. Main Dashboard (Top 200)
*   **Data Source:** Fetches `data/current_ladder.json`.
*   **UI:** A clean Tailwind table.
*   **Features:**
    *   Search bar (Filter by Name).
    *   Class Icons/Filter.
    *   "Select to Compare" checkboxes next to each row.

#### B. The "Engine" (Calculations)
Since the backend only stores raw XP, the browser does the math on the fly when a player is clicked.
*   **XP/Hour:** `(Current XP - XP_at_timestamp_minus_1_hour)`. # I want XP/10m, XP/30m options as well.
*   **Death Detection:**
    ```javascript
    // Loop through history array
    if (currentSnapshot.xp < previousSnapshot.xp) {
        // Mark as Death Event
        // Calculate % lost (usually 10% or 5%)
    }
    ```

#### C. Comparison View (Multi-Player)
This addresses your "4+ players" requirement.
*   **User Action:** User checks boxes for "Mathil", "Ben", "ImExile" and clicks "Compare".
*   **Logic:**
    1.  JS asynchronously fetches `data/players/Mathil.json`, `data/players/Ben.json`, etc.
    2.  Wait for all `Promise.all()` to resolve.
    3.  **Normalization:** Map all history arrays onto a shared time X-Axis (since they might have started playing at different times).
    4.  **Render:** One chart with 4 different colored lines.
    5.  **Overlay:** Show "Skull" icons on the lines where deaths occurred.

---

## 4. Implementation Roadmap

### Phase 1: The Crawler (Backend)
1.  Set up the GitHub Repo.
2.  Write the Python script (`tracker.py`) to fetch API and save JSONs locally.
3.  Create the GitHub Action (`.yml`) to run `tracker.py` every 10 mins.
4.  **Milestone:** You see JSON files appearing and updating in your repo automatically.

### Phase 2: The Skeleton (Frontend)
1.  Create `index.html`.
2.  Add Tailwind CSS.
3.  Write JS to fetch `current_ladder.json` and render the Top 200 HTML table.
4.  **Milestone:** You can see the live ladder on your GitHub Pages URL.

### Phase 3: The Profiler (Details)
1.  Create a modal or sidebar for "Player Details".
2.  Implement `Chart.js`.
3.  Write the logic to fetch a specific `player.json` and render the XP graph.
4.  Add the "Death Detection" math and plot red dots on the graph.

### Phase 4: The Comparator (Advanced)
1.  Add checkboxes to the main table.
2.  Update the Chart logic to handle multiple datasets (arrays) at once.

---

## 5. Potential Constraints & Mitigations

| Constraint | Solution |
| :--- | :--- |
| **Repo Size** | History files are text. Even with 1000 players over 3 months, it will be <300MB. Git handles this easily. |
| **API Rate Limits** | PoE API allows generous limits. One request every 10 mins is negligible. |
| **Mobile Support** | Tailwind makes responsive tables easy (e.g., hide "Depth" column on mobile). |
| **Character Renames** | The API uses Character Name as the key. If they rename, it counts as a new entry. (Acceptable limitation). |
