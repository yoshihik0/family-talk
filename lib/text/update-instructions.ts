export const UPDATE_INSTRUCTIONS_PROMPT =
  'family-talkの更新を確認してください。前回セットアップしたディレクトリで、git fetch origin してから git log HEAD..origin/main --oneline で新しいコミットがあるか確認し、あれば wrangler.toml の name と database_id を退避しつつ git pull → npm install → npm run deploy を実行してください。手順の詳細は https://github.com/yoshihik0/family-talk#アップデートする を参照してください。';

// 端末を失った管理者(=Cloudflareの管理権限を持っている人)に渡してもらう指示文。
// 復旧に本当に要るのはCloudflareアカウントとサーバー名だけなので、画面が知っている
// URLからその2つを埋めて、セットアップしたディレクトリが残っていなくても辿れるようにする。
// Cloudflareのサーバー名は、URLのホスト名の先頭ラベル(例: omiya.example.workers.dev -> omiya)。
// ポート付きのURLでも壊れないように、文字列ではなくURLとして解釈する。
export function serverNameFromUrl(appUrl: string) {
  try { return new URL(appUrl).hostname.split('.')[0]; } catch { return appUrl; }
}

export function recoveryInstructionsPrompt(appUrl: string) {
  const workerName = serverNameFromUrl(appUrl);
  return [
    'family-talkに入れなくなりました。端末のログイン情報が消えただけで、サーバー側のアカウントと会話はそのまま残っています。',
    '復旧に必要なのは、このデプロイのCloudflareアカウントにアクセスできることだけです。',
    `アプリのURL: ${appUrl}`,
    `Cloudflareのサーバー名(Worker名/D1データベース名): ${workerName}`,
    'セットアップしたディレクトリが残っていれば、そこで次を実行してください。',
    `npm run recover -- --url ${appUrl} --database ${workerName}`,
    'ディレクトリが残っていない場合は、リポジトリを新しく git clone してから同じコマンドを実行してください(wrangler.tomlの書き換えは不要です)。',
    '手順の詳細は https://github.com/yoshihik0/family-talk#管理者が端末を失ったとき にあります。',
    '実行すると端末リンクのURLが表示されるので、それを教えてください。',
    'このリンクは1回しか使えません。動作確認のために開かないでください(開いた時点で無効になり、本人が使えなくなります)。',
  ].join('\n');
}
