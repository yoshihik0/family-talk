# Personal Data Hub

利用者自身のCloudflare環境で運用する、汎用的な個人データ基盤と、その最初のアプリ「家族のおしゃべり」です。

## 現在の実装

- 家族のおしゃべりのモバイルファースト画面
- SpaceごとのCSSテーマを想定したデザイントークン
- D1向け汎用データモデル
- 任意JSON Recordの作成・取得リポジトリ
- Spaceに固定された端末セッション
- D1からの会話取得と投稿保存
- ローカル限定の確認用Space自動作成
- 音声入力と読み上げ
- 家族のおしゃべり管理画面
- Space名・テーマ・投稿機能の設定
- メンバー一覧
- 1回限りの招待リンク発行と参加画面
- 基盤ヘルスチェックAPI
- Drizzleマイグレーション
- PWA Manifest

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

## 次の実装

本番用の初回ホスト登録、複数Space管理、招待QRコード、Web Push通知を実装します。認証を通さない汎用書き込みAPIは公開しません。
