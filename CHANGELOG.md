# Changelog

## Unreleased

- Base levels. Every class in every town is one adventurer whose EXP adds up
  across sessions: +1 per successful tool, +3 per file built, +5 per passing
  test run, +15 more per bug slain. Levels show on name tags, in the party bar
  and the agent panel; a level-up sets off fireworks and a line in the chat log.
- Kafra now saves one file, `~/.config/kafra/exp.json`, with EXP numbers and
  recent tool ids only. Demo and simulation keep theirs in the temp folder.
- A commit's pop-up now says "Quest Clear!", leaving "Level Up!" to adventurers.

## v0.1.2 — bugs in the arena

- Failing tests become bugs in the arena. An agent whose latest test run failed
  has a bug waiting for it. Each failure in a row makes it bigger and meaner
  (three generated looks, from a small yellow beetle to a red boss); it
  flinches when the agent swings, and bursts with "Clear!" when a run passes. The chat log says when one appears and when it's cleared, and replay
  shows them too.

## v0.1.1 — install with Homebrew

- `brew install isha93/tap/kafra`, then run `kafra`. The clone and
  `./kafra.sh` work as before.
- Installed copies keep their settings in `~/.config/kafra/config.json`, so an
  upgrade never overwrites them. Autostart and the menu bar point at Homebrew's
  stable `opt/` path, so they keep working after `brew upgrade`.
- `kafra version` prints the version.
- On npm as `@isha93/kafra` (`npx @isha93/kafra`); CI checks that the package
  holds only files from git and runs after install.
- Server startup messages are in English.

## v0.1.0 — first public release

The first release of Kafra: a Ragnarok-style world for watching your AI coding
agents, running entirely on your own machine.

**The world**
- One repo, one town; one GitHub owner, one kingdom on the world map.
- Towns grow from Camp to Capital with files, commits and age, and take a biome
  from the repo's main language and a mood from its commit activity.
- Agents walk to their work: building at the district that owns the file,
  reading in the library, crafting in the workshop, training in the arena.
- Generated pixel art for every class, building, skill and tile, with
  code-drawn fallbacks. Day and night, rain on failures, fireworks on commits.

**Agents**
- Claude Code (classes by model), Codex CLI and Desktop (Wizard), Gemini CLI (Sage).
- Subagents appear as party members beside their leader.

**Staying aware**
- Status rings, the party bar, alerts for waiting, failures, long runs and low context.
- macOS menu bar via SwiftBar, native notifications from Kafra Notifier, autostart at login.
- Replay any day at ×10–×1200, and the daily newspaper (Koran Kafra).
- Synthesised sound effects and generative music, off by default.

**Privacy and safety**
- Read-only, `127.0.0.1` only, no network, no tokens, zero dependencies.
- DNS-rebinding and cross-site guards, strict CSP without eval.
- `kafra.config.json` to hide repos or redact words; public mode strips all text on the server.

**Languages**
- English and Indonesian, following your system language, with a 🌐 toggle.

**Known limits**
- Agents' session formats are internal to each tool and may change without notice.
- Menu bar, notifier and autostart are macOS-only. Linux runs the city; Windows needs WSL.
