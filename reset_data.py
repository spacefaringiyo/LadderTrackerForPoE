import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
PLAYERS_DIR = os.path.join(DATA_DIR, "players")

def reset_data():
    print("Warning: This will DELETE all tracked player history and ladder data.")
    print("Are you sure? (y/n)")
    choice = input().lower()
    if choice != 'y':
        print("Aborted.")
        return

    # Delete players directory
    if os.path.exists(PLAYERS_DIR):
        try:
            shutil.rmtree(PLAYERS_DIR)
            print(f"Deleted {PLAYERS_DIR}")
        except Exception as e:
            print(f"Error deleting players dir: {e}")
    
    # Recreate empty players directory
    os.makedirs(PLAYERS_DIR, exist_ok=True)
    print(f"Recreated empty {PLAYERS_DIR}")

    # Delete main JSON files
    for filename in ["current_ladder.json", "metadata.json"]:
        filepath = os.path.join(DATA_DIR, filename)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"Deleted {filepath}")
            except Exception as e:
                print(f"Error deleting {filename}: {e}")

    print("\nData reset complete. Run 'python tracker.py' (or let GitHub Actions run it) to start fresh.")

if __name__ == "__main__":
    reset_data()
