'use client';

import { writeStored } from '@/lib/browser/compat';

import { useEffect, useState } from 'react';

export default function DeviceLinkClient({ token }: { token: string }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarLabel, setAvatarLabel] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3f7d61');

  useEffect(() => {
    fetch(`/api/v1/device-links/claim?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ displayName: string; avatarLabel: string; avatarColor: string }> : null)
      .then((data) => { if (data) { setDisplayName(data.displayName); setAvatarLabel(data.avatarLabel); setAvatarColor(data.avatarColor); } })
      .catch(() => undefined);
  }, [token]);

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setError(false);
    const response = await fetch('/api/v1/device-links/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    if (!response?.ok) { setConnecting(false); setError(true); return; }
    writeStored('session', 'pdh-install-guide', '1');
    window.location.href = '/';
  }

  return (
    <main className="join-shell">
      <section className="join-card device-link-card">
        <div className="device-link-identity">
          <div className="join-mark" aria-hidden="true" style={{ background: avatarColor }}>{avatarLabel}</div>
          <span className="device-link-name">{displayName}</span>
        </div>
        {error && <p className="join-error" role="alert">この接続リンクは使用できません。元の端末で作り直してください。</p>}
        <button type="button" onClick={connect} disabled={connecting}>{connecting ? 'つないでいます…' : 'この端末で使う'}</button>
      </section>
    </main>
  );
}
