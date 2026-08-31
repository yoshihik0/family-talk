'use client';

import { useEffect, useState } from 'react';

export default function DeviceLinkClient({ token }: { token: string }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(false);
  const [avatarLabel, setAvatarLabel] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3f7d61');

  useEffect(() => {
    fetch(`/api/v1/device-links/claim?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ displayName: string; avatarLabel: string; avatarColor: string }> : null)
      .then((data) => { if (data) { setAvatarLabel(data.avatarLabel); setAvatarColor(data.avatarColor); } })
      .catch(() => undefined);
  }, [token]);

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setError(false);
    const response = await fetch('/api/v1/device-links/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    if (!response?.ok) { setConnecting(false); setError(true); return; }
    const result = await response.json() as { spaceId: string };
    window.sessionStorage.setItem('pdh-install-space', result.spaceId);
    window.location.href = `/s/${encodeURIComponent(result.spaceId)}`;
  }

  return <main className="join-shell"><section className="join-card"><div className="join-mark" aria-hidden="true" style={{ background: avatarColor }}>{avatarLabel}</div><p className="join-eyebrow">別の端末につなぎます</p>{error && <p className="join-error" role="alert">この接続リンクは使用できません。元の端末で作り直してください。</p>}<button type="button" onClick={connect} disabled={connecting}>{connecting ? 'つないでいます…' : 'この端末で使う'}</button></section></main>;
}
