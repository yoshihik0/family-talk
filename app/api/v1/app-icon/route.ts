import { getDb } from '@/db';
import { spaces, type JsonObject } from '@/db/schema';
import { isSingleGrapheme } from '@/lib/text/graphemes';

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}


// 1デプロイ1グループなので、そのグループを引く。spaceIdは受け取らない
// (インストール済みPWAが付けてくる旧URLのクエリは、単に無視される)。
async function getOnlySpace() {
  const [space] = await getDb()
    .select({ id: spaces.id, name: spaces.name, settings: spaces.settings, updatedAt: spaces.updatedAt })
    .from(spaces)
    .limit(1);
  return space ?? null;
}

export async function GET(request: Request) {
  const size = new URL(request.url).searchParams.get('size') === '512' ? 512 : 192;
  const space = await getOnlySpace();
  if (!space) return new Response('Not found', { status: 404 });
  const profile = ((space.settings ?? {}) as JsonObject).appProfile as JsonObject | undefined;
  const icon = typeof profile?.icon === 'string' && isSingleGrapheme(profile.icon) ? profile.icon.trim() : '🏡';
  const color = typeof profile?.color === 'string' && /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : '#3f7d61';
  const fontSize = Math.round(size * .46);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * .22)}" fill="${color}"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,Apple Color Emoji,Noto Color Emoji,sans-serif" font-size="${fontSize}">${escapeXml(icon)}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
