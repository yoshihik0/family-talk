import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { deviceLinks, identities, spaces, type JsonObject } from '@/db/schema';
import { createDeviceSession, hashToken, makeSessionCookie } from '@/lib/auth/session';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!token) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const now = new Date();
  const [link] = await getDb()
    .select({ identityId: deviceLinks.identityId })
    .from(deviceLinks)
    .where(and(eq(deviceLinks.tokenHash, await hashToken(token)), isNull(deviceLinks.usedAt), gt(deviceLinks.expiresAt, now)))
    .limit(1);
  if (!link) return Response.json({ error: 'device_link_unavailable' }, { status: 410 });
  const [identity] = await getDb().select({ displayName: identities.displayName, metadata: identities.metadata }).from(identities).where(eq(identities.id, link.identityId)).limit(1);
  const metadata = (identity?.metadata ?? {}) as JsonObject;
  return Response.json({
    displayName: identity?.displayName ?? '',
    avatarLabel: typeof metadata.avatarLabel === 'string' ? metadata.avatarLabel : (identity?.displayName ?? '').slice(0, 1),
    avatarColor: typeof metadata.avatarColor === 'string' ? metadata.avatarColor : '#3f7d61',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const now = new Date();
  const [link] = await getDb().update(deviceLinks).set({ usedAt: now }).where(and(eq(deviceLinks.tokenHash, await hashToken(token)), isNull(deviceLinks.usedAt), gt(deviceLinks.expiresAt, now))).returning({ identityId: deviceLinks.identityId, spaceId: deviceLinks.spaceId });
  if (!link) return Response.json({ error: 'device_link_unavailable' }, { status: 410 });
  const [space] = await getDb().select({ name: spaces.name }).from(spaces).where(eq(spaces.id, link.spaceId)).limit(1);
  const { token: sessionToken, expiresAt } = await createDeviceSession(link.identityId, link.spaceId, 'linked device');
  const response = Response.json({ ok: true, spaceId: link.spaceId, spaceName: space?.name ?? '' });
  response.headers.append('Set-Cookie', makeSessionCookie(sessionToken, expiresAt, new URL(request.url).protocol === 'https:', link.spaceId));
  return response;
}
