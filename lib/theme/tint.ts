// CSS color-mix() is not reliably supported on some Android WebViews still in
// use by our target audience (elderly family members' phones tend to run old
// OS/WebView versions). Compute the blended color in JS instead so message
// bubbles render correctly everywhere, not just on modern browsers.
//
// A flat white-mix ratio makes already-light source colors (e.g. a warm gold)
// wash out to something barely distinguishable from the paper background. To
// avoid that, the mix ratio has a floor: it rises above `percent` only as
// needed to keep the result's perceived lightness under MAX_MIX_LIGHTNESS.
// Dark/saturated colors already land under that cap at the base percent, so
// they're unaffected.
const MAX_MIX_LIGHTNESS = 235;

export function tintWithWhite(hex: string, percent: number) {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lightness = 0.299 * r + 0.587 * g + 0.114 * b;
  const baseRatio = Math.max(0, Math.min(100, percent)) / 100;
  const neededRatio = lightness < 255 ? (255 - MAX_MIX_LIGHTNESS) / (255 - lightness) : baseRatio;
  const ratio = Math.min(1, Math.max(baseRatio, neededRatio));
  const mix = (channel: number) => Math.round(channel * ratio + 255 * (1 - ratio));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
