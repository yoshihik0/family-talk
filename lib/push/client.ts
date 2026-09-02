'use client';

export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function getAppServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_unsupported');
  // 同じスクリプトとscopeなら register は既存の登録を返すので、呼び直しても増えない。
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getNotificationState(): Promise<NotificationState> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';
  try {
    const registration = await getAppServiceWorker();
    return await registration.pushManager.getSubscription() ? 'granted' : 'default';
  } catch {
    return 'default';
  }
}

export async function enableNotifications(): Promise<NotificationState> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const keyResponse = await fetch('/api/v1/notify/subscriptions', { cache: 'no-store' });
  if (!keyResponse.ok) throw new Error('push_key_unavailable');
  const { publicKey } = await keyResponse.json() as { publicKey: string };
  const registration = await getAppServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const response = await fetch('/api/v1/notify/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error('push_subscription_save_failed');
  return 'granted';
}
