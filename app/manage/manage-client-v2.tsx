'use client';

import { FormEvent, useEffect, useState } from 'react';

type Member = { id: string; displayName: string; role: string; metadata?: { avatarLabel?: string; avatarColor?: string } };
type Policy = { allowText: boolean; allowImage: boolean; allowAudio: boolean };
type Space = { id: string; name: string; type: string; settings: { policy?: Partial<Policy> } };
type Overview = { spaces: Space[]; space: Space; me: { id: string; displayName: string; role: string }; members: Member[] };
const colors = ['#3f7d61', '#b45f45', '#426f9a', '#8b5d9b', '#c48735', '#5e7185'];
const roleLabels: Record<string, string> = { owner: '所有者', host: '管理者', member: 'メンバー', viewer: '閲覧のみ' };

async function loadOverview(spaceId?: string) {
  const query = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : '';
  let response = await fetch(`/api/v1/manage/overview${query}`, { cache: 'no-store' });
  if (response.status === 401) {
    const bootstrap = await fetch('/api/v1/dev/bootstrap', { method: 'POST' });
    if (bootstrap.ok) response = await fetch(`/api/v1/manage/overview${query}`, { cache: 'no-store' });
  }
  if (!response.ok) throw new Error('overview_unavailable');
  return response.json() as Promise<Overview>;
}

export default function ManageClientV2() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState<Policy>({ allowText: true, allowImage: false, allowAudio: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [error, setError] = useState(false);

  function applyOverview(data: Overview) {
    setOverview(data); setName(data.space.name);
    setPolicy({ allowText: true, allowImage: Boolean(data.space.settings.policy?.allowImage), allowAudio: data.space.settings.policy?.allowAudio !== false });
  }
  useEffect(() => { loadOverview().then(applyOverview).catch(() => setError(true)); }, []);

  async function switchSpace(spaceId: string) { try { applyOverview(await loadOverview(spaceId)); setInviteUrl(''); setSaved(false); } catch { setError(true); } }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setSaved(false);
    const response = await fetch('/api/v1/manage/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId: overview?.space.id, name, policy }) }).catch(() => null);
    if (!response?.ok) { setError(true); setSaving(false); return; }
    applyOverview(await loadOverview(overview?.space.id)); setSaving(false); setSaved(true);
  }
  async function saveMember(member: Member, avatarLabel: string, avatarColor: string) {
    if (!overview) return;
    const response = await fetch('/api/v1/manage/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId: overview.space.id, memberId: member.id, avatarLabel, avatarColor }) });
    if (response.ok) applyOverview(await loadOverview(overview.space.id)); else setError(true);
  }
  async function createInvite() {
    if (!overview) return;
    const response = await fetch('/api/v1/manage/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId: overview.space.id }) }).catch(() => null);
    if (!response?.ok) { setError(true); return; }
    const result = await response.json() as { inviteUrl: string; expiresAt: string }; setInviteUrl(result.inviteUrl); setInviteExpiresAt(result.expiresAt);
  }
  if (error) return <main className="manage-state"><h1>管理画面を開けませんでした</h1><button onClick={() => window.location.reload()}>もう一度</button></main>;
  if (!overview) return <main className="manage-state" role="status">管理画面を準備しています…</main>;
  return <main className="manage-shell">
    <header className="manage-topbar"><div><p>家族のおしゃべり</p><h1>管理</h1></div><a href="/">会話画面を開く</a></header>
    <nav className="group-tabs" aria-label="管理するグループ">
      {overview.spaces.map((space) => <button key={space.id} type="button" className={space.id === overview.space.id ? 'is-current' : ''} onClick={() => switchSpace(space.id)}>{space.name}</button>)}
    </nav>
    <section className="manage-main">
      <div className="manage-heading"><div><p>グループ設定</p><input className="space-title-input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} aria-label="グループ名" /></div><span className="role-badge">{roleLabels[overview.me.role] ?? overview.me.role}</span></div>
      <form className="manage-card settings-card" onSubmit={saveSettings}><div className="card-heading"><div><h3>グループの設定</h3><p>このグループで使える機能を選びます。</p></div></div><fieldset className="feature-fieldset"><legend>使える機能</legend><label><input type="checkbox" checked disabled />文字を送る</label><label><input type="checkbox" checked={policy.allowAudio} onChange={(event) => setPolicy({ ...policy, allowAudio: event.target.checked })} />話して入力</label><label><input type="checkbox" checked={policy.allowImage} onChange={(event) => setPolicy({ ...policy, allowImage: event.target.checked })} />画像を送る</label></fieldset><div className="form-actions"><span role="status">{saved ? '保存しました' : ''}</span><button type="submit" disabled={saving || !name.trim()}>{saving ? '保存中…' : '変更を保存'}</button></div></form>
      <section className="manage-card"><div className="card-heading"><div><h3>家族を招待</h3><p>招待リンクは1人につき1回だけ使え、7日後に期限切れになります。</p></div><button className="primary-button" type="button" onClick={createInvite}>招待リンクを作る</button></div>{inviteUrl && <div className="invite-result"><div><strong>新しい招待リンク</strong><p>{inviteUrl}</p><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inviteExpiresAt))}まで</small></div><button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl)}>コピー</button></div>}</section>
      <section className="manage-card"><div className="card-heading"><div><h3>家族の表示</h3><p>会話画面で表示する色と一文字アイコンを設定します。</p></div></div><div className="member-list">{overview.members.map((member) => <MemberEditor key={member.id} member={member} onSave={saveMember} />)}</div></section>
    </section>
  </main>;
}

function MemberEditor({ member, onSave }: { member: Member; onSave: (member: Member, label: string, color: string) => Promise<void> }) {
  const [label, setLabel] = useState(member.metadata?.avatarLabel ?? member.displayName.slice(0, 1));
  const [color, setColor] = useState(member.metadata?.avatarColor ?? colors[0]);
  return <div className="member-row"><span className="member-avatar" style={{ background: color }}>{label}</span><div className="member-info"><strong>{member.displayName}</strong><small>{roleLabels[member.role] ?? member.role}</small></div><div className="member-editor"><label>一文字<input value={label} maxLength={1} onChange={(event) => setLabel(event.target.value)} /></label><div className="color-options" aria-label={`${member.displayName}の色`}>{colors.map((option) => <button key={option} type="button" aria-label={option} className={option === color ? 'is-selected' : ''} style={{ background: option }} onClick={() => setColor(option)} />)}</div><button className="member-save" type="button" onClick={() => onSave(member, label, color)}>保存</button></div></div>;
}
