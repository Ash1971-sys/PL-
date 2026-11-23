import os
import json
import random
import math
import pandas as pd
from datetime import datetime, timedelta

random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# -------------------------------------------------------------
# 1. PROCESS & BUILD PLAYERS DATASET (2025 & 2026)
# -------------------------------------------------------------
csv_path = os.path.join(os.path.dirname(__file__), '..', '..', 'epl_player_stats_24_25.csv')
if not os.path.exists(csv_path):
    csv_path = 'epl_player_stats_24_25.csv'

df_raw = pd.read_csv(csv_path)

pos_map = {
    'FWD': 'FW',
    'MID': 'MF',
    'DEF': 'DF',
    'GKP': 'GK'
}

def clean_pct(val):
    if pd.isna(val):
        return 0.0
    val_str = str(val).replace('%', '').strip()
    try:
        return round(float(val_str), 1)
    except:
        return 0.0

def assign_pitch_zone(pos, name, f3rd_passes, crosses, tackles, clearances):
    if pos == 'GK':
        return 'Goalkeeping Penalty Box'
    if pos == 'DF':
        if crosses > 20 or 'Robertson' in name or 'Alexander-Arnold' in name or 'Porro' in name or 'Gvardiol' in name or 'White' in name or 'Trippier' in name or 'Robinson' in name or 'Aït-Nouri' in name or 'Kerkez' in name or 'Munoz' in name or 'Udogie' in name:
            return 'Left Fullback / Overlap' if ('Left' in name or 'Robertson' in name or 'Robinson' in name or 'Kerkez' in name or 'Udogie' in name or 'Gvardiol' in name) else 'Right Fullback / Overlap'
        return 'Central Defense Stopper'
    if pos == 'MF':
        if f3rd_passes > 300 or 'Saka' in name or 'Palmer' in name or 'Foden' in name or 'Ødegaard' in name or 'Kulusevski' in name or 'Eze' in name or 'Maddison' in name or 'Kudus' in name or 'Mbeumo' in name or 'Mitoma' in name or 'Savinho' in name or 'Bowen' in name:
            return 'Attacking Midfield / Half-Space'
        if tackles > 45 or 'Rice' in name or 'Caicedo' in name or 'Rodri' in name or 'Palhinha' in name or 'Gomes' in name or 'Ndidi' in name or 'Casemiro' in name:
            return 'Defensive Midfield Pivot'
        return 'Central Engine Room'
    if pos == 'FW':
        if crosses > 25 or 'Martinelli' in name or 'Díaz' in name or 'Gordon' in name or 'Barnes' in name or 'Gakpo' in name or 'Semenyo' in name or 'Son' in name or 'Rashford' in name or 'Madueke' in name:
            return 'Left Wing Attacking' if ('Díaz' in name or 'Martinelli' in name or 'Gordon' in name or 'Gakpo' in name or 'Son' in name or 'Rashford' in name) else 'Right Wing Attacking'
        return 'Central Box & Penalty Area'
    return 'Central Engine Room'

players_list = []
player_id_counter = 1000

