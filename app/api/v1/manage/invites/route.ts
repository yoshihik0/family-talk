import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { invites, spaces, type JsonObject } from '@/db/schema';
import { createOpaqueToken, getDeviceSession, hashToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { spaceId?: unknown } | null;
  const requestedSpaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;
  const [space] = await getDb().select({ settings: spaces.settings }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  const appProfile = ((space?.settings ?? {}) as JsonObject).appProfile as JsonObject | undefined;
  if (!appProfile || typeof appProfile.name !== 'string' || typeof appProfile.icon !== 'string' || typeof appProfile.color !== 'string') {
    return Response.json({ error: 'app_profile_required' }, { status: 409 });
  }

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await getDb().insert(invites).values({
    id: crypto.randomUUID(),
    spaceId,
    createdBy: session.identityId,
    tokenHash: await hashToken(token),
    role: 'member',
    maxUses: 1,
    usedCount: 0,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  });

  const origin = new URL(request.url).origin;
  return Response.json({
    inviteUrl: `${origin}/join/${token}`,
    expiresAt: expiresAt.toISOString(),
  }, { status: 201 });
}
