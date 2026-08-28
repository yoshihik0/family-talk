'use client';

import { FormEvent, useEffect, useState } from 'react';

type Theme = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
};

type Policy = {
  allowText: boolean;
  allowImage: boolean;
  allowAudio: boolean;
};

type Overview = {
  space: {
    id: string;
    name: string;
    type: string;
    settings: { theme?: Partial<Theme>; policy?: Partial<Policy> };
  };
  me: { id: string; displayName: string; role: string };
  members: Array<{ id: string; displayName: string; role: string; createdAt: string }>;
};

const themes: Array<{ name: string; colors: Theme }> = [
  { name: '森', colors: { primaryColor: '#2f6b4f', accentColor: '#e6f1ea', backgroundColor: '#f4f8f5' } },
  { name: '空', colors: { primaryColor: '#32658a', accentColor: '#e4f0f7', backgroundColor: '#f3f8fb' } },
  { name: 'みかん', colors: { primaryColor: '#a65322', accentColor: '#f8e8dc', backgroundColor: '#fcf6f1' } },
  { name: 'すみれ', colors: { primaryColor: '#69528b', accentColor: '#eee8f5', backgroundColor: '#f8f5fb' } },
];

const roleLabels: Record<string, string> = {
  owner: '所有者',
  host: '管理者',
  member: 'メンバー',
  viewer: '閲覧のみ',
};

async function loadOverview() {
  let response = await fetch('/api/v1/manage/overview', { cache: 'no-store' });
  if (response.status === 401) {
    const bootstrap = await fetch('/api/v1/dev/bootstrap', { method: 'POST' });
    if (bootstrap.ok) response = await fetch('/api/v1/manage/overview', { cache: 'no-store' });
  }
  if (!response.ok) throw new Error('overview_unavailable');
  return response.json() as Promise<Overview>;
}

export default function ManageClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<Theme>(themes[0].colors);
  const [policy, setPolicy] = useState<Policy>({ allowText: true, allowImage: false, allowAudio: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    loadOverview().then((data) => {
      setOverview(data);
      setName(data.space.name);
      setTheme({
        primaryColor: data.space.settings.theme?.primaryColor ?? themes[0].colors.primaryColor,
        accentColor: data.space.settings.theme?.accentColor ?? themes[0].colors.accentColor,
        backgroundColor: data.space.settings.theme?.backgroundColor ?? themes[0].colors.backgroundColor,
      });
      setPolicy({
        allowText: true,
        allowImage: Boolean(data.space.settings.policy?.allowImage),
        allowAudio: data.space.settings.policy?.allowAudio !== false,
      });
    }).catch(() => setError(true));
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    const response = await fetch('/api/v1/manage/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, theme, policy }),
    }).catch(() => null);

    if (!response?.ok) {
      setError(true);
      setSaving(false);
      return;
    }

    const result = await response.json() as { space: { name: string; settings: Overview['space']['settings'] } };
    setOverview((current) => current ? { ...current, space: { ...current.space, ...result.space } } : current);
    setSaving(false);
    setSaved(true);
  }

  async function createInvite() {
    const response = await fetch('/api/v1/manage/invites', { method: 'POST' }).catch(() => null);
    if (!response?.ok) {
      setError(true);
      return;
    }
    const result = await response.json() as { inviteUrl: string; expiresAt: string };
    setInviteUrl(result.inviteUrl);
    setInviteExpiresAt(result.expiresAt);
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
  }

  if (error) {
    return <main className="manage-state"><h1>管理画面を開けませんでした</h1><button onClick={() => window.location.reload()}>もう一度</button></main>;
  }

  if (!overview) return <main className="manage-state" role="status">管理画面を準備しています…</main>;

  return (
    <main className="manage-shell" style={{ '--manage-primary': theme.primaryColor, '--manage-soft': theme.accentColor } as React.CSSProperties}>
      <header className="manage-topbar">
        <div>
          <p>家族のおしゃべり</p>
          <h1>管理</h1>
        </div>
        <a href="/">会話画面を開く</a>
      </header>

      <div className="manage-layout">
        <aside className="manage-sidebar">
          <p className="manage-nav-label">家族グループ</p>
          <button className="space-nav-item is-current" type="button">
            <span style={{ background: theme.primaryColor }} />
            <span><strong>{overview.space.name}</strong><small>{overview.members.length}人</small></span>
          </button>
          <p className="manage-sidebar-note">Personal Data Hub全体の設定は、別の管理ツールで扱います。</p>
        </aside>

        <section className="manage-main">
          <div className="manage-heading">
            <div><p>グループ設定</p><h2>{overview.space.name}</h2></div>
            <span className="role-badge">{roleLabels[overview.me.role] ?? overview.me.role}</span>
          </div>

          <form className="manage-card settings-card" onSubmit={saveSettings}>
            <div className="card-heading"><div><h3>名前と見た目</h3><p>家族が迷わないよう、グループごとに色を分けます。</p></div></div>
            <label className="field-label" htmlFor="space-name">表示する名前</label>
            <input id="space-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />

            <fieldset className="theme-fieldset">
              <legend>テーマ</legend>
              <div className="theme-options">
                {themes.map((option) => {
                  const selected = option.colors.primaryColor === theme.primaryColor;
                  return (
                    <button key={option.name} type="button" className={selected ? 'is-selected' : ''} onClick={() => setTheme(option.colors)} aria-pressed={selected}>
                      <span className="theme-swatch" style={{ background: option.colors.primaryColor }} />
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="feature-fieldset">
              <legend>使える機能</legend>
              <label><input type="checkbox" checked disabled />文字を送る</label>
              <label><input type="checkbox" checked={policy.allowAudio} onChange={(event) => setPolicy({ ...policy, allowAudio: event.target.checked })} />話して入力</label>
              <label><input type="checkbox" checked={policy.allowImage} onChange={(event) => setPolicy({ ...policy, allowImage: event.target.checked })} />画像を送る</label>
            </fieldset>

            <div className="form-actions"><span role="status">{saved ? '保存しました' : ''}</span><button type="submit" disabled={saving || !name.trim()}>{saving ? '保存中…' : '変更を保存'}</button></div>
          </form>

          <section className="manage-card">
            <div className="card-heading"><div><h3>家族を招待</h3><p>招待リンクは1人につき1回だけ使え、7日後に期限切れになります。</p></div><button className="primary-button" type="button" onClick={createInvite}>招待リンクを作る</button></div>
            {inviteUrl && (
              <div className="invite-result">
                <div><strong>新しい招待リンク</strong><p>{inviteUrl}</p><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inviteExpiresAt))}まで</small></div>
                <button type="button" onClick={copyInvite}>コピー</button>
              </div>
            )}
          </section>

          <section className="manage-card">
            <div className="card-heading"><div><h3>参加している家族</h3><p>{overview.members.length}人がこのおしゃべりに参加しています。</p></div></div>
            <div className="member-list">
              {overview.members.map((member) => (
                <div className="member-row" key={member.id}>
                  <span className="member-avatar">{member.displayName.slice(0, 1)}</span>
                  <div><strong>{member.displayName}</strong><small>{roleLabels[member.role] ?? member.role}</small></div>
                  <span className="member-status">参加中</span>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