for idx, row in df_raw.iterrows():
    name = str(row['Player Name']).strip()
    club = str(row['Club']).strip()
    if club == 'Brighton':
        club = 'Brighton & Hove Albion'
    
    raw_pos = str(row['Position']).strip().upper()
    pos = pos_map.get(raw_pos, 'MF')
    
    minutes = int(row['Minutes']) if not pd.isna(row['Minutes']) else 0
    goals = int(row['Goals']) if not pd.isna(row['Goals']) else 0
    assists = int(row['Assists']) if not pd.isna(row['Assists']) else 0
    shots = int(row['Shots']) if not pd.isna(row['Shots']) else 0
    sot = int(row['Shots On Target']) if not pd.isna(row['Shots On Target']) else 0
    tackles = int(row['Tackles']) if not pd.isna(row['Tackles']) else 0
    clearances = int(row['Clearances']) if not pd.isna(row['Clearances']) else 0
    interceptions = int(row['Interceptions']) if not pd.isna(row['Interceptions']) else 0
    crosses = int(row['Crosses']) if not pd.isna(row['Crosses']) else 0
    f3rd_passes = int(row['Successful fThird Passes']) if not pd.isna(row['Successful fThird Passes']) else 0
    prog_carries = int(row['Progressive Carries']) if not pd.isna(row['Progressive Carries']) else 0
    clean_sheets = int(row['Clean Sheets']) if not pd.isna(row['Clean Sheets']) else 0
    saves = int(row['Saves']) if not pd.isna(row['Saves']) else 0
    saves_pct = clean_pct(row['Saves %'])
    pass_acc = clean_pct(row['Passes%'])
    if pass_acc == 0.0:
        pass_acc = 82.4 if pos != 'FW' else 76.5
    
    # Calculate realistic xG and xA
    if pos == 'GK':
        xg = 0.0
        xa = round(assists * 0.45 + (0.1 if minutes > 1000 else 0.0), 2)
        key_passes = assists
    elif pos == 'DF':
        xg = round(goals * 0.85 + (shots * 0.07), 2)
        xa = round(assists * 0.90 + (crosses * 0.04), 2)
        key_passes = int(assists * 3 + crosses * 0.3)
    elif pos == 'MF':
        xg = round(goals * 0.92 + (shots * 0.11), 2)
        xa = round(assists * 1.05 + (f3rd_passes * 0.02), 2)
        key_passes = int(assists * 4 + f3rd_passes * 0.12)
    else: # FW
        xg = round(goals * 0.95 + (shots * 0.14), 2)
        xa = round(assists * 1.08 + (crosses * 0.06), 2)
        key_passes = int(assists * 3.5 + shots * 0.25)
    
    pitch_zone = assign_pitch_zone(pos, name, f3rd_passes, crosses, tackles, clearances)
    
    # 2025 Season entry
    p_2025 = {
        'player_id': f'PL-{player_id_counter}',
        'name': name,
        'club': club,
        'season': 2025,
        'position': pos,
        'minutes': minutes,
        'goals': goals,
        'assists': assists,
        'xg': xg,
        'xa': xa,
        'key_passes': key_passes,
        'pass_accuracy': pass_acc,
        'pitch_zone': pitch_zone,
        'shots': shots,
        'shots_on_target': sot,
        'tackles': tackles,
        'interceptions': interceptions,
        'progressive_carries': prog_carries,
        'clean_sheets': clean_sheets,
        'saves': saves,
        'saves_pct': saves_pct
    }
    players_list.append(p_2025)
    
    # 2026 Season projected entry (for players with active minutes)
    if minutes > 300:
        perf_factor = random.uniform(0.85, 1.18)
        min_factor = random.uniform(0.88, 1.12)
        
        # Keep stars high-performing
        if name in ['Mohamed Salah', 'Erling Haaland', 'Bukayo Saka', 'Cole Palmer', 'Alexander Isak', 'Phil Foden']:
            perf_factor = random.uniform(0.98, 1.16)
        
        m_2026 = min(3420, int(minutes * min_factor))
        g_2026 = max(0, int(round(goals * perf_factor)))
        a_2026 = max(0, int(round(assists * perf_factor)))
        xg_2026 = round(max(0.1, xg * perf_factor), 2) if goals > 0 else round(xg * 0.9, 2)
        xa_2026 = round(max(0.1, xa * perf_factor), 2) if assists > 0 else round(xa * 0.9, 2)
        kp_2026 = max(0, int(round(key_passes * perf_factor)))
        pass_acc_2026 = min(96.0, max(68.0, round(pass_acc + random.uniform(-1.5, 1.5), 1)))
        
        p_2026 = {
            'player_id': f'PL-{player_id_counter}-26',
            'name': name,
            'club': club,
            'season': 2026,
            'position': pos,
            'minutes': m_2026,
            'goals': g_2026,
            'assists': a_2026,
            'xg': xg_2026,
            'xa': xa_2026,
            'key_passes': kp_2026,
            'pass_accuracy': pass_acc_2026,
            'pitch_zone': pitch_zone,
            'shots': max(0, int(shots * perf_factor)),
            'shots_on_target': max(0, int(sot * perf_factor)),
            'tackles': max(0, int(tackles * perf_factor)),
            'interceptions': max(0, int(interceptions * perf_factor)),
            'progressive_carries': max(0, int(prog_carries * perf_factor)),
            'clean_sheets': max(0, int(clean_sheets * perf_factor)),
            'saves': max(0, int(saves * perf_factor)),
            'saves_pct': saves_pct
        }
        players_list.append(p_2026)
    
    player_id_counter += 1

