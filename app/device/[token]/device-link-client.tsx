'use client';

import { useState } from 'react';

export default function DeviceLinkClient({ token }: { token: string }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(false);

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

  return <main className="join-shell"><section className="join-card"><div className="join-mark" aria-hidden="true">端</div><p className="join-eyebrow">別の端末につなぎます</p><h1>同じ名前で使う</h1><p className="join-description">今使っているメンバーとして、この端末を追加します。</p>{error && <p className="join-error" role="alert">この接続リンクは使用できません。元の端末で作り直してください。</p>}<button type="button" onClick={connect} disabled={connecting}>{connecting ? 'つないでいます…' : 'この端末で使う'}</button></section></main>;
}
