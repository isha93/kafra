/**
 * What every agent source shares: reading the end of a large file, and
 * turning "what happened last" into the activity kind the city draws.
 *
 * Each source (claude-code, codex, gemini, …) parses its own format and hands
 * back sessions in one shape; see the return value of `session()` below.
 */
import { open } from 'node:fs/promises';

/** Transcripts reach hundreds of MB. Only the tail carries current state. */
export const TAIL_BYTES = 256 * 1024;

/**
 * The last `bytes` of a file as lines. The first line is dropped when the read
 * starts mid-file: half a JSON object is worse than one missing record.
 */
export async function tailLines(path, size, bytes = TAIL_BYTES) {
  const start = Math.max(0, size - bytes);
  const fh = await open(path, 'r');
  try {
    const { buffer } = await fh.read({ buffer: Buffer.alloc(Math.min(bytes, size)), position: start });
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    return lines.filter(Boolean);
  } finally {
    await fh.close();
  }
}

/**
 * Lines from the end of a file towards the start, a chunk at a time, so a
 * replay of today never reads last month. Stop iterating to stop reading.
 */
export async function* backwardLines(path, size, chunk = 1 << 20) {
  const fh = await open(path, 'r');
  try {
    let pos = size;
    // Bytes, not text: a chunk boundary can split a multi-byte character, and
    // only whole lines (split on the newline byte) are safe to decode.
    let carry = Buffer.alloc(0);
    while (pos > 0) {
      const len = Math.min(chunk, pos);
      pos -= len;
      const { buffer } = await fh.read({ buffer: Buffer.alloc(len), position: pos });
      let data = Buffer.concat([buffer, carry]);
      let end = data.length;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i] !== 0x0a) continue;
        if (end > i + 1) yield data.subarray(i + 1, end).toString('utf8');
        end = i;
      }
      // Whatever precedes the first newline may continue in the previous chunk.
      carry = data.subarray(0, end);
    }
    if (carry.length) yield carry.toString('utf8');
  } finally {
    await fh.close();
  }
}

/** The first line of a file, for formats that put session metadata there. */
export async function headLine(path, bytes = 64 * 1024) {
  const fh = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await fh.read({ buffer: Buffer.alloc(bytes), position: 0 });
    return buffer.subarray(0, bytesRead).toString('utf8').split('\n')[0];
  } finally {
    await fh.close();
  }
}

/**
 * Current activity from the shape of the end of a session.
 *
 * - A tool still running counts as active for up to 10 minutes (a long build
 *   writes nothing while it runs).
 * - Most tools finish in milliseconds, so between calls the agent keeps the
 *   kind of its latest tool; otherwise it would look like "thinking" forever.
 * - A turn that ended without a tool call is the agent handing control back.
 */
export function decideState({ pending, latest, turnEnded, afterPrompt, ageMs }) {
  if (pending && ageMs < 10 * 60_000) return { kind: pending.kind, tool: pending };
  if (ageMs < 90_000) {
    if (turnEnded) return { kind: 'waiting' };
    if (latest && !afterPrompt) return { kind: latest.kind, tool: latest };
    return { kind: 'cast' };
  }
  if (ageMs < 30 * 60_000) return { kind: turnEnded ? 'waiting' : 'idle' };
  return { kind: 'resting' };
}

export function statusOfKind(kind) {
  if (kind === 'resting') return 'resting';
  if (kind === 'idle' || kind === 'waiting') return 'idle';
  return 'active';
}

/** HP: the share of the context window still free, 0–100. */
export const hpOf = (used, window) => Math.max(0, Math.min(100, Math.round((1 - used / window) * 100)));
