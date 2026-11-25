# Premier League Analytics and Tactical 11

An independent football analytics portal and browser-based tactical simulator. The bundled archive covers five modelled match seasons and two player campaigns.

## Run locally

Requires Node.js, npm, and Python 3.9 or later.

```sh
npm ci
npm run build
npm run serve
```

Open [PL Analytics](http://localhost:8000/). The standalone server uses Python’s standard library. The optional Flask entry point serves the same routes. Install `requirements.txt` and run `python app.py` to use it.

## Explore the site

| Page | What you can do |
| --- | --- |
| `/` | Filter 1,900 modelled fixtures, open match details, and use PL Chat for Premier League history, statistics and site help. |
| `/history` | Browse recorded Premier League final tables, scoring leaders and results for every completed season from 1992/93 through 2025/26. |
| `/live` | Follow reported scores, recent results, upcoming fixtures, and the current table. |
| `/predictions` | Compare expected points, title and top-four chances, and bottom-three risk in a chart and full next-season table. |
| `/players` | Filter and compare 2024/25 player records and 2025/26 projections. |
| `/standings` | Explore five season tables and plot each club’s expected goal difference against its points. |
| `/trends` | Compare goals with xG and plot the share of home wins, draws, and away wins by season. |
| `/clubs` | Browse 26 club profiles with season history, home and away points-per-match charts, and recent results. |
| `/methodology` | Review the data sources and metric definitions. |
| `/simulator` | Play a 30-turn Quick Match, a full match, or a late-match challenge. Club squads load when you open the club picker. |
| `/coach-board` | Arrange both teams, place the ball, and draw runs and passes for a team talk. |
| `/video-analysis` | Replay video on a 2D pitch, inspect tracks, jump to event clips and export reports. |

In **Last-minute corner**, choose a near-post cross, a far-post cross, or a short pass at 85 minutes. Corners can also follow a save pushed behind. Shots sent wide restart with a goal kick.

On **Coach Board**, a fresh board starts with your 11, an opposing keeper in goal, and ten opposition pieces on the bench. Choose one side, just the opposing keeper, or both teams. Drag a bench piece onto the pitch or press Enter on it. Draw runs and passes by dragging from start to end or tapping twice. The side tutorial covers editing shirt numbers and presenting the board. Your setup is saved in this browser.

## Video Tactical Analysis

Open **Video Analysis** from Tactical 11. **Load sample clip** plays a bundled synthetic training video and telemetry without Python vision packages. Its optional media and data downloads are separate from the initial frontend bundle.

To analyze your own footage, use Python 3.10 or later and install the optional packages in your project environment.

```sh
python -m pip install -r requirements-video.txt
npm run build
python serve.py 8000
```

1. Open `/video-analysis` and upload MP4, WebM, or MKV. Browser playback depends on the codec. H.264 MP4 and VP8 WebM are good choices when you need video playback and pitch calibration.
2. Pause on a wide view, choose **Mark corners**, and click far left, far right, near right, then near left. The first calibration applies from time zero. Additional calibrations take effect from the selected timestamp, so set one at each camera cut or angle change. Set **Home attacks** for the half being analyzed. Use **Full-frame overhead** only when the full image maps to the pitch.
3. Choose **Analyze uploaded clip**. Players are assigned to shirt-color clusters when the kits separate reliably. The cluster defending the chosen home goal early in the shot is labelled Home. Track numbers are detector IDs unless the data supplies a shirt number.
4. Use video controls, the scrubber or event pins. The report filters to a team or a selected track and can display all analyzed footage or only observations available by the current time. Click an underlined metric to jump to matching events, use **Next Clip** to cycle, or export the current report.

The default model is YOLO26n for lighter inference. Set `PL_VIDEO_MODEL=yolo26s.pt` for the small model. The loader tries both YOLO26 variants and falls back to YOLO11s. Models go in `backend/models/`; set `PL_VIDEO_DOWNLOAD=0` for offline use with locally supplied weights. Stock models detect generic people and sports balls. To identify goalkeeper and referee roles separately, set `PL_VIDEO_WEIGHTS` to a trusted local football checkpoint whose class labels include those roles. CUDA uses FP16 and one analysis job at a time. If CUDA runs out of memory the job retries on CPU.

Uploads are processed locally in a temporary directory. Defaults are 80 MiB, 120 seconds and about 8 sampled frames per second. Set `PL_VIDEO_MAX_MB`, `PL_VIDEO_MAX_SECONDS` and `PL_VIDEO_FPS` to adjust the limits, or `PL_VIDEO_ENABLED=0` to leave only sample playback. A stable camera and a visible ball give the best results. A homography projects onto the grass plane, so airborne trajectories and changing camera poses can distort position and speed.

**API.** `GET /api/analyze-video` reports availability and limits. `POST /api/analyze-video` accepts a raw video body with `X-Video-Name`, `X-Pitch-Calibration` and optional `X-Home-Attacks: left`. Calibration is a JSON list of `{t, points}` entries with normalized image coordinates. The API can also accept `pitch` arrays of corresponding landmarks measured in metres. The response includes `fps`, `frames: [{t, ball, players, control, motion}]`, `events`, `stats`, and `meta`. Ball positions can be null and unknown track assignments are retained. Event `t` shows where to seek and `observed_at`, when available, shows when the result became observable.

**Estimates.** Passes, shots, saves, tackles, recoveries and dribbles use proximity and movement. Foul and goal candidates are review cues. Estimated xG uses shot angle and distance, and PPDA compares opposing buildup pass attempts with tackles and interceptions. The 5-minute possession estimate extrapolates recent tracked control after at least 15 seconds. Counter speed is progression divided by time after a recovery, sprint distance uses a 7 m/s threshold, and possession percentages exclude undetermined control.

Rebuild the synthetic fixtures with `python -m scripts.build_tactical_sample` when the classifier changes. That command needs OpenCV with VP8 encoding support.

Quick Match starts at kickoff and advances three match minutes with each move. **Break the deadlock** starts at 75 minutes with the ball near the box and 15 turns left. Turn off **Advance after my move** to use **Next play** or **N** for each step. **Space** starts or pauses the continuous clock. Use **Auto-play my team** to watch both sides play.

Tap a teammate to pass or tap open grass to dribble. Use **P** to make the suggested pass, **S** to shoot, **D** to dribble forward, and the arrow keys to steer. Out of possession, use **T** to try a tackle or **B** to cover the shooting lane. Drag players into position before a Full Match kickoff. Use **1–4** to switch formations.

Choose Rookie, Pro, or Elite difficulty and set the opponent to Balanced, High Press, or Counter. The browser-based tactical model compares passing lanes, space to dribble, and shot quality. The score changes how it plays late in the match. The simulator shows shot chances and the opponent’s last decision. Each turn accepts one manual action. Challenge bests are saved by difficulty in the current browser.

## PL Chat

The homepage assistant answers questions about Premier League champions, records, connected standings, forecasts, and using the site. It queries the local database for completed-season standings and scores and links to the underlying sources. Ask “Arsenal vs Chelsea in 2024/25?” for recorded results or add “modelled” to request the illustrative archive. The transcript lives only in the open page.

To enable answers to additional topics, set `PL_CHAT_OPENAI_KEY` in the Python server environment and restart the server. Unmatched questions then go to the OpenAI Responses API. `PL_CHAT_OPENAI_MODEL` can override the default `gpt-5-mini`. Keep the key server-side. General AI answers are labelled in the chat. The built-in football answers work without an OpenAI key.

## Historical database and APIs

`data/premier-league-history.sqlite3` contains 34 completed seasons, 51 clubs, and 13,166 match scores. The server opens it read-only. The importer reconciles match totals, wins, draws, losses, and goals against each published league table while preserving points deductions and published positions. Season records link to the Wikipedia contributors and article revisions under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and to [OpenFootball](https://github.com/openfootball/england) scores under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| API | Use | Credential |
| --- | --- | --- |
| `GET /api/history` | Season index and title counts | None |
| `GET /api/history/seasons/2003` | Final table, scoring leaders and sources for 2003/04 | None |
| `GET /api/history/seasons/2003/matches` | Recorded results and coverage for 2003/04 | None |
| `GET /api/history/clubs/arsenal` | Season-by-season positions and club title count | None |
| `GET /api/live` | Scores and standings from OpenLigaDB or the preferred feed | None for OpenLigaDB |
| `POST /api/chat` | Ask a question with a JSON body such as `{"message":"Who won in 2003/04?"}` | None for league and site questions |

For another live source, set `FOOTBALL_DATA_TOKEN` on the server to prefer [football-data.org](https://www.football-data.org/documentation/quickstart). Score timing depends on its plan. Use `PL_CHAT_OPENAI_KEY` for optional general chat.

To import newly completed seasons, run `python -m scripts.import_history` from the project directory with outbound HTTPS enabled. Use `--through 2025` to rebuild through 2025/26 or `--cache-dir` to reuse downloaded sources. The importer creates the database in a temporary file and replaces the existing file only after validation. Restart the website after an import. Normal history requests use SQLite and work offline.

## Live scores and predictions

The live page uses [OpenLigaDB](https://www.openligadb.de/) by default. No API key is required. The host needs outbound HTTPS access to `api.openligadb.de`. The match centre covers the current matchweek and its neighbours, checks for changes during match windows, and labels missing scores as awaiting updates. OpenLigaDB is community maintained, so its coverage and timing can vary.

To use [football-data.org](https://www.football-data.org/) as the preferred feed, set `FOOTBALL_DATA_TOKEN` in the Python server's environment and allow HTTPS to `api.football-data.org`. Keep the token on the server. The site falls back to OpenLigaDB when the preferred feed fails. Score timing depends on the provider plan.

The next-season forecast uses reported standings and goal totals and simulates 1,500 seasons with the current 20 clubs as a provisional lineup. A dated [OpenLigaDB table snapshot](data/openligadb-table.json) keeps the 2027/28 forecast usable during feed outages. The snapshot is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Live fixtures and results show their own availability rather than using the modelled archive.

## Build and deploy

`npm run build` validates the bundled datasets, checks JavaScript syntax, compiles and minifies Tailwind locally, and checks the 300 KiB frontend asset budget. The browser uses local styles and system fonts. Each data page fetches only the selected season, and the server supports gzip and ETag validation.

Serve the project through a Python host. The standings, trends, methodology, and club profiles are rendered on the server. Set `SITE_URL` to the public HTTPS origin before deploying to keep the canonical URLs, social metadata, robots.txt, and sitemap consistent behind reverse proxies. Without it, the server uses the request origin.
