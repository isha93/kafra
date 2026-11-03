/**
 * Minimal Retro Diffusion client, plus a CLI for one-off generations.
 *
 *   node scripts/rd.mjs <style> <w>x<h> <count> "<prompt>" <out-prefix> [--input img.png] [--frames 6] [--dry]
 *
 * Images land at <out-prefix>-1.png, -2.png… Reads RETRO_DIFFUSION_API_KEY from .env.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const API = 'https://api.retrodiffusion.ai/v2';

export async function apiKey() {
  const env = await readFile(new URL('.env', ROOT), 'utf8').catch(() => '');
  const key = process.env.RETRO_DIFFUSION_API_KEY ?? env.match(/^RETRO_DIFFUSION_API_KEY=(.+)$/m)?.[1]?.trim();
  if (!key) throw new Error('RETRO_DIFFUSION_API_KEY tidak ada di .env');
  return key;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function call(key, method, path, body) {
  for (;;) {
    const res = await fetch(API + path, {
      method,
      headers: { 'X-RD-Token': key, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(Number(res.headers.get('retry-after') ?? 5) * 1000); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
}

/** V2 queues work and is polled; a dry run may answer directly. Resolves to the result object. */
export async function infer(key, body) {
  const first = await call(key, 'POST', '/inferences', body);
  if (!first.task_id) return first;
  for (let i = 0; i < 180; i++) {
    await sleep(2000);
    const task = await call(key, 'GET', `/inferences/tasks/${first.task_id}`);
    if (task.result) return task.result;
    if (/fail|error|cancel/i.test(task.status ?? '')) throw new Error(`task ${first.task_id}: ${JSON.stringify(task).slice(0, 300)}`);
  }
  throw new Error(`task ${first.task_id} tidak selesai dalam 6 menit`);
}

/** Generate and save every returned image; returns the paths and the cost. */
export async function generate(key, body, outPrefix) {
  const r = await infer(key, body);
  await mkdir(dirname(outPrefix), { recursive: true });
  const paths = [];
  for (const [i, b64] of (r.base64_images ?? []).entries()) {
    const path = `${outPrefix}-${i + 1}.png`;
    await writeFile(path, Buffer.from(b64, 'base64'));
    paths.push(path);
  }
  return { paths, cost: r.balance_cost ?? 0, remaining: r.remaining_balance, raw: r };
}

async function cli() {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args.splice(i, 2)[1]; };
  const dry = args.includes('--dry');
  if (dry) args.splice(args.indexOf('--dry'), 1);
  const input = flag('--input');
  const frames = flag('--frames');
  const [style, size, count, prompt, out] = args;
  if (!out) { console.error('usage: node scripts/rd.mjs <style> <w>x<h> <count> "<prompt>" <out-prefix> [--input img] [--frames n] [--dry]'); process.exit(1); }
  const [width, height] = size.split('x').map(Number);
  const body = { prompt, prompt_style: style, width, height, num_images: Number(count), check_cost: dry };
  if (input) body.input_image = (await readFile(input)).toString('base64');
  if (frames) body.frames_duration = Number(frames);
  if (/isometric_asset|item|object|icon/.test(style)) body.remove_bg = true;

  const key = await apiKey();
  if (dry) { const r = await infer(key, body); console.log(`biaya $${r.balance_cost}`); return; }
  const { paths, cost, remaining, raw } = await generate(key, body, resolve(out));
  const extra = Object.keys(raw).filter((k) => !['base64_images', 'balance_cost', 'remaining_balance', 'created_at', 'model'].includes(k));
  console.log(`${paths.join('\n')}\nbiaya $${cost} · sisa $${remaining}${extra.length ? ` · field lain: ${extra.join(', ')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((err) => { console.error(String(err.message ?? err)); process.exit(1); });
}
