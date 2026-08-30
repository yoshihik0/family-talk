import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { invites, spaces, type JsonObject } from '@/db/schema';
import { createOpaqueToken, getDeviceSession, hashToken } from '@/lib/auth/session';
import { requireHostForSpace } from '@/lib/auth/authorize';

const MULTI_USE_MAX_USES = 50;
const MULTI_USE_MAX_DAYS = 7;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { spaceId?: unknown; multiUse?: unknown; expiresInDays?: unknown } | null;
  const requestedSpaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;

  // 通常の招待(1人・7日間)は誰でも作れる。複数人向け・期限指定は管理者限定。
  let maxUses = 1;
  let expiresInDays = 7;
  if (body?.multiUse === true) {
    const auth = await requireHostForSpace(request, spaceId);
    if ('error' in auth) return auth.error;
    maxUses = MULTI_USE_MAX_USES;
    const requestedExpiresInDays = Number(body?.expiresInDays);
    expiresInDays = Number.isInteger(requestedExpiresInDays) && requestedExpiresInDays >= 1 && requestedExpiresInDays <= MULTI_USE_MAX_DAYS ? requestedExpiresInDays : MULTI_USE_MAX_DAYS;
  }

  const [space] = await getDb().select({ settings: spaces.settings }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  const appProfile = ((space?.settings ?? {}) as JsonObject).appProfile as JsonObject | undefined;
  if (!appProfile || typeof appProfile.name !== 'string' || typeof appProfile.icon !== 'string' || typeof appProfile.color !== 'string') {
    return Response.json({ error: 'app_profile_required' }, { status: 409 });
  }

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  await getDb().insert(invites).values({
    id: crypto.randomUUID(),
    spaceId,
    createdBy: session.identityId,
    tokenHash: await hashToken(token),
    role: 'member',
    maxUses,
    usedCount: 0,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  });

  const origin = new URL(request.url).origin;
  return Response.json({
    inviteUrl: `${origin}/join/${token}`,
    expiresAt: expiresAt.toISOString(),
    maxUses,
  }, { status: 201 });
}
