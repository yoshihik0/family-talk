import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { deviceSessions, identities, spaceMembers, spaces } from '@/db/schema';

export const SESSION_COOKIE = 'pdh_session';
// ブラウザ(Chrome)はCookieの有効期限を最長400日に切り詰めるので、これ以上長くしても
// 端末側では延びない。そのぶん「使うたびに延ばす」ことで、使い続けている端末が
// 期限切れで締め出されないようにする。
const SESSION_DAYS = 400;
// 残りが半分を切ったら延長する。15秒ごとのポーリングで毎回書き込まないための間引き。
const SESSION_RENEW_AFTER_DAYS = SESSION_DAYS / 2;

export function sessionExpiryFrom(now: Date) {
  return new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
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
  const expiresAt = sessionExpiryFrom(now);

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

// どのグループを見るかはリクエストではなくセッションが決める。呼び出し側が spaceId を
// 渡す余地を残さないことで、「指定されたグループの権限を引き直し忘れる」種類の穴を塞ぐ。
export async function getDeviceSession(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf('=');
      return separator > 0 ? [part.slice(0, separator), part.slice(separator + 1)] as const : ['', ''] as const;
    })
    .find(([name]) => name === SESSION_COOKIE)?.[1];
  if (!token) return null;

  const now = new Date();
  const [session] = await getDb()
    .select({
      sessionId: deviceSessions.id,
      expiresAt: deviceSessions.expiresAt,
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

  // 使われているセッションは期限を延ばす。延ばしたときは、呼び出し側が同じ有効期限で
  // Cookieを貼り直せるように renewedCookie を返す(DBだけ延ばしても、端末側のCookieが
  // 先に消えてしまうと復旧手段が無い)。
  const renew = session.expiresAt.getTime() - now.getTime() < SESSION_RENEW_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = renew ? sessionExpiryFrom(now) : session.expiresAt;

  await getDb()
    .update(deviceSessions)
    .set(renew ? { lastSeenAt: now, expiresAt } : { lastSeenAt: now })
    .where(eq(deviceSessions.id, session.sessionId));

  return {
    ...session,
    renewedCookie: renew
      ? makeSessionCookie(token, expiresAt, new URL(request.url).protocol === 'https:')
      : null,
  };
}

export function makeSessionCookie(token: string, expiresAt: Date, secure: boolean) {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    // Strictにすると、LINEやメールに貼られたリンクからアプリを開いたときにCookieが送られず、
    // ログインは生きているのに「ログイン情報が消えています」と出てしまう。Laxならページ遷移では
    // 送られ、サイト外からのPOST等では送られないので、CSRF防御は保ったまま誤検知だけ消える。
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
