'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { UPDATE_INSTRUCTIONS_PROMPT } from '@/lib/text/update-instructions';
import { copyText } from '@/lib/browser/compat';
import { PROFILE_COLORS } from '@/lib/theme/colors';
import { compareVersions } from '@/lib/text/version';

const MULTI_INVITE_MAX_USES = 50;

type UpdateNotice = { maxVersion: string; message: string };
type Member = {
  id: string;
  displayName: string;
  role: string;
  avatarLabel?: string;
  avatarColor?: string;
  voiceDuration?: number;
  canInvite?: boolean;
};

export default function AdminToolsClient() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'forbidden'>('loading');
  const [downloading, setDownloading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('');
  const [groupColor, setGroupColor] = useState(PROFILE_COLORS[0]);
  const [savingGroup, setSavingGroup] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [viewerId, setViewerId] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColor, setEditColor] = useState(PROFILE_COLORS[0]);
  const [editDuration, setEditDuration] = useState(30);
  const [editCanInvite, setEditCanInvite] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deviceUrl, setDeviceUrl] = useState('');
  const [deviceExpiresAt, setDeviceExpiresAt] = useState('');
  const [deviceQr, setDeviceQr] = useState('');
  const [creatingDeviceLink, setCreatingDeviceLink] = useState(false);

  const [multiInviteUrl, setMultiInviteUrl] = useState('');
  const [multiInviteExpiresAt, setMultiInviteExpiresAt] = useState('');
  const [multiInviteQr, setMultiInviteQr] = useState('');
  const [multiInviteDays, setMultiInviteDays] = useState(1);
  const [creatingMultiInvite, setCreatingMultiInvite] = useState(false);

  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [notices, setNotices] = useState<UpdateNotice[]>([]);

  function loadOverview() {
    return fetch('/api/v1/manage/overview', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) { setStatus('forbidden'); return null; }
        return response.json() as Promise<{ viewerRole: string; viewerId: string; space: { name: string; icon: string; color: string }; members: Member[] }>;
      })
      .then((data) => {
        if (!data) return;
        if (data.viewerRole !== 'owner' && data.viewerRole !== 'host') { setStatus('forbidden'); return; }
        setGroupName(data.space.name);
        setGroupIcon(data.space.icon);
        setGroupColor(data.space.color);
        setMembers(data.members);
        setViewerId(data.viewerId);
        setStatus('ready');
      })
      .catch(() => setStatus('forbidden'));
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (deviceUrl) QRCode.toDataURL(deviceUrl, { margin: 1, width: 180 }).then(setDeviceQr).catch(() => setDeviceQr(''));
    else setDeviceQr('');
  }, [deviceUrl]);

  useEffect(() => {
    if (multiInviteUrl) QRCode.toDataURL(multiInviteUrl, { margin: 1, width: 180 }).then(setMultiInviteQr).catch(() => setMultiInviteQr(''));
    else setMultiInviteQr('');
  }, [multiInviteUrl]);

  // ウェブページの読み込みだけで済む、副作用のない確認なので自動で行う。
  useEffect(() => {
    fetch('/api/v1/health', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ version: string }> : null)
      .then((data) => { if (data) setCurrentVersion(data.version); })
      .catch(() => undefined);
    fetch('https://raw.githubusercontent.com/yoshihik0/family-talk/main/package.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ version?: unknown }> : null)
      .then((data) => { if (typeof data?.version === 'string') setLatestVersion(data.version); })
      .catch(() => undefined);
    fetch('https://raw.githubusercontent.com/yoshihik0/family-talk/main/public/update-notices.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<UpdateNotice[]> : null)
      .then((data) => setNotices(Array.isArray(data) ? data : []))
      .catch(() => undefined);
  }, []);

  // 現在のバージョンが対象範囲(maxVersion以下)に入る通知のうち、もっとも新しいものを表示する。
  const applicableNotice = currentVersion
    ? notices
        .filter((item) => compareVersions(currentVersion, item.maxVersion) <= 0)
        .sort((a, b) => compareVersions(b.maxVersion, a.maxVersion))[0]
    : undefined;

  async function saveGroupProfile() {
    const name = groupName.trim();
    if (!name) {
      window.alert('グループの名前を入力してください。');
      return;
    }
    setSavingGroup(true);
    const response = await fetch('/api/v1/manage/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, icon: groupIcon, color: groupColor }) }).catch(() => null);
    setSavingGroup(false);
    if (!response?.ok) {
      window.alert('グループ名は40文字以内、アイコンは1つの文字で設定してください。');
      return;
    }
    setGroupName(name);
  }

  function startEditMember(member: Member) {
    setConfirmDeleteId(null);
    setEditingMemberId(member.id);
    setEditName(member.displayName);
    setEditIcon(member.avatarLabel ?? member.displayName.slice(0, 1));
    setEditColor(member.avatarColor ?? PROFILE_COLORS[0]);
    setEditDuration(member.voiceDuration === 15 || member.voiceDuration === 60 ? member.voiceDuration : 30);
    setEditCanInvite(member.canInvite === true);
    setDeviceUrl('');
  }

  async function createDeviceLinkFor(memberId: string) {
    setCreatingDeviceLink(true);
    const response = await fetch('/api/v1/device-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) }).catch(() => null);
    setCreatingDeviceLink(false);
    if (!response?.ok) {
      window.alert('接続リンクを作れませんでした。');
      return;
    }
    const result = await response.json() as { deviceUrl: string; expiresAt: string };
    setDeviceUrl(result.deviceUrl);
    setDeviceExpiresAt(result.expiresAt);
  }

  async function createMultiInvite() {
    setCreatingMultiInvite(true);
    const response = await fetch('/api/v1/manage/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiUse: true, expiresInDays: multiInviteDays }),
    }).catch(() => null);
    setCreatingMultiInvite(false);
    if (!response?.ok) {
      window.alert('招待リンクを作れませんでした。');
      return;
    }
    const result = await response.json() as { inviteUrl: string; expiresAt: string };
    setMultiInviteUrl(result.inviteUrl);
    setMultiInviteExpiresAt(result.expiresAt);
  }

  async function saveMemberProfile(memberId: string) {
    const name = editName.trim();
    if (!name) {
      window.alert('名前を入力してください。');
      return;
    }
    setSavingMemberId(memberId);
    const response = await fetch('/api/v1/manage/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, displayName: name, avatarLabel: editIcon, avatarColor: editColor, voiceDuration: editDuration, canInvite: editCanInvite }),
    }).catch(() => null);
    setSavingMemberId(null);
    if (!response?.ok) {
      window.alert('名前は40文字以内、アイコンは1つの文字で設定してください。');
      return;
    }
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, displayName: name, avatarLabel: editIcon, avatarColor: editColor, voiceDuration: editDuration, canInvite: editCanInvite } : member));
    setEditingMemberId(null);
  }

  async function deleteMember(memberId: string) {
    setConfirmDeleteId(null);
    const params = new URLSearchParams({ memberId });
    const response = await fetch(`/api/v1/manage/members?${params.toString()}`, { method: 'DELETE' }).catch(() => null);
    if (!response?.ok) {
      window.alert('削除できませんでした。');
      return;
    }
    setMembers((current) => current.filter((member) => member.id !== memberId));
  }

  async function downloadLog() {
    setDownloading(true);
    const response = await fetch('/api/v1/admin/export', { cache: 'no-store' }).catch(() => null);
    setDownloading(false);
    if (!response?.ok) {
      window.alert('ダウンロードできませんでした。');
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filenameMatch?.[1] ?? `family-talk-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyPrompt() {
    await copyText(UPDATE_INSTRUCTIONS_PROMPT);
    setPromptCopied(true);
  }

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <p className="admin-eyebrow">家族のおしゃべり：管理ツール</p>
        <h1>{groupIcon && <span className="header-icon" aria-hidden="true">{groupIcon}</span>}{groupName || '家族のおしゃべり'}</h1>

        {status === 'loading' && <p className="admin-state">確認しています…</p>}
        {status === 'forbidden' && <p className="admin-state" role="alert">この操作には管理者権限が必要です。グループの管理者に依頼してください。</p>}

        {status === 'ready' && (
          <div className="admin-tools">
            <div className="admin-tool-row admin-tool-row-column">
              <div className="personal-settings-main">
                <div className="settings-heading">
                  <div className="setup-icon-preview" aria-hidden="true" style={{ background: groupColor }}>{groupIcon || groupName.slice(0, 1)}</div>
                  <strong>グループの設定</strong>
                </div>
                <div className="settings-row">
                  <label>名前<input className="wide-input" value={groupName} maxLength={40} onChange={(event) => setGroupName(event.target.value)} /></label>
                </div>
                <div className="settings-row">
                  <label>アイコン<input value={groupIcon} maxLength={8} onChange={(event) => setGroupIcon(event.target.value)} /></label>
                  <div className="personal-color-options" aria-label="グループの色">
                    {PROFILE_COLORS.map((color) => <button key={color} type="button" aria-label={color} className={color === groupColor ? 'is-selected' : ''} style={{ background: color }} onClick={() => setGroupColor(color)} />)}
                    <span className="color-picker-wrap"><input type="color" aria-label="色を自由に選ぶ" value={groupColor} onChange={(event) => setGroupColor(event.target.value)} /></span>
                  </div>
                </div>
                <small className="settings-note">ホーム画面のアイコンとアプリ名は、アプリをいったんアンインストールして、インストールしなおさないと更新されないことが多いです。</small>
                <div className="settings-row">
                  <button className="personal-save" type="button" onClick={saveGroupProfile} disabled={savingGroup}>{savingGroup ? '保存中…' : '保存'}</button>
                </div>
              </div>
            </div>

            <div className="admin-tool-row admin-tool-row-column">
              <strong>メンバー</strong>
              <ul className="admin-member-list">
                {members.map((member) => (
                  <li key={member.id}>
                    <div className="admin-member-row">
                      <span className="message-avatar" style={{ background: member.avatarColor ?? '#3f7d61' }}>{member.avatarLabel ?? member.displayName.slice(0, 1)}</span>
                      <span className="member-name">{member.displayName}{member.role === 'owner' && '（管理者）'}</span>
                      {member.id !== viewerId && <button type="button" onClick={() => (editingMemberId === member.id ? setEditingMemberId(null) : startEditMember(member))}>{editingMemberId === member.id ? '閉じる' : '編集'}</button>}
                      {member.role !== 'owner' && <button type="button" onClick={() => { if (confirmDeleteId === member.id) { setConfirmDeleteId(null); } else { setConfirmDeleteId(member.id); setEditingMemberId(null); } }}>{confirmDeleteId === member.id ? '閉じる' : '削除'}</button>}
                    </div>
                    {editingMemberId === member.id && (
                      <div className="personal-settings-main admin-member-edit">
                        <div className="settings-row">
                          <label>名前<input className="wide-input" value={editName} maxLength={40} onChange={(event) => setEditName(event.target.value)} /></label>
                        </div>
                        <div className="settings-row">
                          <label>アイコン<input value={editIcon} maxLength={20} onChange={(event) => setEditIcon(event.target.value)} /></label>
                          <div className="personal-color-options" aria-label="メンバーの色">
                            {PROFILE_COLORS.map((color) => <button key={color} type="button" aria-label={color} className={color === editColor ? 'is-selected' : ''} style={{ background: color }} onClick={() => setEditColor(color)} />)}
                            <span className="color-picker-wrap"><input type="color" aria-label="色を自由に選ぶ" value={editColor} onChange={(event) => setEditColor(event.target.value)} /></span>
                          </div>
                        </div>
                        <div className="settings-row">
                          <label>話す時間<select value={editDuration} onChange={(event) => setEditDuration(Number(event.target.value))}><option value={15}>15秒</option><option value={30}>30秒</option><option value={60}>60秒</option></select></label>
                        </div>
                        <div className="settings-row">
                          <label>ユーザー追加<select className="wide-input" value={editCanInvite ? '1' : '0'} onChange={(event) => setEditCanInvite(event.target.value === '1')}><option value="0">不許可</option><option value="1">許可</option></select></label>
                          <button className="personal-save" type="button" onClick={() => saveMemberProfile(member.id)} disabled={savingMemberId === member.id}>{savingMemberId === member.id ? '保存中…' : '保存'}</button>
                        </div>
                        <hr className="settings-divider" />
                        <div className="settings-row">
                          <button className="device-link-toggle" type="button" onClick={() => (deviceUrl ? setDeviceUrl('') : createDeviceLinkFor(member.id))} disabled={creatingDeviceLink}>{deviceUrl ? '閉じる' : '接続リンク'}</button>
                        </div>
                        {deviceUrl && <div className="expandable-panel">
                          <small>この情報を{member.displayName}さんに伝えてください。{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(deviceExpiresAt))}まで有効です。</small>
                          <p>{deviceUrl}</p>
                          <button type="button" onClick={() => copyText(deviceUrl)}>リンクをコピー</button>
                          {deviceQr && <img src={deviceQr} alt="別の端末をつなぐQRコード" />}
                        </div>}
                      </div>
                    )}
                    {confirmDeleteId === member.id && (
                      <div className="personal-settings-main admin-member-edit">
                        <div className="settings-row settings-row-right">
                          <span className="member-confirm">
                            <button type="button" className="confirm-danger" onClick={() => deleteMember(member.id)}>本当に削除</button>
                            <button type="button" className="confirm-safe" onClick={() => setConfirmDeleteId(null)}>やめる</button>
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="admin-tool-row admin-tool-row-column">
              <strong>友人・グループを招待</strong>
              <small>期限内に複数のユーザーが参加できる、共有用の招待リンクです(最大{MULTI_INVITE_MAX_USES}人まで)。</small>
              <div className="personal-settings-main">
                <div className="settings-row">
                  <label>有効期限<select value={multiInviteDays} onChange={(event) => setMultiInviteDays(Number(event.target.value))}><option value={1}>1日</option><option value={3}>3日</option><option value={7}>7日</option></select></label>
                  <button className="personal-save" type="button" onClick={createMultiInvite} disabled={creatingMultiInvite}>{creatingMultiInvite ? '発行中…' : '発行'}</button>
                </div>
              </div>
              {multiInviteUrl && <div className="expandable-panel">
                <small>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(multiInviteExpiresAt))}まで有効です。</small>
                <p>{multiInviteUrl}</p>
                <button type="button" onClick={() => copyText(multiInviteUrl)}>リンクをコピー</button>
                {multiInviteQr && <img src={multiInviteQr} alt="招待QRコード" />}
              </div>}
            </div>

            <div className="admin-tool-row admin-tool-row-column">
              <strong>アップデート</strong>
              <div className="version-summary">
                <div>現在のバージョン: {currentVersion || '確認中…'}</div>
                <div>最新のバージョン: {latestVersion || '確認中…'}{currentVersion && latestVersion && currentVersion === latestVersion && <span className="update-status"> (最新版です)</span>}</div>
              </div>
              {applicableNotice && <p className="update-notice" role="alert">{applicableNotice.message}</p>}
              <small>AIエージェントに、この文章をそのまま渡してください。インストールしたときのディレクトリで作業してもらう必要があります。</small>
              <p className="admin-prompt-text">{UPDATE_INSTRUCTIONS_PROMPT}</p>
              <button type="button" onClick={copyPrompt}>{promptCopied ? 'コピーしました' : 'コピー'}</button>
            </div>
            <div className="admin-tool-row">
              <div>
                <strong>会話ログをダウンロード</strong>
                <small>削除済みの発言も含めて、全件をCSVファイルで保存します。</small>
              </div>
              <button type="button" onClick={downloadLog} disabled={downloading}>{downloading ? '準備中…' : 'ダウンロード'}</button>
            </div>
          </div>
        )}

        <footer className="admin-footer">Produced by <a href="https://yoshihiko.com" target="_blank" rel="noreferrer">yoshihiko.com</a></footer>
      </section>
    </main>
  );
}
