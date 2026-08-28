'use client';

export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function groupAppPath(spaceId: string) {
  return `/s/${encodeURIComponent(spaceId)}`;
}

export async function getGroupServiceWorker(spaceId: string) {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_unsupported');
  const scopePath = groupAppPath(spaceId);
  const scopeUrl = new URL(scopePath, window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const current = registrations.find((registration) => registration.scope === scopeUrl);
  return current ?? navigator.serviceWorker.register(`/sw.js?spaceId=${encodeURIComponent(spaceId)}`, { scope: scopePath });
}

export async function getNotificationState(spaceId: string): Promise<NotificationState> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';
  try {
    const registration = await getGroupServiceWorker(spaceId);
    return await registration.pushManager.getSubscription() ? 'granted' : 'default';
  } catch {
    return 'default';
  }
}

export async function enableNotifications(spaceId: string): Promise<NotificationState> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const keyResponse = await fetch('/api/v1/notify/subscriptions', { cache: 'no-store' });
  if (!keyResponse.ok) throw new Error('push_key_unavailable');
  const { publicKey } = await keyResponse.json() as { publicKey: string };
  const registration = await getGroupServiceWorker(spaceId);
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const response = await fetch('/api/v1/notify/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId, subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error('push_subscription_save_failed');
  return 'granted';
}
