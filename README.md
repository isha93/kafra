# ⚔️ Kafra

> A Ragnarok-style world for your AI coding agents. Every repo is a town, every
> agent a character, and you can see what each one is building, live or
> replayed.

Kafra Corporation serves adventurers in every town of Rune-Midgard: storage,
teleports, save points. This repo serves your Claude Code, Codex and Gemini
agents in every working directory.

**Everything runs on your machine.** Kafra reads the session files your agents
already write and your repos' git metadata. It never calls a model, uses no
tokens, installs nothing into your agents, and makes no network calls. There is
no `npm install` either: everything it needs is in this repo.

## Quick start

Requires Node 20+ and git.

```bash
./kafra.sh            # open your world                          → http://127.0.0.1:4317
./kafra.sh demo       # a sample town showing every animation    → :4318
./kafra.sh simulate   # six fake towns that keep working         → :4319
./kafra.sh public     # your world with all text removed         → :4317
./kafra.sh menubar    # macOS menu bar icon and notifications (via SwiftBar)
./kafra.sh autostart on|off|status   # start Kafra at every macOS login
./kafra.sh clean      # remove Kafra's temporary files (simulation, demo, tests)
./kafra.sh help
```

`KAFRA_PORT` changes the port, and `KAFRA_NO_OPEN=1` skips opening the browser.

**Controls**

| Input | Action |
|---|---|
| Drag / scroll | pan / zoom |
| Click | details for an agent, building, town or the Kafra booth |
| `Tab` | jump between active agents; the camera follows until you drag |
| `M` | show the whole world |
| `R` | open or close replay; `Space` plays or pauses it |
| `Esc` | clear the selection, close the newspaper |

## Why this exists

Running several agents at once means hopping between terminals to find out who
is working, who is waiting for an answer, and whose context is almost full.
Kafra shows all of it in one place, and lets you rewind to see what happened
while you were away.

It is inspired by [Vibecraft](https://vibecraft.sh), with two deliberate
differences: monitoring never touches your agents' configuration (Kafra only
reads files, so it is risk-free to try), and it looks like Ragnarok Online
rather than a 3D hex grid.

## Agents it reads

| Agent | Sessions | Class |
|---|---|---|
| Claude Code | `~/.claude/projects/` | by model: Opus = Lord Knight, Sonnet = Assassin Cross, Haiku = Hunter, Fable = Bard |
| Codex (CLI and Desktop) | `~/.codex/sessions/` | Wizard |
| Gemini CLI | `~/.gemini/tmp/` | Sage |

Each source is one parser in `src/sources/` that turns its tool's own format
into a shared session shape, so the city, privacy rules, menu bar, alerts and
replay work the same for every agent. Gemini's folders are named by a hash of
the working directory; Kafra finds the directory by hashing folders it already
knows, and skips sessions it can't place rather than guessing.

- `KAFRA_SOURCES=claude-code,codex` limits which sources are read.
- `KAFRA_MAX_AGE_DAYS` (default 7) sets how far back sessions appear. Older
  agents rest at the inn.

## The world

| Real world | Kafra |
|---|---|
| GitHub owner | **Kingdom**: an island; repos without a remote live in *Tanah Liar* (the Wilds) |
| Git repo | **Town**, with a stable Rune-Midgard name |
| Top-level folder (`src/`, `web/`) | **District building** |
| Uncommitted files | **Scaffolding** on that building |
| New commit | fireworks and "Level Up!" in the plaza, and an entry in the build log |
| Agent session | **Character**; its context left is the **HP bar** |
| Subagent | **Party member**, next to its leader |

### Towns grow with the repo

A town's **tier** comes from its number of files, number of commits and age
(`src/growth.mjs`). The commit floor keeps a large import with few commits from
jumping tiers.

| Tier | Roughly | Looks like |
|---|---|---|
| ★ Camp | a new repo | tents, a campfire, dirt paths |
| ★★ Village | 25+ files, 10+ commits | small houses, wooden palisade |
| ★★★ Town | 120+ files, 40+ commits | cobbled streets, low stone wall |
| ★★★★ City | 500+ files, 150+ commits | stone walls with corner towers |
| ★★★★★ Capital | 2000+ files, 500+ commits, 6+ months | adds a castle |

The **biome** follows the main language: Swift/Kotlin coast, TypeScript desert,
Go/Rust/C snow, Python forest, JavaScript/web plains, Ruby/PHP/Java canyon, and
docs-only meadow. **Mood** follows commits: 30+ in a month is *bustling* (more
townsfolk), and none for 30 days is *abandoned* (dim, overgrown).

### Agents walk to their work

