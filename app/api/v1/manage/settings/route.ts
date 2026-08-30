import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { spaces, type JsonObject } from '@/db/schema';
import { requireHostForSpace } from '@/lib/auth/authorize';
import { isSingleGrapheme } from '@/lib/text/graphemes';

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { spaceId?: unknown; name?: unknown; icon?: unknown; color?: unknown } | null;
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const auth = await requireHostForSpace(request, spaceId);
  if ('error' in auth) return auth.error;

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const icon = typeof body?.icon === 'string' ? body.icon.trim() : '';
  const color = typeof body?.color === 'string' ? body.color : '';
  if (!name || name.length > 40 || !isSingleGrapheme(icon) || !/^#[0-9a-f]{6}$/i.test(color)) {
    return Response.json({ error: 'invalid_group_profile' }, { status: 400 });
  }

  const [space] = await getDb().select({ settings: spaces.settings }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!space) return Response.json({ error: 'space_not_found' }, { status: 404 });
  const current = (space.settings ?? {}) as JsonObject;
  const settings: JsonObject = {
    ...current,
    appProfile: { name: Array.from(name).slice(0, 4).join(''), icon, color },
  };

  await getDb().update(spaces).set({ name, settings, updatedAt: new Date() }).where(eq(spaces.id, spaceId));

  return Response.json({ space: { id: spaceId, name, settings } });
}