players_file = os.path.join(DATA_DIR, 'players_2025_2026.json')
with open(players_file, 'w', encoding='utf-8') as f:
    json.dump(players_list, f, indent=2)

print(f'Wrote {len(players_list)} player records to {players_file}')

# -------------------------------------------------------------
# 2. GENERATE MATCHES ARCHIVE 2021–2026 (5 FULL SEASONS)
# -------------------------------------------------------------
seasons_teams = {
    '2021/22': [
        'Manchester City', 'Liverpool', 'Chelsea', 'Tottenham Hotspur',
        'Arsenal', 'Manchester United', 'West Ham United', 'Leicester City',
        'Brighton & Hove Albion', 'Wolverhampton Wanderers', 'Newcastle United',
        'Crystal Palace', 'Brentford', 'Aston Villa', 'Southampton',
        'Everton', 'Leeds United', 'Burnley', 'Watford', 'Norwich City'
    ],
    '2022/23': [
        'Manchester City', 'Arsenal', 'Manchester United', 'Newcastle United',
        'Liverpool', 'Brighton & Hove Albion', 'Aston Villa', 'Tottenham Hotspur',
        'Brentford', 'Fulham', 'Crystal Palace', 'Chelsea', 'Wolverhampton Wanderers',
        'West Ham United', 'Bournemouth', 'Nottingham Forest', 'Everton',
        'Leicester City', 'Leeds United', 'Southampton'
    ],
    '2023/24': [
        'Manchester City', 'Arsenal', 'Liverpool', 'Aston Villa',
        'Tottenham Hotspur', 'Chelsea', 'Newcastle United', 'Manchester United',
        'West Ham United', 'Crystal Palace', 'Brighton & Hove Albion', 'Bournemouth',
        'Fulham', 'Wolverhampton Wanderers', 'Everton', 'Brentford',
        'Nottingham Forest', 'Luton Town', 'Burnley', 'Sheffield United'
    ],
    '2024/25': [
        'Liverpool', 'Arsenal', 'Manchester City', 'Chelsea',
        'Nottingham Forest', 'Newcastle United', 'Aston Villa', 'Bournemouth',
        'Fulham', 'Brighton & Hove Albion', 'Brentford', 'Crystal Palace',
        'Manchester United', 'Tottenham Hotspur', 'West Ham United', 'Everton',
        'Wolverhampton Wanderers', 'Ipswich Town', 'Leicester City', 'Southampton'
    ],
    '2025/26': [
        'Arsenal', 'Liverpool', 'Manchester City', 'Chelsea',
        'Newcastle United', 'Aston Villa', 'Tottenham Hotspur', 'Brighton & Hove Albion',
        'Nottingham Forest', 'Bournemouth', 'Manchester United', 'Fulham',
        'Crystal Palace', 'Brentford', 'West Ham United', 'Everton',
        'Wolverhampton Wanderers', 'Ipswich Town', 'Leeds United', 'Leicester City'
    ]
}

team_strength = {
    'Manchester City': 0.95, 'Liverpool': 0.94, 'Arsenal': 0.93, 'Chelsea': 0.85,
    'Tottenham Hotspur': 0.82, 'Newcastle United': 0.84, 'Aston Villa': 0.83,
    'Manchester United': 0.80, 'Brighton & Hove Albion': 0.77, 'Nottingham Forest': 0.76,
    'Bournemouth': 0.74, 'Fulham': 0.73, 'Brentford': 0.74, 'West Ham United': 0.72,
    'Crystal Palace': 0.71, 'Everton': 0.68, 'Wolverhampton Wanderers': 0.67,
    'Leicester City': 0.66, 'Ipswich Town': 0.62, 'Southampton': 0.61,
    'Leeds United': 0.66, 'Burnley': 0.63, 'Watford': 0.58, 'Norwich City': 0.56,
    'Luton Town': 0.60, 'Sheffield United': 0.57
}

season_start_dates = {
    '2021/22': datetime(2021, 8, 13),
    '2022/23': datetime(2022, 8, 5),
    '2023/24': datetime(2023, 8, 11),
    '2024/25': datetime(2024, 8, 16),
    '2025/26': datetime(2025, 8, 15)
}

matches_list = []