| Tool | Activity | Where and how |
|---|---|---|
| Edit, Write, `apply_patch` | building | the district owning the file: hammer, sparks |
| Read, Grep, Glob | researching | library: book, floating pages |
| shell | crafting | workshop: flask, smoke |
| shell running tests | training | arena: damage numbers, a red "Miss" on failure |
| shell commit / push | delivering | Kafra booth: carries a chest |
| web search / fetch | teleporting | warp portal: pillar of light |
| subagent | summoning | in place: magic circle, and a party member appears |
| (thinking) | casting | in place: "…" |
| turn ended | waiting | plaza: "!" and "Your turn!" |
| quiet for 30+ min | resting | inn |

A finished tool keeps showing until the next one. An edit takes milliseconds,
so without this an agent would look like it is "thinking" almost all the time.

## Staying aware

- **Status rings.** Agents have a ring at their feet: green when working,
  **yellow when waiting for you**, red after an error, grey when idle.
  Townsfolk are smaller and muted, with no ring.
- **Party bar.** Along the bottom, every awake agent with what it is running
  and for how long, most urgent first. Click a card to jump to that agent.
- **Alerts.** Kafra raises an alert when an agent waits for you, a tool fails,
  a tool runs over 2 minutes, or HP drops below 15%. Each alert goes to the
  chat log, optionally to a browser notification and a chime, and into the tab
  title as a count.
- **World map.** Zoomed out, each town is a pin coloured by its most urgent
  agent.
- **Menu bar (macOS).** `./kafra.sh menubar` installs a
  [SwiftBar](https://swiftbar.app) plugin (`brew install --cask swiftbar`
  first).
  - `⚔ 2` in yellow means two agents are waiting for you. The dropdown lists
    every awake agent, and clicking one opens Kafra on it.
  - A native notification appears once per agent that starts waiting. It comes
    from **Kafra Notifier** (`integrations/notifier/`), a small Swift helper
    compiled on your machine, which only ever opens links to `127.0.0.1`.
- **Autostart (macOS).** `./kafra.sh autostart on` installs a per-user
  LaunchAgent, so the server starts at every login and restarts if it crashes.
  It also adds SwiftBar to Login Items. Logs are in `~/Library/Logs/Kafra/`.
  "Login" means logging in to your Mac; no account is involved.
- **Sound and music** (off until you click 🔈 / 🎵 on the party bar). All of
  it is synthesised in the browser, with no audio files.
  - Each activity has its own sound, panned by where the agent is on screen.
  - The background music is a small generative chiptune that changes with the
    biome you're looking at and slows down at night.
- **Time and weather.** Day and night follow your clock, and a town rains
  while a tool there is failing. To preview them: `?hour=21`, `?weather=rain`.

## Replay and the daily newspaper

**Replay** (⏪ in the World Map, or `R`) plays back any day:

1. Today opens first; pick another date in the bar.
2. Press ▶ (or `Space`) and choose a speed from ×10 to ×1200. Agents walk,
   build, fail and commit as they did, and the chat log narrates with the
   replay's clock.
3. Drag the slider to jump. Gold ticks mark commits, red ticks failures.
4. `● Live` (or `Esc`) returns to now.

**Koran Kafra** (📰) is the day on one page: a headline, who worked where,
files built, failures and fixes, commits, the best builder and the longest
shift. Click any line to jump the replay to that moment.

Kafra records nothing of its own. A replay is rebuilt from your agents' session
files and git history, reading each file backwards only as far as the chosen
day (today takes about half a second). A day can be replayed as long as its
session files still exist. Alerts and notifications stay silent while
replaying.

## Privacy

Copy `kafra.config.example.json` to `kafra.config.json` (gitignored). Changes
apply on the next update, with no restart.

```json
{
  "hide": ["~/Documents/Clients/*", "secret-prototype"],
  "only": [],
  "redact": ["Acme Corp", "/internal\\.[a-z]+\\.com/"],
  "public": false
}
```

- **`hide`:** repos or working directories that never appear. Git never runs
  on them.
- **`only`:** when not empty, only these appear.
- **`redact`:** extra words (case-insensitive) or `/regex/` patterns, masked as
  `••••` in prompts, titles, repo and branch names and commit subjects. This is
  on top of the built-in credential patterns.
- **Patterns:** `*` matches within one folder, `**` across folders, and `~` is
  your home folder. A name without a slash matches that folder anywhere.

**Public mode** (`./kafra.sh public`, or `"public": true`) keeps the game and
drops every piece of text: prompts, titles, paths, repo and branch names,
commit subjects and hashes. Kingdoms and districts are numbered instead of
named. It applies to the live world, the menu bar and replays, and happens on
the server, so the text never reaches the browser. Use it for screen sharing
and streaming.

