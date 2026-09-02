import webpush from 'web-push';
import { and, eq, ne } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { pushSubscriptions } from '@/db/schema';

const DELIVERY_TIMEOUT_MS = 3000;

export async function notifySpaceMembers(spaceId: string, senderId: string) {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;
  const subscriptions = await getDb().select().from(pushSubscriptions).where(and(eq(pushSubscriptions.spaceId, spaceId), ne(pushSubscriptions.identityId, senderId)));
  const payload = JSON.stringify({ url: '/', tag: 'new-message' });
  const delivery = Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, urgency: 'normal', topic: `space-${spaceId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
      });
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    }
  }));

  // 配信先が応答しないときに、メッセージ送信そのものを道連れにしないための上限。
  // ここで諦めても本文はすでに保存済みで、相手の画面には次の更新で出る。通知が
  // 届かないだけで済ませる方が、送信失敗と誤解されて二重投稿されるより良い。
  await Promise.race([delivery, new Promise((resolve) => setTimeout(resolve, DELIVERY_TIMEOUT_MS))]);
}
