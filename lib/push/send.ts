import webpush from 'web-push';
import { and, eq, ne } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { pushSubscriptions } from '@/db/schema';

export async function notifySpaceMembers(spaceId: string, senderId: string) {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;
  const subscriptions = await getDb().select().from(pushSubscriptions).where(and(eq(pushSubscriptions.spaceId, spaceId), ne(pushSubscriptions.identityId, senderId)));
  const payload = JSON.stringify({ url: `/s/${encodeURIComponent(spaceId)}`, tag: `space-${spaceId}` });
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, urgency: 'normal', topic: `space-${spaceId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
      });
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    }
  }));
}
