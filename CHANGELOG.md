# Changelog

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
