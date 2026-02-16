#!/usr/bin/env python3
"""
PoE Ladder Tracker — Ingestion Script
Fetches the top 200 ladder entries from the Path of Exile API
and stores current + historical data as JSON files.
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from collections import defaultdict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
LEAGUE = os.environ.get("POE_LEAGUE", "Standard")
# Space-safe URL encoding for the league name
QUOTED_LEAGUE = urllib.parse.quote(LEAGUE)
API_URL = f"https://api.pathofexile.com/ladders/{QUOTED_LEAGUE}?limit=200"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
PLAYERS_DIR = os.path.join(DATA_DIR, "players")

# Intervals for calculation (in seconds)
INTERVALS = {
    "1h": 3600,
    "4h": 14400,
    "12h": 43200,
    "1d": 86400,
    "3d": 259200,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_filename(name: str) -> str:
    """Convert a character name to a filesystem-safe filename."""
    safe = re.sub(r'[^\w\-]', '_', name, flags=re.ASCII)
    safe = re.sub(r'_+', '_', safe).strip('_')
    return safe if safe else "unknown"


def fetch_ladder() -> dict:
    """Fetch ladder data from the PoE API."""
    print(f"Fetching ladder for league: {LEAGUE}")
    print(f"URL: {API_URL}")

    req = urllib.request.Request(
        API_URL,
        headers={
            "User-Agent": "PoE-Ladder-Tracker/1.0 (GitHub Actions)",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"Fetched {len(data.get('entries', []))} entries")
            return data
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"URL Error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def load_player_history(char_name: str) -> list:
    """Load the history array for a given player from disk."""
    safe_name = safe_filename(char_name)
    filepath = os.path.join(PLAYERS_DIR, f"{safe_name}.json")
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("history", [])
    except Exception:
        return []


def get_xp_at_time(history: list, target_time: int) -> int | None:
    """Find the XP of a player at a specific time in the past."""
    # History is sorted by time ascending.
    # We want the snapshot closest to (and <=) target_time.
    # Simple linear search from end is sufficient as history isn't massive yet.
    # For optimization, could use bisect, but linear reverse is fine here.
    
    if not history:
        return None
        
    # Optimization: if target is after the latest snapshot, use latest
    if target_time >= history[-1]["t"]:
        return history[-1]["x"]
        
    # Optimization: if target is before first snapshot, return None (wasn't tracked)
    if target_time < history[0]["t"]:
        return None

    best = None
    for snap in reversed(history):
        if snap["t"] <= target_time:
            best = snap
            break
            
    return best["x"] if best else None


def calculate_metrics(entries: list, current_timestamp: int) -> tuple[dict, dict]:
    """
    Calculate XP rates and Rank changes for all current entries.
    Returns:
        rates: { char_name: { "1h": 1234, "4h": 5678 ... } }
        rank_changes: { char_name: { "1h": +2, "4h": -1 ... } }
    """
    
    # Pre-load all relevant histories to avoid re-opening files partially
    # For Top 200, this is cheap.
    histories = {} 
    
    print("Loading histories for metric calculation...")
    for entry in entries:
        char_name = entry.get("character", {}).get("name")
        if char_name:
            histories[char_name] = load_player_history(char_name)

    metrics_rates = defaultdict(dict)
    metrics_ranks = defaultdict(dict)

    # We need to reconstruct the ladder rank for each past interval.
    # Strategy:
    # 1. For each interval (e.g. 1h ago):
    #    - Calculate effective XP for ALL players at that time.
    #    - Sort them to find their historic rank.
    # 2. Compare with current rank.

    # Current Ranks map
    current_ranks = { 
        entry.get("character", {}).get("name"): entry.get("rank") 
        for entry in entries 
    }

    for label, seconds_ago in INTERVALS.items():
        target_time = current_timestamp - seconds_ago
        
        # Build "Historic Ladder"
        # We only consider players currently in the list for rank comparison 
        # (This is a simplified view; ideally we'd track everyone, but for now 
        # comparing relative to the current set is acceptable and robust).
        historic_ladder = []
        
        for name, history in histories.items():
            # 1. Calc Rate
            current_snap = history[-1] if history else None
            # Find snapshot at target_time
            xp_then = get_xp_at_time(history, target_time)
            
            # Rate Calculation
            if current_snap and xp_then is not None:
                dt = current_snap["t"] - target_time # approx duration
                # Allow some slack in dt calculation if snapshot wasn't exact
                # But cleaner: simply (CurrentXP - XP_Then) / (Now - TargetTime) * 3600
                # Using exact snapshot time diff is more accurate for data points:
                
                # Find the actual snapshot object for 'then' to get exact time
                past_snap = None
                for s in reversed(history):
                    if s["t"] <= target_time:
                        past_snap = s
                        break
                
                if past_snap and current_snap["t"] > past_snap["t"]:
                    real_dt = current_snap["t"] - past_snap["t"]
                    real_dx = current_snap["x"] - past_snap["x"]
                    rate = int((real_dx / real_dt) * 3600)
                    metrics_rates[name][label] = max(0, rate)
                else:
                    metrics_rates[name][label] = 0
            else:
                metrics_rates[name][label] = 0
            
            # Add to historic ladder for rank calc
            # If we don't have data for them at that time, we assume 0 or exclude?
            # Exclusion means they weren't in the ladder, effectively rank infinity.
            if xp_then is not None:
                historic_ladder.append({"name": name, "xp": xp_then})
                
        # Sort historic ladder by XP descending
        historic_ladder.sort(key=lambda k: k["xp"], reverse=True)
        
        # Map historic ranks
        historic_ranks = { item["name"]: idx + 1 for idx, item in enumerate(historic_ladder) }
        
        # Calculate Delta
        for name, curr_rank in current_ranks.items():
            past_rank = historic_ranks.get(name)
            if past_rank:
                # Rank Change: Positive means IMPROVEMENT (Lower rank number)
                # e.g. Rank 10 -> Rank 5.  (10 - 5) = +5
                delta = past_rank - curr_rank
                metrics_ranks[name][label] = delta
            else:
                # User wasn't in list or tracked then.
                # Mark as 'New' or 0? 0 is safe. 'New' is None.
                metrics_ranks[name][label] = None

    return metrics_rates, metrics_ranks


def calculate_class_distribution_score(entries: list) -> dict:
    """
    Calculate weighted class distribution.
    Formula: Score = Sum( (TotalPlayers + 1) - Rank )
    Rank 1 = 200 pts (if 200 players)
    Rank 200 = 1 pt
    """
    scores = defaultdict(int)
    total_players = len(entries)
    
    for entry in entries:
        rank = entry.get("rank", 201)
        char_class = entry.get("character", {}).get("class", "Unknown")
        
        weight = max(0, (total_players + 1) - rank)
        scores[char_class] += weight
        
    return dict(scores)


def build_current_ladder(entries: list, rates: dict, rank_changes: dict) -> list:
    """Build the simplified current_ladder.json array."""
    ladder = []
    for entry in entries:
        char = entry.get("character", {})
        acct = entry.get("account", {})
        depth_data = char.get("depth", {})
        twitch = acct.get("twitch", {})
        challenges = acct.get("challenges", {})
        char_name = char.get("name", "Unknown")
        is_dead = entry.get("dead", False)
        
        # Get pre-calc values
        p_rates = rates.get(char_name, {})
        p_ranks = rank_changes.get(char_name, {})

        ladder.append({
            "rank": entry.get("rank"),
            "name": char_name,
            "level": char.get("level", 0),
            "class": char.get("class", "Unknown"),
            "experience": char.get("experience", 0),
            # Legacy field for compatibility (defaults to 1h)
            "xp_per_hour": p_rates.get("1h", 0) if not is_dead else 0,
            # New fields
            "xp_rates": p_rates if not is_dead else {k: 0 for k in INTERVALS},
            "rank_changes": p_ranks,
            
            "dead": is_dead,
            "account": acct.get("name", ""),
            "twitch": twitch.get("name") if twitch else None,
            "challenges": challenges.get("completed", 0),
            "challenges_max": challenges.get("max", 0),
            "depth": depth_data.get("default") if depth_data else None,
            "depth_solo": depth_data.get("solo") if depth_data else None,
        })

    return ladder


def update_player_history(entry: dict, timestamp: int) -> bool:
    """Update (or create) a player's history file."""
    char = entry.get("character", {})
    char_name = char.get("name", "Unknown")
    safe_name = safe_filename(char_name)
    filepath = os.path.join(PLAYERS_DIR, f"{safe_name}.json")

    xp = char.get("experience", 0)
    depth_data = char.get("depth", {})
    depth = depth_data.get("default") if depth_data else None
    dead = entry.get("dead", False)

    snapshot = {"t": timestamp, "x": xp}
    if depth is not None:
        snapshot["d"] = depth
    if dead:
        snapshot["dead"] = True

    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            player_data = json.load(f)
    else:
        acct = entry.get("account", {})
        player_data = {
            "name": char_name,
            "class": char.get("class", "Unknown"),
            "account": acct.get("name", ""),
            "history": [],
        }

    # Update metadata
    player_data["class"] = char.get("class", player_data.get("class", "Unknown"))
    player_data["name"] = char_name

    history = player_data.get("history", [])
    if history:
        last = history[-1]
        last_xp = last.get("x", 0)
        last_depth = last.get("d")
        last_dead = last.get("dead", False)

        if last_xp == xp and last_depth == depth and last_dead == dead:
            return False  # No change

    history.append(snapshot)
    player_data["history"] = history

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(player_data, f, separators=(",", ":"))

    return True


