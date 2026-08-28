import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { deviceLinks, spaces } from '@/db/schema';
import { createDeviceSession, hashToken, makeSessionCookie } from '@/lib/auth/session';

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
