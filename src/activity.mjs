/**
 * What an agent is doing, in words the city can draw.
 *
 * Every source (Claude Code today, others later) reduces its own tool names to one
 * of these kinds. The client only knows kinds, never tool names, so adding a new
 * agent means writing a mapper, not touching the renderer.
 */
export const KINDS = {
  build: 'building',        // writing files: hammer at the building that owns the file
  research: 'researching',  // reading and searching: library
  craft: 'crafting',        // running commands: workshop
  trial: 'training',        // running tests: training ground
  deliver: 'delivering',    // commit and push: Kafra storage
  teleport: 'teleporting',  // web access: Kafra warp
  summon: 'summoning',      // spawning a subagent
  ask: 'asking',            // waiting on a question it asked you
  cast: 'casting',          // between tools: the model is thinking
  waiting: 'waiting',       // turn ended, your move
  idle: 'idle',
  resting: 'resting',
};

const TEST_RE = /\b(test|tests|jest|vitest|pytest|xcodebuild\b.*\btest|go test|cargo test|swift test|playwright)\b/;
const DELIVER_RE = /\bgit\s+(commit|push|tag)\b|\bgh\s+pr\s+create\b/;

/** A shell command → activity kind; shared by every agent source. */
export function kindOfCommand(command) {
  const cmd = Array.isArray(command) ? command.join(' ') : String(command ?? '');
  if (DELIVER_RE.test(cmd)) return 'deliver';
  if (TEST_RE.test(cmd)) return 'trial';
  return 'craft';
}

/** Claude Code tool call → activity kind. */
export function kindOfClaudeTool(name = '', input = {}) {
  switch (name) {
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'build';
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'LSP':
      return 'research';
    case 'WebSearch':
    case 'WebFetch':
      return 'teleport';
    case 'Agent':
    case 'Task':
      return 'summon';
    case 'AskUserQuestion':
      return 'ask';
    case 'Bash':
      return kindOfCommand(input.command);
    default:
      return 'craft';
  }
}

/** The one thing a tool call was aimed at, short enough for a speech bubble. */
export function targetOfClaudeTool(name = '', input = {}) {
  if (input.file_path) return { file: String(input.file_path) };
  if (input.notebook_path) return { file: String(input.notebook_path) };
  if (name === 'Bash') return { label: oneLine(input.description || input.command) };
  if (name === 'Agent' || name === 'Task') return { label: oneLine(input.description) };
  if (input.pattern) return { label: oneLine(input.pattern) };
  if (input.query) return { label: oneLine(input.query) };
  if (input.url) return { label: oneLine(input.url) };
  return { label: name };
}

export function oneLine(v) {
  return redact(String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80));
}

/**
 * Mask things that look like credentials before they reach a speech bubble.
 *
 * Transcript text is shown on purpose, but a pasted API key floating over a
 * sprite during a screen share is the kind of leak nobody notices until later.
 */
const SECRET_RES = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\brdpk-[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /((?:api[_-]?key|token|secret|password|passwd)\s*[=:]\s*)["']?[^\s"']{6,}/gi,
];

/** Words and patterns from kafra.config.json `redact`, e.g. client names or internal hosts. */
let extra = [];

/**
 * Set the user's own redactions. "/regex/flags" is a regular expression;
 * anything else is a literal, matched case-insensitively.
 */
export function setExtraRedactions(list = []) {
  extra = list.flatMap((s) => {
    const m = s.match(/^\/(.+)\/([a-z]*)$/);
    try {
      return [m ? new RegExp(m[1], m[2].includes('g') ? m[2] : `${m[2]}g`) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')];
    } catch { return []; }
  });
}

export function redact(text) {
  let out = String(text ?? '');
  for (const re of SECRET_RES) {
    out = out.replace(re, (m, prefix) => (typeof prefix === 'string' ? `${prefix}••••` : '••••'));
  }
  for (const re of extra) out = out.replace(re, '••••');
  return out;
}
