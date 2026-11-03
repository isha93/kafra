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
- Hardening: DNS-rebinding and cross-site protection, strict CSP without eval,
  `npm ci --ignore-scripts`
- Privacy: `kafra.config.json` (hide / only / redact) and public mode

## 1. Privacy and safety

- [x] Hide repos, or show only some (`hide`, `only`)
- [x] Extra redaction words and patterns (`redact`)
- [x] Public mode: all text, paths and repo names stripped on the server
- [ ] Optional local access token, for an extra lock
- [ ] Per-town "blur" toggle from the UI, without editing the config

## 2. Everyday awareness

- [ ] macOS menu bar icon: count of agents waiting for you, native notifications
- [ ] Start on login
- [ ] Install with `npx` or Homebrew

## 3. Deeper monitoring

- [ ] Timeline replay per town: scrub back through today
- [ ] Daily "Kafra newspaper": agents, commits, failed and fixed tests
- [ ] Arena test history: pass and fail over time
- [ ] Log context compaction (HP refilling) in the chat log

## 4. More agents

- [ ] Codex CLI source
- [ ] Gemini CLI, Aider, Cursor sources
- [ ] A job class per tool

## 5. Game layer

- [ ] Achievements: first commit, green streaks, a town reaching City
- [ ] EXP and levels per adventurer
- [ ] Failing tests appear as monsters in the arena until they pass
- [ ] Statues for releases and git tags
- [ ] Tier-up animation: construction, then fireworks

## 6. Quality

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
