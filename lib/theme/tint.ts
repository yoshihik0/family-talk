// CSS color-mix() is not reliably supported on some Android WebViews still in
// use by our target audience (elderly family members' phones tend to run old
// OS/WebView versions). Compute the blended color in JS instead so message
// bubbles render correctly everywhere, not just on modern browsers.
export function tintWithWhite(hex: string, percent: number) {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const ratio = Math.max(0, Math.min(100, percent)) / 100;
  const mix = (channel: number) => Math.round(channel * ratio + 255 * (1 - ratio));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
