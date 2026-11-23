# Premier League Analytics Portal & "YOU 11" Tactical Simulator // 2021–2026

An ultra-fast, lightweight, broadcast-grade Premier League analytics web portal and interactive 2D top-down checker-piece match simulator built with **Vanilla JavaScript + Radash** (<10 KB micro-utility suite) and an official **Premier League Brutalist Sharp-Edge Design System** (`border-radius: 0px`).

---

## 1. Project Architecture

```
premier-league-analytics/
├── package.json            # Repeatable npm scripts (build, audit:size, validate:data, serve)
├── requirements.txt        # Python backend requirements (Flask 3+)
├── templates/
│   ├── index.html          # Main Match Archive 2021–2026, Standings & Telemetry Drawers
│   ├── players.html        # Player Stats Hub (2025 & 2026 Campaigns) & H2H Comparison
│   └── simulator.html      # Tactical 11 Checker-Piece 2D Match Engine (Google Stitch UI)
├── static/
│   ├── css/
│   │   ├── main.css        # PL Color System, Brutalist 0px Geometry, Split Curtain & :focus-visible
│   │   └── simulator.css   # Mowed Turf Stripes, 3D Bevel Checker Tokens & Animated SVG Vectors
│   ├── js/
│   │   ├── radash.min.js   # Micro-utility library (7.9 KB) with clone, debounce, throttle, sort
│   │   ├── charts.js       # Pure SVG Tactical Pitch & H2H Stat Comparison Bars (11.0 KB)
│   │   ├── app.js          # Core State, Telemetry Drawers & Debounced Search (50.7 KB)
│   │   └── simulator.js    # Two-Way Match Engine, Web Audio SFX & Keyboard Controls (55.7 KB)
│   └── data/
│       ├── matches_2021_2026.json   # 1,900 matches across 5 seasons (2021–2026)
│       └── players_2025_2026.json   # 994 player performance records (2025 & 2026)
├── scripts/
│   ├── audit_size.js       # Automated bundle & category treemap auditor (<300 KB budget)
│   ├── build.js            # Unified production build verification pipeline
│   ├── generate_data.py    # Pipeline script building the JSON data archives
│   └── validate_data.py    # Automated test suite verifying JSON schema and types
├── serve.py                # Zero-dependency Python HTTP server
├── app.py                  # Optional Flask server
└── README.md
```

---

## 2. Performance & Treemap Size Audit (<300 KB Budget)

Every asset is measured via `npm run audit:size`. The entire frontend asset payload across all three templates and modular static assets is strictly under **300.00 KB**:

### File-by-File Inventory
| Asset Path | Category | Size (Bytes) | Size (KB) | Status |
| :--- | :--- | :--- | :--- | :--- |
| `templates/index.html` | HTML Template | 39,975 | 39.04 KB | PASSED |
| `templates/players.html` | HTML Template | 25,379 | 24.78 KB | PASSED |
| `templates/simulator.html` | HTML Template | 30,096 | 29.39 KB | PASSED |
| `static/css/main.css` | CSS Stylesheet | 22,217 | 21.70 KB | PASSED |
| `static/css/simulator.css` | CSS Stylesheet | 4,055 | 3.96 KB | PASSED |
| `static/js/radash.min.js` | JavaScript | 8,086 | 7.90 KB | PASSED |
| `static/js/charts.js` | JavaScript | 11,320 | 11.05 KB | PASSED |
| `static/js/app.js` | JavaScript | 51,892 | 50.68 KB | PASSED |
| `static/js/simulator.js` | JavaScript | 57,069 | 55.73 KB | PASSED |
| **TOTAL FRONTEND PAYLOAD** | **All Categories** | **250,089** | **244.23 KB** | **PASSED (<300 KB)** |
| **HEADROOM UNDER BUDGET** | - | **57,111** | **55.77 KB** | **18.6% Headroom** |

### Category Treemap Breakdown
```
HTML Templates  |  93.21 KB ( 38.2%) | [███████████████░░░░░░░░░░░░░░░░░░░░░░░░░]
CSS Stylesheets |  25.66 KB ( 10.5%) | [████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]
JavaScript Suite| 125.36 KB ( 51.3%) | [█████████████████████░░░░░░░░░░░░░░░░░░░]
TOTAL           | 244.23 KB (100.0%) | 81.4% of 300.00 KB Budget
```

---

## 3. Radash + Legacy-Compatible JavaScript Architecture

All JavaScript across `static/js/` has been refactored to conservative, legacy-friendly ES5 Vanilla JS:
- **0 ES6 Arrow Functions (`=>`)** across all scripts.
- **0 Block-scoped `const` or `let` variables** (uses clean `var` / `function` declarations).
- **Zero Heavy External Libraries:** Completely eliminates Lodash, Moment, or UI frameworks.
- **Radash Functional Suite Included:**
  - `radash.group`: Fast club and season bucketing.
  - `radash.sort` / `radash.alphabetical`: Multi-column table and squad ordering.
  - `radash.select`: Unified map-and-filter single-pass pipelines.
  - `radash.unique`: Deduplication of club and round selectors.
  - `radash.clone`: Immutable squad state copies for formation switching.
  - `radash.debounce`: 160ms debounced search on fixture and player search inputs.
  - `radash.throttle`: 50ms throttled pitch coordinate tracking for smooth 60fps interaction.

---

## 4. Desktop UX, Accessibility & Keyboard Controls

- **Accessible Focus States:** High-contrast Premier League Electric Green (`#00ff85`) outline on `:focus-visible` across all buttons, selects, links, inputs, and checker tokens.
- **Semantic HTML5 & ARIA Landmarks:** Includes `<header role="banner">`, `<nav aria-label="...">`, `<main role="main">`, `<section aria-label="...">`, `<table role="table">`, `role="tablist"`, `role="tab"`, and `role="log" aria-live="polite"`.
- **Keyboard Shortcuts in Tactical 11 Simulator:**
  - `[SPACE]` : Start / Pause dynamic match engine.
  - `[1]`, `[2]`, `[3]`, `[4]` : Quick-switch tactical shapes (4-3-3, 4-2-3-1, 3-5-2, 4-4-2).
  - `[P]` : Pass ball to nearest forward teammate.
  - `[S]` : Trigger shot on goal (with distance/angle xG calculation).
  - `[D]` : Dribble advance into open attacking space.
  - `[R]` : Recenter team shape to tactical base positions.
  - `[ARROW KEYS]` : Nudge selected player checker token across the pitch.
  - `[ENTER] / [SPACE]` on Token : Select active checker piece.

---

## 5. Execution Commands & Verification

### 1. Run Complete Production Build Pipeline
```bash
npm run build
```
Executes Python data validation, checks syntax across all JS files, and runs the bundle treemap audit.

### 2. Run Size Audit Individually
```bash
npm run audit:size
```

### 3. Validate JSON Schemas
```bash
npm run validate:data
```

### 4. Launch Local Development Server
```bash
npm run serve
```
or directly:
```bash
python serve.py
```
Open your browser at:
- **Match Center (2021–2026):** `http://localhost:8000/`
- **Player Stats Hub (2025/26):** `http://localhost:8000/players`
- **Tactical 11 Checker Simulator:** `http://localhost:8000/simulator`
