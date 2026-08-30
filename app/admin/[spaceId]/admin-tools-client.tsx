'use client';

import { useEffect, useState } from 'react';
import { UPDATE_INSTRUCTIONS_PROMPT } from '@/lib/text/update-instructions';
import { PROFILE_COLORS } from '@/lib/theme/colors';

export default function AdminToolsClient({ spaceId }: { spaceId: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'forbidden'>('loading');
  const [downloading, setDownloading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('');
  const [groupColor, setGroupColor] = useState(PROFILE_COLORS[0]);
  const [savingGroup, setSavingGroup] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/manage/overview?spaceId=${encodeURIComponent(spaceId)}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) { setStatus('forbidden'); return null; }
        return response.json() as Promise<{ space: { name: string; icon: string; color: string }; members: Array<{ id: string }> }>;
      })
      .then((data) => {
        if (!data) return;
        setGroupName(data.space.name);
        setGroupIcon(data.space.icon);
        setGroupColor(data.space.color);
        setStatus('ready');
      })
      .catch(() => setStatus('forbidden'));
  }, [spaceId]);

  async function saveGroupProfile() {
    const name = groupName.trim();
    if (!name) {
      window.alert('グループの名前を入力してください。');
      return;
    }
    setSavingGroup(true);
    const response = await fetch('/api/v1/manage/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, name, icon: groupIcon, color: groupColor }) }).catch(() => null);
    setSavingGroup(false);
    if (!response?.ok) {
      window.alert('グループ名は40文字以内、アイコンは1つの文字で設定してください。');
      return;
    }
    setGroupName(name);
  }

  async function downloadLog() {
    setDownloading(true);
    const response = await fetch(`/api/v1/admin/export?spaceId=${encodeURIComponent(spaceId)}`, { cache: 'no-store' }).catch(() => null);
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
    await navigator.clipboard.writeText(UPDATE_INSTRUCTIONS_PROMPT).catch(() => undefined);
    setPromptCopied(true);
  }

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <p className="admin-eyebrow">管理ツール</p>
        <h1>{groupIcon && <span className="header-icon" aria-hidden="true">{groupIcon}</span>}{groupName || '家族のおしゃべり'}</h1>

        {status === 'loading' && <p className="admin-state">確認しています…</p>}
        {status === 'forbidden' && <p className="admin-state" role="alert">この操作には管理者権限が必要です。会話画面からログインし直してください。</p>}

        {status === 'ready' && (
          <div className="admin-tools">
            <div className="admin-tool-row admin-tool-row-column">
              <div className="personal-settings-main">
                <div className="settings-heading">
                  <div className="setup-icon-preview" aria-hidden="true" style={{ background: groupColor }}>{groupIcon || groupName.slice(0, 1)}</div>
                  <strong>グループの設定</strong>
                </div>
                <div className="settings-row">
                  <label>グループの名前<input className="wide-input" value={groupName} maxLength={40} onChange={(event) => setGroupName(event.target.value)} /></label>
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
            <div className="admin-tool-row">
              <div>
                <strong>会話ログをダウンロード</strong>
                <small>削除済みの発言も含めて、全件をCSVファイルで保存します。</small>
              </div>
              <button type="button" onClick={downloadLog} disabled={downloading}>{downloading ? '準備中…' : 'ダウンロード'}</button>
            </div>
            <div className="admin-tool-row admin-tool-row-column">
              <div>
                <strong>AIを使ってアップデート</strong>
                <small>AIエージェントに、この文章をそのまま渡してください。インストールしたときのディレクトリで作業してもらう必要があります。</small>
                <p className="admin-prompt-text">{UPDATE_INSTRUCTIONS_PROMPT}</p>
              </div>
              <button type="button" onClick={copyPrompt}>{promptCopied ? 'コピーしました' : 'コピー'}</button>
            </div>
          </div>
        )}

        <footer className="admin-footer">Produced by <a href="https://yoshihiko.com" target="_blank" rel="noreferrer">yoshihiko.com</a></footer>
      </section>
    </main>
  );
}