for season_str, teams in seasons_teams.items():
    n_teams = len(teams)
    start_date = season_start_dates[season_str]
    
    fixture_rounds = []
    t_list = list(teams)
    
    for round_idx in range(n_teams - 1):
        round_matches = []
        for i in range(n_teams // 2):
            home = t_list[i]
            away = t_list[n_teams - 1 - i]
            if round_idx % 2 == 1:
                home, away = away, home
            round_matches.append((home, away))
        fixture_rounds.append(round_matches)
        t_list = [t_list[0]] + [t_list[-1]] + t_list[1:-1]
    
    second_half = []
    for r_matches in fixture_rounds:
        second_half.append([(away, home) for home, away in r_matches])
    
    all_38_rounds = fixture_rounds + second_half
    team_history = {team: [] for team in teams}
    
    for mw_idx, round_pairs in enumerate(all_38_rounds, 1):
        mw_date = start_date + timedelta(days=(mw_idx - 1) * 7)
        
        for match_idx, (home, away) in enumerate(round_pairs):
            match_datetime_str = (mw_date + timedelta(days=match_idx % 2)).strftime('%Y-%m-%d')
            
            form_home = (team_history[home][-5:] if len(team_history[home]) >= 5 
                         else team_history[home] + ['W', 'D', 'W', 'W', 'L'][:5 - len(team_history[home])])
            form_away = (team_history[away][-5:] if len(team_history[away]) >= 5 
                         else team_history[away] + ['L', 'D', 'W', 'L', 'D'][:5 - len(team_history[away])])
            
            s_h = team_strength.get(home, 0.70) + 0.08
            s_a = team_strength.get(away, 0.70)
            diff = s_h - s_a
            
            exp_hg = max(0.4, 1.45 + diff * 3.2)
            exp_ag = max(0.3, 1.15 - diff * 2.8)
            
            hg = min(8, max(0, int(round(random.gauss(exp_hg, 0.95)))))
            ag = min(7, max(0, int(round(random.gauss(exp_ag, 0.90)))))
            
            h_xg = round(max(0.15, exp_hg + random.uniform(-0.4, 0.4)), 2)
            a_xg = round(max(0.10, exp_ag + random.uniform(-0.4, 0.4)), 2)
            
            base_poss = 50 + int((s_h - s_a) * 45) + random.randint(-4, 4)
            possession_home = min(78, max(26, base_poss))
            
            h_shots = int(round(h_xg * 6.5 + random.randint(1, 6)))
            a_shots = int(round(a_xg * 6.5 + random.randint(1, 5)))
            h_sot = min(h_shots, max(1, int(round(hg + h_shots * 0.28))))
            a_sot = min(a_shots, max(0, int(round(ag + a_shots * 0.26))))
            h_corners = max(1, int(round(h_shots * 0.42 + random.randint(0, 3))))
            a_corners = max(0, int(round(a_shots * 0.38 + random.randint(0, 2))))
            h_fouls = random.randint(7, 16)
            a_fouls = random.randint(8, 17)
            h_cards = min(5, max(0, int(h_fouls * 0.16 + random.randint(0, 1))))
            a_cards = min(5, max(0, int(a_fouls * 0.17 + random.randint(0, 1))))
            
            match_record = {
                'season': season_str,
                'matchweek': mw_idx,
                'date': match_datetime_str,
                'home_team': home,
                'away_team': away,
                'home_goals': hg,
                'away_goals': ag,
                'home_xg': h_xg,
                'away_xg': a_xg,
                'possession_home': possession_home,
                'form_home': form_home,
                'form_away': form_away,
                'home_shots': h_shots,
                'away_shots': a_shots,
                'home_shots_on_target': h_sot,
                'away_shots_on_target': a_sot,
                'home_corners': h_corners,
                'away_corners': a_corners,
                'home_fouls': h_fouls,
                'away_fouls': a_fouls,
                'home_cards': h_cards,
                'away_cards': a_cards
            }
            matches_list.append(match_record)
            
            if hg > ag:
                team_history[home].append('W')
                team_history[away].append('L')
            elif hg < ag:
                team_history[home].append('L')
                team_history[away].append('W')
            else:
                team_history[home].append('D')
                team_history[away].append('D')

matches_file = os.path.join(DATA_DIR, 'matches_2021_2026.json')
with open(matches_file, 'w', encoding='utf-8') as f:
    json.dump(matches_list, f, indent=2)

print(f'Wrote {len(matches_list)} match records across 5 seasons to {matches_file}')
