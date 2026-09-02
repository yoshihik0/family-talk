import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';

export async function GET() {
  if (!env.VAPID_PUBLIC_KEY) return Response.json({ error: 'push_not_configured' }, { status: 503 });
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { subscription?: { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } } | null;
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = session.spaceId;
  const endpoint = typeof body?.subscription?.endpoint === 'string' ? body.subscription.endpoint : '';
  const p256dh = typeof body?.subscription?.keys?.p256dh === 'string' ? body.subscription.keys.p256dh : '';
  const auth = typeof body?.subscription?.keys?.auth === 'string' ? body.subscription.keys.auth : '';
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return Response.json({ error: 'invalid_subscription' }, { status: 400 });
  const now = new Date();
  const expirationTime = typeof body?.subscription?.expirationTime === 'number' ? new Date(body.subscription.expirationTime) : null;
  await getDb().insert(pushSubscriptions).values({ id: crypto.randomUUID(), identityId: session.identityId, spaceId, endpoint, p256dh, auth, userAgent: request.headers.get('user-agent'), expiresAt: expirationTime, lastSeenAt: now, createdAt: now }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { identityId: session.identityId, spaceId, p256dh, auth, userAgent: request.headers.get('user-agent'), expiresAt: expirationTime, lastSeenAt: now },
  });
  return Response.json({ ok: true });
}
