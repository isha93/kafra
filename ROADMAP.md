# Roadmap

Kafra stays **local-first**: it reads what is already on disk, runs on
`127.0.0.1`, and never needs an account or a cloud service. Anything that
would change that is opt-in and listed last.

## Done

- Read-only party window (`/party.html`)
- Kafra City: one repo, one town; agents walk to their work
- Generated pixel art (Retro Diffusion) with code-drawn fallbacks
- Town tiers, biomes and moods from git history
- World map: kingdoms per GitHub owner, roads, far-zoom pins
- Party bar, status rings, alerts (browser notification, chime, tab title)
- Living simulation (`./kafra.sh simulate`)
- Hardening: DNS-rebinding and cross-site protection, strict CSP without eval
- No dependencies: PixiJS vendored, no `npm install`
- Agents: Claude Code, Codex, Gemini CLI
- Replay of any day, and the daily Kafra newspaper
- Menu bar (SwiftBar), native notifications, autostart at login
- English and Indonesian UI, following the system language
- CI on macOS and Linux with Node 20, 22 and 24
- Install with Homebrew (`isha93/tap/kafra`) or npm (`@isha93/kafra`)
- Failing tests become bugs in the arena until a run passes
- EXP and base levels per class per town
- Tier-up animation: construction, then fireworks
- Achievements, with an unlock banner and a list
- Privacy: `kafra.config.json` (hide / only / redact) and public mode
- Synthesised sound: positional effects per activity, and generative
  background music per biome

## 1. Privacy and safety

- [x] Hide repos, or show only some (`hide`, `only`)
- [x] Extra redaction words and patterns (`redact`)
- [x] Public mode: all text, paths and repo names stripped on the server
- [ ] Optional local access token, for an extra lock
- [ ] Per-town "blur" toggle from the UI, without editing the config

## 2. Everyday awareness

- [x] macOS menu bar icon via SwiftBar: count of agents waiting for you, native notifications
- [ ] Native SwiftUI menu bar app (no SwiftBar needed)
- [x] Start on login (`./kafra.sh autostart on`, a per-user LaunchAgent)

## 3. Deeper monitoring

- [x] Timeline replay: any day, ×10–×1200, commit and failure marks
- [x] Daily "Kafra newspaper": agents, commits, failed and fixed tests, jump to moments
- [ ] Arena test history: pass and fail over time
- [ ] Log context compaction (HP refilling) in the chat log

## 4. More agents

- [x] Codex CLI / Desktop source (Wizard)
- [x] Gemini CLI source (Sage)
- [x] A job class per tool
- [ ] Aider, Cursor, OpenCode sources

## 5. Game layer

- [ ] Statues for releases and git tags

## 6. Quality

- [x] Bounded memory: replay cache of 3 days / 10 min, heap capped under autostart
- [x] Tests clean up after themselves; `./kafra.sh clean` for temp files
- [ ] `fs.watch` instead of polling every 2 s
- [ ] Browser tests for the city (Playwright)
- [ ] Colour-blind palette and reduced-motion mode

## 7. Interaction (opt-in, highest risk)

- [ ] Approve tool calls and send messages from the city. This needs Claude
      Code hooks, so it stays optional, local and token-protected.

## Not planned

- **Hosting Kafra on the public internet.** It shows prompts, paths and repo
  names, and has no login by design. To view it from another device, use
  Tailscale or an SSH tunnel; to show it to others, use public mode.
- **Remote CI sources (TeamCity and similar).** They would break the
  local-only promise.
