import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { spaceId?: unknown; displayName?: unknown; avatarLabel?: unknown; avatarColor?: unknown } | null;
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, spaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : session.displayName;
  const avatarLabel = typeof body?.avatarLabel === 'string' ? body.avatarLabel.trim() : '';
  const avatarColor = typeof body?.avatarColor === 'string' ? body.avatarColor : session.identityMetadata?.avatarColor;
  if (!displayName || displayName.length > 40 || Array.from(avatarLabel).length !== 1 || typeof avatarColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(avatarColor)) {
    return Response.json({ error: 'invalid_avatar' }, { status: 400 });
  }
  await getDb().update(identities).set({ displayName, metadata: { ...(session.identityMetadata ?? {}), avatarLabel, avatarColor }, updatedAt: new Date() }).where(eq(identities.id, session.identityId));
  return Response.json({ displayName, avatarLabel, avatarColor });
}
