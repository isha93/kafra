/**
 * Time of day and weather.
 *
 * Time follows the viewer's clock, so late-night sessions look late-night.
 * Weather follows the work: a town with a failing tool right now gets rain.
 * `?hour=21` and `?weather=rain` in the URL override both, for checking looks.
 */

const params = new URLSearchParams(location.search);
const HOUR_OVERRIDE = params.has('hour') ? Number(params.get('hour')) : null;
export const WEATHER_OVERRIDE = params.get('weather');

/** Keyframes: hour → multiply tint and how much lamps glow (0–1). */
const KEYS = [
  [0, 0x5a68b0, 1],
  [5, 0x6a74b8, 1],
  [6.5, 0xffc8a8, 0.4],
  [8, 0xffffff, 0],
  [17, 0xffffff, 0],
  [18.3, 0xffb890, 0.5],
  [19.5, 0x7080c0, 1],
  [24, 0x5a68b0, 1],
];

function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export function skyAt(date = new Date()) {
  const h = HOUR_OVERRIDE ?? date.getHours() + date.getMinutes() / 60;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, c0, g0] = KEYS[i];
    const [h1, c1, g1] = KEYS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return { tint: mix(c0, c1, t), glow: g0 + (g1 - g0) * t };
    }
  }
  return { tint: 0xffffff, glow: 0 };
}

/** Rain while any agent in the town is standing on a failed tool call. */
export function isStormy(town) {
  if (WEATHER_OVERRIDE) return WEATHER_OVERRIDE === 'rain';
  return town.agents.some((a) => a.status === 'active' && a.tools?.[0]?.error);
}
