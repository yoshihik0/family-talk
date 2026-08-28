import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { deviceSessions, identities, spaceMembers, spaces } from '@/db/schema';

export const SESSION_COOKIE = 'pdh_session';
const SESSION_DAYS = 90;

export function spaceSessionCookieName(spaceId: string) {
  return `pdh_space_${spaceId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export function createOpaqueToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function createDeviceSession(identityId: string, spaceId: string, label?: string) {
  const db = getDb();
  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(deviceSessions).values({
    id: crypto.randomUUID(),
    identityId,
    spaceId,
    tokenHash: await hashToken(token),
    label: label ?? null,
    expiresAt,
    lastSeenAt: now,
    revokedAt: null,
    createdAt: now,
  });

  return { token, expiresAt };
}

export async function getDeviceSession(request: Request, preferredSpaceId?: string) {
  const cookie = request.headers.get('cookie') ?? '';
  const cookieValues = new Map(cookie
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf('=');
      return separator > 0 ? [part.slice(0, separator), part.slice(separator + 1)] as const : ['', ''] as const;
    })
    .filter(([name]) => Boolean(name)));
  const token = (preferredSpaceId && cookieValues.get(spaceSessionCookieName(preferredSpaceId))) || cookieValues.get(SESSION_COOKIE);
  if (!token) return null;

  const now = new Date();
  const [session] = await getDb()
    .select({
      sessionId: deviceSessions.id,
      identityId: identities.id,
      displayName: identities.displayName,
      identityMetadata: identities.metadata,
      spaceId: spaces.id,
      spaceName: spaces.name,
      spaceType: spaces.type,
      settings: spaces.settings,
      role: spaceMembers.role,
    })
    .from(deviceSessions)
    .innerJoin(identities, eq(deviceSessions.identityId, identities.id))
    .innerJoin(spaces, eq(deviceSessions.spaceId, spaces.id))
    .innerJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.identityId, identities.id)),
    )
    .where(and(
      eq(deviceSessions.tokenHash, await hashToken(token)),
      isNull(deviceSessions.revokedAt),
      gt(deviceSessions.expiresAt, now),
    ))
    .limit(1);

  if (!session) return null;

  await getDb()
    .update(deviceSessions)
    .set({ lastSeenAt: now })
    .where(eq(deviceSessions.id, session.sessionId));

  return session;
}

export function makeSessionCookie(token: string, expiresAt: Date, secure: boolean, spaceId?: string) {
  const attributes = [
    `${spaceId ? spaceSessionCookieName(spaceId) : SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
