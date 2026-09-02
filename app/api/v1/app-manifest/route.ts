import { getDb } from '@/db';
import { spaces, type JsonObject } from '@/db/schema';


// 1デプロイ1グループなので、そのグループを引く。spaceIdは受け取らない
// (インストール済みPWAが付けてくる旧URLのクエリは、単に無視される)。
async function getOnlySpace() {
  const [space] = await getDb()
    .select({ id: spaces.id, name: spaces.name, settings: spaces.settings, updatedAt: spaces.updatedAt })
    .from(spaces)
    .limit(1);
  return space ?? null;
}

export async function GET() {
  const space = await getOnlySpace();
  if (!space) return Response.json({ error: 'space_not_found' }, { status: 404 });
  const profile = ((space.settings ?? {}) as JsonObject).appProfile as JsonObject | undefined;
  const appName = typeof profile?.name === 'string' ? profile.name : Array.from(space.name).slice(0, 4).join('');
  const color = typeof profile?.color === 'string' && /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : '#3f7d61';
  const version = space.updatedAt.getTime();
  return Response.json({
    id: '/',
    name: appName,
    short_name: appName,
    description: `${space.name}の会話`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f8f5',
    theme_color: color,
    lang: 'ja',
    orientation: 'portrait-primary',
    icons: [
      { src: `/api/v1/app-icon?size=192&v=${version}`, sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: `/api/v1/app-icon?size=512&v=${version}`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } });
}