Kafra has no login on purpose. Don't expose it to the internet. To view it from
another device, use Tailscale or an SSH tunnel.

## Safety

Kafra only reads. It installs no hooks, never writes to your agents' folders or
your repos, and makes no outbound network calls.

- **Network.** The server binds to `127.0.0.1` only, so other machines can't
  reach it.
- **Other websites can't reach it either.** Every request needs a `Host` of
  `127.0.0.1`/`localhost` on Kafra's port, which blocks DNS rebinding.
  Cross-site requests (`Origin`, `Sec-Fetch-Site`) are refused, and only
  `GET`/`HEAD` are accepted.
- **Browser.** A strict Content Security Policy allows scripts only from Kafra
  itself, with no `eval` (PixiJS's no-eval patch is loaded for this). The page
  can't be framed and sends no referrer. Static files resolve strictly inside
  `web/`.
- **No dependencies.** There are no npm packages. PixiJS (MIT) is vendored in
  `web/vendor/` by `scripts/vendor-pixi.mjs`, so nothing is downloaded or
  installed to run Kafra.
- **Git.** Git runs through `execFile` (no shell) with fixed arguments.
  `GIT_OPTIONAL_LOCKS=0` keeps `git status` from taking `index.lock` while an
  agent commits. `core.fsmonitor=false`, `--no-ext-diff` and `--no-textconv`
  stop repo config from launching programs.
- **Contents.** File contents are never read, only paths and counts.
- **Redaction.** Displayed text is scrubbed of credential-shaped strings
  (`sk-…`, `ghp_…`, `rdpk-…`, `AKIA…`, `token=…`, JWTs).

## Resource use

Measured on a MacBook with about 450 sessions on disk:

| | Typical |
|---|---|
| Repo on disk | ~7 MB (code, art, vendored PixiJS) |
| Kafra's own data | none: it stores nothing, so it doesn't grow |
| Server RAM | ~75 MB live; ~130 MB with replays open (heap capped at 128 MB under autostart) |
| Server CPU | ~0–1%, brief spikes while scanning |
| SwiftBar | ~80 MB RAM, ~0% CPU |
| Browser tab | the heaviest part (60 fps animation), only while open; background tabs are throttled |

**What runs, and when:**
- **The server** idles until asked.
- **The menu bar plugin** asks every 10 seconds. Each time, Kafra reads the
  last 256 KB of each session from the past week, plus git stats cached for
  10 seconds.
- **An open browser tab** gets an update every 2 seconds.
- **Replays** are read on demand. Up to 3 days stay cached for 10 minutes, and
  re-reading one takes under a second.

## Architecture

```
src/sources/          one parser per agent (claude-code, codex, gemini), merged by index.mjs
src/activity.mjs      tool → activity kind; redaction
src/repos.mjs         read-only git → districts, commits, growth numbers
src/growth.mjs        tier, mood and biome from repo numbers
src/world.mjs         sessions → towns (live and replay)
src/privacy.mjs       hide / only / redact, public mode
src/menubar.mjs       SwiftBar text
src/guard.mjs         host, origin and header rules
src/server.mjs        /api/world/stream (SSE), /api/replay, /api/swiftbar, static files
web/city/             PixiJS client: world, town, agent, land, replay, newspaper, audio, ui, …
web/vendor/           PixiJS, vendored
web/assets/           generated art and its manifest (see web/assets/README.md)
integrations/         SwiftBar plugin, Kafra Notifier
scripts/              demo, simulation, fixtures, asset generation, vendoring
```

The renderer only knows activity *kinds*, never tool names. Supporting another
agent means one file in `src/sources/` that returns the shared session shape
(see `codex.mjs`) plus a `replaySessions` for its history, and one line in
`src/sources/index.mjs`.

## Development

```bash
npm start                     # http://127.0.0.1:4317 (no install step)
npm run demo                  # fixture transcripts, every animation   → :4318
npm run simulate              # six living towns in a temp folder     → :4319
npm test                      # node:test, no dependencies
node scripts/gen-assets.mjs   # Retro Diffusion art (see web/assets/README.md)
```

To upgrade PixiJS, see the header of `scripts/vendor-pixi.mjs`.

See [ROADMAP.md](ROADMAP.md) for what's done and what's next.

## About the art

The look is **inspired by** Ragnarok Online, not copied from it. All original
RO sprites, tilesets, fonts and music are copyright Gravity Co., Ltd., and none
are in this repo. The art here is original pixel art generated with Retro
Diffusion, from prompts that never name the game or its characters, with shapes
drawn in code as fallbacks. The music is generated in the browser. Town names
are borrowed as names only.

How to replace or regenerate the art is in
[web/assets/README.md](web/assets/README.md).
