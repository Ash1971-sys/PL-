import os
import json
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'data')
MATCHES_FILE = os.path.join(DATA_DIR, 'matches_2021_2026.json')
PLAYERS_FILE = os.path.join(DATA_DIR, 'players_2025_2026.json')

MATCH_REQUIRED_FIELDS = {
    'season': str,
    'matchweek': int,
    'date': str,
    'home_team': str,
    'away_team': str,
    'home_goals': int,
    'away_goals': int,
    'home_xg': (float, int),
    'away_xg': (float, int),
    'possession_home': (float, int),
    'form_home': list,
    'form_away': list
}

PLAYER_REQUIRED_FIELDS = {
    'player_id': (str, int),
    'name': str,
    'club': str,
    'season': (int, str),
    'position': str,
    'minutes': int,
    'goals': int,
    'assists': int,
    'xg': (float, int),
    'xa': (float, int),
    'key_passes': int,
    'pass_accuracy': (float, int),
    'pitch_zone': str
}

def validate_matches():
    print(f"--> Validating {MATCHES_FILE}...")
    if not os.path.exists(MATCHES_FILE):
        raise FileNotFoundError(f"Missing matches file: {MATCHES_FILE}")
    
    with open(MATCHES_FILE, 'r', encoding='utf-8') as f:
        matches = json.load(f)
    
    if not isinstance(matches, list) or len(matches) == 0:
        raise ValueError("Matches data is not a non-empty list.")
    
    seasons = set()
    for idx, m in enumerate(matches):
        for field, expected_type in MATCH_REQUIRED_FIELDS.items():
            if field not in m:
                raise KeyError(f"Match #{idx} missing field '{field}'")
            if not isinstance(m[field], expected_type):
                raise TypeError(f"Match #{idx} field '{field}' expected {expected_type}, got {type(m[field])}")
        
        # Verify form lists
        if len(m['form_home']) != 5 or any(c not in ['W', 'D', 'L'] for c in m['form_home']):
            raise ValueError(f"Match #{idx} form_home invalid: {m['form_home']}")
        if len(m['form_away']) != 5 or any(c not in ['W', 'D', 'L'] for c in m['form_away']):
            raise ValueError(f"Match #{idx} form_away invalid: {m['form_away']}")
        
        seasons.add(m['season'])
    
    print(f" [PASS] Matches file verified: {len(matches)} matches across seasons {sorted(list(seasons))}")
    return True

def validate_players():
    print(f"--> Validating {PLAYERS_FILE}...")
    if not os.path.exists(PLAYERS_FILE):
        raise FileNotFoundError(f"Missing players file: {PLAYERS_FILE}")
    
    with open(PLAYERS_FILE, 'r', encoding='utf-8') as f:
        players = json.load(f)
    
    if not isinstance(players, list) or len(players) == 0:
        raise ValueError("Players data is not a non-empty list.")
    
    seasons = set()
    positions = set()
    for idx, p in enumerate(players):
        for field, expected_type in PLAYER_REQUIRED_FIELDS.items():
            if field not in p:
                raise KeyError(f"Player #{idx} missing field '{field}'")
            if not isinstance(p[field], expected_type):
                raise TypeError(f"Player #{idx} field '{field}' expected {expected_type}, got {type(p[field])}")
        
        if p['position'] not in ['FW', 'MF', 'DF', 'GK']:
            raise ValueError(f"Player #{idx} unexpected position: {p['position']}")
        
        seasons.add(p['season'])
        positions.add(p['position'])
    
    print(f" [PASS] Players file verified: {len(players)} players across seasons {sorted(list(seasons))}, positions {sorted(list(positions))}")
    return True

if __name__ == '__main__':
    try:
        validate_matches()
        validate_players()
        print("\nAll data validation checks PASSED successfully.")
    except Exception as e:
        print(f"\n[FAIL] Validation error: {e}", file=sys.stderr)
        sys.exit(1)
