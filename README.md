# Personal Data Hub

利用者自身のCloudflare環境で運用する、汎用的な個人データ基盤と、その最初のアプリ「家族のおしゃべり」です。

## 自分のCloudflareに設置する

Cloudflareのアカウントさえあれば、CLIやGitの知識なしでボタンから設置できます。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yoshihik0/family-talk)

1. 上のボタンを押す
2. Cloudflareにログイン(アカウントが無ければ作成)
3. Worker名・データベース名を確認して「Deploy」(基本はそのままでよい)
4. 数分待つと、`https://<名前>.workers.dev` のURLが発行される
5. そのURLをスマートフォンで開くと「はじめまして」画面が出るので、名前とグループ名を入力
6. ブラウザの「ホーム画面に追加」でアプリ化して完了

シークレットの入力や事前設定は不要です。Web Push通知だけは任意で、使う場合は後から `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` をCloudflareのWorker設定でシークレットとして追加してください([web-push generate-vapid-keys](https://www.npmjs.com/package/web-push)で生成できます)。

## 現在の実装

- 家族のおしゃべりのモバイルファースト画面
- SpaceごとのCSSテーマ・アプリアイコン(Web App Manifest)
- D1向け汎用データモデル
- 任意JSON Recordの作成・取得リポジトリ
- Spaceに固定された端末セッション
- D1からの会話取得と投稿保存
- シークレット不要の初回セットアップ(1デプロイ1Spaceのみ・一度きり)
- 音声入力と読み上げ
- 会話画面に統合された設定(自分の設定・グループ設定・メンバー管理・招待QR・別端末の追加)
- 1回限りの招待リンク発行と参加画面
- 期限付きDevice LinkによるPWAの別端末追加
- Web Push通知
- 基盤ヘルスチェックAPI
- Drizzleマイグレーション

設計の詳細は[docs/architecture.md](docs/architecture.md)、プロダクト全体の構想は[idea.md](idea.md)を参照してください。

## ローカル起動

```bash
npm install
npm run dev
```

確認用URLは`http://localhost:3417/`です。ポート3000は他のローカルアプリとの競合を避けるため使用しません。

## 検証

```bash
npm run db:generate
npm run build
```

## CLIでデプロイする場合

ボタンを使わず、自分でWranglerからデプロイすることもできます。

```bash
npx wrangler d1 create personal-data-hub  # 初回のみ。表示されたdatabase_idをwrangler.tomlに反映
npm run deploy                            # ビルド → マイグレーション適用 → デプロイ
```

## 次の実装

エクスポート/バックアップを実装します。認証を通さない汎用書き込みAPIは公開しません。

画像添付は意図的に実装しません。文字と音声だけに絞ることで、迷う要素そのものを無くしています。
