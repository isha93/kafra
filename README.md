# ⚔️ Kafra

> A Ragnarok-style world for your Claude Code agents. Every repo is a town,
> and you can see what each agent is building.

Kafra Corporation serves adventurers in every town of Rune-Midgard: storage,
teleports, save points. This repo serves your Claude Code agents in every
working directory.

## Quick start

```bash
./kafra.sh            # checks Node, runs npm install once, opens your world → http://127.0.0.1:4317
./kafra.sh demo       # sample town with every animation                    → :4318
./kafra.sh simulate   # six fake towns that keep working                    → :4319
./kafra.sh public     # your world with all text removed, safe to share     → :4317
./kafra.sh help
```

**Everything runs locally.** The server listens on `127.0.0.1` only. It reads
Claude Code transcripts and git metadata, never calls a model, and uses no
tokens. The only network access is the one-time `npm install`.

`KAFRA_PORT` changes the port, and `KAFRA_NO_OPEN=1` skips opening the browser.
Node 20+ and git are required.

**Controls:**
- Drag to pan and scroll to zoom.
- Click anything for details.
- `Tab` jumps between active agents. The camera follows the selected agent until you drag the map.
- `M` shows the whole world, and `Esc` clears the selection.

## Why this exists

Running several Claude Code sessions at once means hopping between terminals to
find out who is working, who is waiting for an answer, and whose context is
almost full. Kafra shows all of it in one place.

