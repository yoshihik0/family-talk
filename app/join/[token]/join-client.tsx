'use client';

import { FormEvent, useEffect, useState } from 'react';

export default function JoinClient({ token }: { token: string }) {
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(false);
  const [icon, setIcon] = useState('家');
  const [color, setColor] = useState('#3f7d61');

  useEffect(() => {
    fetch(`/api/v1/join?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ icon: string; color: string }> : null)
      .then((data) => { if (data) { setIcon(data.icon); setColor(data.color); } })
      .catch(() => undefined);
  }, [token]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim() || joining) return;
    setJoining(true);
    setError(false);
    const response = await fetch('/api/v1/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, displayName }),
    }).catch(() => null);
    if (!response?.ok) {
      setJoining(false);
      setError(true);
      return;
    }
    const result = await response.json() as { spaceId: string };
    window.sessionStorage.setItem('pdh-install-space', result.spaceId);
    window.location.href = `/s/${encodeURIComponent(result.spaceId)}`;
  }

  return (
    <main className="join-shell">
      <section className="join-card">
        <div className="join-mark" aria-hidden="true" style={{ background: color }}>{icon}</div>
        <p className="join-eyebrow">招待されています</p>
        <h1>家族のおしゃべりに参加</h1>
        <p className="join-description">この端末で表示する名前を入力してください。参加後は、この家族の会話だけが開きます。</p>
        <form onSubmit={join}>
          <label htmlFor="display-name">あなたの名前</label>
          <input id="display-name" value={displayName} maxLength={30} autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} placeholder="例：お母さん" />
          {error && <p className="join-error" role="alert">この招待は使用できません。新しい招待を送ってもらってください。</p>}
          <button type="submit" disabled={!displayName.trim() || joining}>{joining ? '参加しています…' : '参加する'}</button>
        </form>
      </section>
    </main>
  );
}
