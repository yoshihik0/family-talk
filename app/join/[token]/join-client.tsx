'use client';

import { FormEvent, useState } from 'react';

export default function JoinClient({ token }: { token: string }) {
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(false);

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
    window.location.href = '/';
  }

  return (
    <main className="join-shell">
      <section className="join-card">
        <div className="join-mark" aria-hidden="true">家</div>
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