def save_metadata(timestamp: int, total_players: int, updated_count: int, class_dist: dict):
    """Save metadata about the last update."""
    meta = {
        "last_updated": timestamp,
        "league": LEAGUE,
        "total_players": total_players,
        "players_updated": updated_count,
        "class_distribution": class_dist, # New field
    }
    filepath = os.path.join(DATA_DIR, "metadata.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(PLAYERS_DIR, exist_ok=True)

    # 1. Fetch live data
    raw = fetch_ladder()
    entries = raw.get("entries", [])

    if not entries:
        print("No entries found. Exiting.")
        sys.exit(0)

    timestamp = int(time.time())

    # 2. Update Histories (CRITICAL: Must be done BEFORE calculating metrics for 'now')
    #    We need the latest snapshot on disk for the metric calculator to see the current state.
    updated_count = 0
    print("Updating player histories...")
    for entry in entries:
        if update_player_history(entry, timestamp):
            updated_count += 1
    print(f"Updated {updated_count}/{len(entries)} player histories")

    # 3. Calculate Advanced Metrics (Rates & Ranks)
    #    This reads back the files we just updated/verified.
    print("Calculating metrics...")
    rates, rank_changes = calculate_metrics(entries, timestamp)

    # 4. Calculate Class Distribution
    class_dist = calculate_class_distribution_score(entries)

    # 5. Build and save current_ladder.json
    ladder = build_current_ladder(entries, rates, rank_changes)
    ladder_path = os.path.join(DATA_DIR, "current_ladder.json")
    with open(ladder_path, "w", encoding="utf-8") as f:
        json.dump(ladder, f, separators=(",", ":"))
    print(f"Saved current_ladder.json ({len(ladder)} entries)")

    # 6. Save metadata
    save_metadata(timestamp, len(entries), updated_count, class_dist)
    print("Done!")


if __name__ == "__main__":
    main()
