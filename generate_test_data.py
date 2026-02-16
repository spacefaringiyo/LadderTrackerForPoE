"""Generate sample player history data for ALL 20 players."""
import json
import os
import random

random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "players")
os.makedirs(DATA_DIR, exist_ok=True)

# All 20 players matching current_ladder.json
players = [
    # (name, class, account, start_xp, start_depth, is_dead, death_at_snapshot)
    ("CHUCHU_STAINING",        "Ascendant",    "cutiechuchu#6132",    4000e6, None, False, None),
    ("MICS_STAINING",          "Deadeye",      "Alifek#2409",         4000e6, None, False, None),
    ("twist_deez_turds_alkLFG","Juggernaut",   "turdtwisterx#4882",   4100e6, 60000, True, 20),
    ("Atleast_not_templar",    "Ascendant",    "Mikle#3761",          4100e6, None, False, None),
    ("RADAR_STAINING",         "Champion",     "radarsneers#2943",    4050e6, None, False, None),
    ("ShadowSlayer_PoE",       "Slayer",       "ShadowFan#1234",      3600e6, 400, False, None),
    ("FrostBoltQueen",         "Elementalist", "IcyWitch#5678",       3500e6, None, False, None),
    ("TotemDancer",            "Hierophant",   "TotemLord#9012",       3400e6, 280, False, None),
    ("BleedOut_HC",            "Gladiator",    "BleedKing#3456",       3300e6, None, True, 18),
    ("ChaosWhisper",           "Occultist",    "DarkChaos#7890",       3200e6, 450, False, None),
    ("MinionArmy_Necro",       "Necromancer",  "ZombieFan#1111",       3100e6, None, False, None),
    ("LightningStrikeGod",     "Berserker",    "ZapMaster#2222",       3000e6, 220, False, None),
    ("PoisonTouchIV",          "Pathfinder",   "ToxicTouch#3333",      2900e6, None, False, None),
    ("CycloneKing_v2",         "Slayer",       "SpinToWin#4444",       2800e6, 350, False, None),
    ("FireballMage_SSF",       "Elementalist", "BurnBright#5555",      2700e6, None, False, None),
    ("TankModeOn",             "Juggernaut",   "IronWall#6666",        2600e6, 550, False, None),
    ("ArcTrapEnjoyer",         "Saboteur",     "TrapLord#7777",        2500e6, None, False, None),
    ("RFisLife",               "Chieftain",    "BurnWalk#8888",        2300e6, 300, False, None),
    ("SummonReaper_HC",        "Necromancer",  "DeathCaller#9999",     2200e6, None, True, 22),
    ("FlickerStrikeAndy",      "Raider",       "FlickerFan#0000",      2100e6, 180, False, None),
]

T0 = 1708100000  # Base timestamp
NUM_SNAPSHOTS = 30

for name, cls, account, start_xp, start_depth, is_dead, death_snap in players:
    history = []
    xp = int(start_xp)
    depth = start_depth

    for j in range(NUM_SNAPSHOTS):
        t = T0 + j * 600  # Every 10 minutes
        snapshot = {"t": t, "x": xp}
        if depth is not None:
            snapshot["d"] = depth
            depth += random.randint(0, 500)
        history.append(snapshot)

        # Normal XP gain
        gain = random.randint(15000000, 45000000)
        xp += gain

        # Simulate death (XP drops ~10%)
        if death_snap is not None and j == death_snap:
            xp = int(xp * 0.9)

    # Use same filename logic as frontend
    safe = name.replace(" ", "_")
    # Remove non-alphanumeric chars except _ and -
    import re
    safe = re.sub(r'[^\w\-]', '_', safe)
    safe = re.sub(r'_+', '_', safe).strip('_')

    filepath = os.path.join(DATA_DIR, f"{safe}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(
            {"name": name, "class": cls, "account": account, "history": history},
            f, separators=(",", ":")
        )

print(f"Generated {len(players)} player history files in {DATA_DIR}")

# Generate mock current_ladder.json
ladder_entries = []
for i, (name, cls, account, start_xp, start_depth, is_dead, death_snap) in enumerate(players):
    rank = i + 1
    # Mock rates and changes
    xp_rates = {
        "1h": random.randint(10_000_000, 50_000_000),
        "4h": random.randint(9_000_000, 45_000_000),
        "12h": random.randint(8_000_000, 40_000_000),
        "1d": random.randint(7_000_000, 35_000_000),
        "3d": random.randint(5_000_000, 30_000_000),
    }
    rank_changes = {}
    for label, drift in [("1h", 5), ("4h", 10), ("12h", 20), ("1d", 30), ("3d", 50)]:
        # Logical constraint: one cannot improve beyond Rank 1.
        # If change = past - current, then past = current + change.
        # We need past >= 1, so change >= 1 - rank.
        min_change = 1 - rank
        # Upper bound: purely for realism, let's say they couldn't have dropped more than 'drift' spots
        # or improved more than 'drift' spots.
        val = random.randint(max(min_change, -drift), drift)
        rank_changes[label] = val

    entry = {
        "rank": rank,
        "dead": is_dead,
        "online": random.choice([True, False]),
        "name": name,
        "level": 95 + (rank // 10),
        "class": cls,
        "id": f"mock_id_{i}",
        "experience": int(start_xp) + 100_000_000,
        "depth": None if start_depth is None else start_depth + 100,
        "unique": {
            "name": name,
            "account": account,
            "class": cls
        },
        "character": {
            "name": name,
            "class": cls,
            "level": 95
        },
        "account": account,
        "challenges": random.randint(10, 40),
        "challenges_max": 40,
        "twitch": "Mathil1" if i % 5 == 0 else None,
        "ladder": {
            "entries": []
        },
        # Enhanced fields
        "xp_per_hour": xp_rates["1h"],
        "xp_rates": xp_rates,
        "rank_changes": rank_changes,
    }
    ladder_entries.append(entry)

ladder_path = os.path.join(os.path.dirname(DATA_DIR), "current_ladder.json")
with open(ladder_path, "w", encoding="utf-8") as f:
    json.dump(ladder_entries, f, indent=2)
print(f"Generated mock current_ladder.json at {ladder_path}")

# Generate mock metadata.json
class_dist = {}
for p in players:
    c = p[1]
    class_dist[c] = class_dist.get(c, 0) + random.randint(10, 100) # Mock weighted score

metadata = {
    "last_updated": int(T0 + NUM_SNAPSHOTS * 600),
    "league": "Mock League",
    "total_players": len(players),
    "players_updated": len(players),
    "class_distribution": class_dist
}
meta_path = os.path.join(os.path.dirname(DATA_DIR), "metadata.json")
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2)
print(f"Generated mock metadata.json at {meta_path}")