It is inspired by [Vibecraft](https://vibecraft.sh), with two deliberate
differences:

1. **Monitoring never touches Claude Code's configuration.** Vibecraft installs
   hooks from the start; Kafra only reads files, so it is risk-free to try.
2. **It looks like Ragnarok Online**, not a 3D hex grid.

## How it works

Claude Code writes every session to disk as JSONL:

```
~/.claude/projects/<slugged-cwd>/<session-id>.jsonl
~/.claude/projects/<slugged-cwd>/<session-id>/subagents/agent-*.jsonl
```

Kafra reads only the **tail** of each file (the last 256 KB), because
transcripts can reach 144 MB. The fields it reads map onto the world like this:

| Field | Becomes |
|---|---|
| `cwd` → git root | the town |
| `model` | the job class (Opus = Lord Knight, Sonnet = Assassin Cross, Haiku = Hunter, …) |
| `usage` tokens | the **HP bar** (context left) |
| `tool_use` blocks | what the agent is doing and where it walks |
| `ai-title` | the agent's quest |
| subagent transcripts | party members next to their leader |

## The world

| Real world | Kafra |
|---|---|
| GitHub owner | **Kingdom**: an island; repos without a remote live in *Tanah Liar* (the Wilds) |
| Git repo | **Town**, with a stable Rune-Midgard name per repo |
| Top-level folder (`src/`, `web/`) | **District building** |
| Uncommitted files | **Scaffolding** on that building |
| New commit | Fireworks and "Level Up!" in the plaza, and an entry in the build log |
| Claude Code session | **Character** |
| Subagent | **Party member** |

### Towns grow with the repo

The town **tier** comes from the number of files, the number of commits and
the repo's age (`src/growth.mjs`). A commit floor keeps a large import with few
commits from jumping tiers.

| Tier | Roughly | Looks like |
|---|---|---|
| ★ Camp | new repo | tents, a campfire, dirt paths |
| ★★ Village | 25+ files, 10+ commits | small houses, wooden palisade |
| ★★★ Town | 120+ files, 40+ commits | cobbled streets, low stone wall |
| ★★★★ City | 500+ files, 150+ commits | stone walls with corner towers |
| ★★★★★ Capital | 2000+ files, 500+ commits, 6+ months | adds a castle |

The **biome** follows the repo's main language:

| Language | Biome |
|---|---|
| Swift / Kotlin | coast |
| TypeScript | desert |
| Go / Rust / C | snow |
| Python | forest |
| JavaScript / web | plains |
| Ruby / PHP / Java | canyon |
| Docs only | meadow |

**Mood** comes from commit activity. A repo with 30+ commits in the last month
is *bustling* and gets more townsfolk. A repo with no commits for 30 days is
*abandoned*: the town turns dim and the woods creep in.

### Agents walk to their work

| Tool | Activity | Where and how |
|---|---|---|
| Edit, Write | building | the district that owns the file: hammer, sparks, shaking building |
| Read, Grep, Glob | researching | library: book, floating pages |
| Bash | crafting | workshop: flask, smoke |
| Bash running tests | training | arena: sword and damage numbers, with a red "Miss" when it fails |
| Bash commit / push | delivering | Kafra booth: carries a chest |
| WebSearch, WebFetch | teleporting | warp portal: pillar of light |
| Agent | summoning | in place: purple magic circle, and a party member appears |
| (thinking) | casting | in place: blue magic circle, "…" |
| turn ended | waiting | around the plaza: "!" and "Your turn!" |
| quiet for 30+ min | resting | inn: sitting, "z" |

A finished tool keeps showing until the next one. An Edit takes milliseconds,
so without this an agent would look like it is "casting" almost all the time.

### Staying aware

- **Agents vs townsfolk.** Agents have a status ring: green when working,
  **yellow when waiting for you**, red after an error, grey when idle.
  Townsfolk are smaller and muted, and have no ring or HP bar.
- **The party bar** along the bottom lists every awake agent with what it is
  running and for how long, most urgent first. Click a card to jump to that
  agent.
- **Alerts** fire when an agent waits for you, a tool fails, a tool runs for
  more than 2 minutes, or HP drops below 15%. They show in the chat log, can
  trigger browser notifications and a chime (toggles on the party bar), and put
  a count of waiting agents in the tab title.
- **The world map.** Zoomed out, each town becomes a pin coloured by its most
  urgent agent.
- **Time and weather.** Day and night follow your local clock, and a town
  rains while a tool there is failing. To preview them: `?hour=21`,
  `?weather=rain`, `?weather=clear`.

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

- **`hide`:** repos (or working directories) that never appear. Git is never
  even run on them.
- **`only`:** when not empty, only these appear.
- **`redact`:** extra words (case-insensitive) or `/regex/` patterns masked as
  `••••`, on top of the built-in credential patterns. This covers prompts,
  titles, repo and branch names, and commit subjects.
- **Patterns:** `*` matches within one folder, `**` across folders, and a
  leading `~` is your home folder. A name without a slash matches that folder
  anywhere.

**Public mode** (`./kafra.sh public`, or `"public": true`) keeps the game and
drops every piece of text. Towns, tiers, biomes, activity kinds and statuses
stay. Prompts, titles, paths, repo and branch names, commit subjects and
hashes are removed, and kingdoms and districts are numbered instead of named.
This happens **on the server**, so the data never reaches the browser. Use it
for screen sharing and streaming.

Kafra has no login on purpose. Don't expose it to the internet. To view it
from another device, use Tailscale or an SSH tunnel.

## Safety

Kafra only reads. It installs no hooks, never writes to `~/.claude` or to your
repos, and makes no outbound network calls.

- The server binds to `127.0.0.1` only, so other machines can't reach it.
- **Other websites can't reach it either.** Every request must carry a `Host` of
  `127.0.0.1`/`localhost` on Kafra's port, which blocks DNS rebinding. Requests
  that browsers mark as coming from another site (`Origin`, `Sec-Fetch-Site`)
  are refused. Only `GET`/`HEAD` are accepted.
- **Strict Content Security Policy:** scripts load only from Kafra itself, with
  no `eval`. PixiJS's no-eval patch is loaded for this. The page can't be
  framed and sends no referrer.
- Static files resolve strictly inside `web/`, and `node_modules` is never
  browsable.
- `./kafra.sh` installs with `npm ci --ignore-scripts`: exactly the locked
  versions, with no package install scripts.
- Git runs through `execFile` (no shell) with fixed arguments.
  `GIT_OPTIONAL_LOCKS=0` stops `git status` from taking `index.lock` and
  colliding with an agent that is committing. `core.fsmonitor=false`,
  `--no-ext-diff` and `--no-textconv` stop repo config from launching any
  program while Kafra reads stats.
- Git stats are cached for 10 seconds per repo, however many clients connect.
- File contents are never read, only paths and counts.
- Displayed text (quests, prompts, tool labels) is scrubbed of
  credential-shaped strings (`sk-…`, `ghp_…`, `rdpk-…`, `AKIA…`, `token=…`,
  JWTs).

## Architecture

```
src/sources/claude-code.mjs   transcript → agent (kind, tool, file, HP, party)
src/activity.mjs              tool name → activity kind; redaction
src/repos.mjs                 read-only git → districts, commits, growth numbers
src/growth.mjs                tier, mood and biome from repo numbers
src/world.mjs                 one repo, one town
src/server.mjs                /api/world/stream (SSE), static files
web/city/                     PixiJS client: world, town, agent, land, decor, ui, …
web/assets/                   generated art and its manifest (see web/assets/README.md)
web/party.html                the original table view
scripts/                      demo, simulation, fixtures, asset generation
```

The renderer only knows activity *kinds*, never tool names. Supporting another
agent (Codex, Cursor) means adding one file in `src/sources/` that produces the
same agent shape.

## Development

```bash
npm install
npm start                     # http://127.0.0.1:4317
npm run demo                  # fixture transcripts, every animation   → :4318
npm run simulate              # six living towns in a temp folder     → :4319
npm test
node scripts/gen-assets.mjs   # Retro Diffusion art (see web/assets/README.md)
```

## Roadmap

- **Done:** read-only party window, Kafra City, town tiers and biomes, world
  map, party bar and alerts.
- **Next:** more agent sources (Codex first), and a timeline replay per town.
- **Later: interaction.** Approving tool calls and sending messages from the
  city. This needs hooks in `~/.claude/settings.json` plus tmux, so it stays
  opt-in.

## About the art

The look is **inspired by** Ragnarok Online, not copied from it. All original
RO sprites, tilesets and fonts are copyright Gravity Co., Ltd., and none are in
this repo. The art here is original: pixel art generated with Retro Diffusion
from prompts that never name the game or its characters, plus shapes drawn in
code as fallbacks. Town names are borrowed as names only.

How to replace or regenerate the art is described in
[web/assets/README.md](web/assets/README.md).
