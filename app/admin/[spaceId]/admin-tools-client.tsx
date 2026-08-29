'use client';

import { useEffect, useState } from 'react';
import { UPDATE_INSTRUCTIONS_PROMPT } from '@/lib/text/update-instructions';

export default function AdminToolsClient({ spaceId }: { spaceId: string }) {
  const [spaceName, setSpaceName] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'forbidden'>('loading');
  const [downloading, setDownloading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/manage/overview?spaceId=${encodeURIComponent(spaceId)}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) { setStatus('forbidden'); return null; }
        return response.json() as Promise<{ members: Array<{ id: string }> }>;
      })
      .then(() => setStatus('ready'))
      .catch(() => setStatus('forbidden'));
    fetch(`/api/v1/app-manifest?spaceId=${encodeURIComponent(spaceId)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ name: string }> : null)
      .then((data) => { if (data) setSpaceName(data.name); })
      .catch(() => undefined);
  }, [spaceId]);

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
        <h1>{spaceName || '家族のおしゃべり'}</h1>

        {status === 'loading' && <p className="admin-state">確認しています…</p>}
        {status === 'forbidden' && <p className="admin-state" role="alert">この操作には管理者権限が必要です。会話画面からログインし直してください。</p>}

        {status === 'ready' && (
          <div className="admin-tools">
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
