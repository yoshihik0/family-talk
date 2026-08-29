# 家族のおしゃべり

利用者自身のCloudflare環境で運用する、家族専用のシンプルなコミュニケーションアプリです。汎用的な個人データ基盤の上に構築されています。

## 自分のCloudflareに設置する

### おすすめ: AIエージェントに任せる

一番簡単で失敗が少ない方法です。Cloudflareのアカウント作成とログインだけ自分でやって、あとはClaude CodeなどのAIコーディングエージェントに指示書を渡すだけで、名前を聞かれて答えれば設置まで終わります。

1. [Cloudflareにサインアップ](https://dash.cloudflare.com/sign-up)する(**クレジットカード不要**、無料プランで足ります)
2. ターミナルで `npx wrangler login` を実行し、ブラウザでログインを済ませておく
3. AIエージェントに、下の指示書をそのまま渡す

<details>
<summary>AIエージェントへの指示書(クリックで展開)</summary>

```
このリポジトリをデプロイしてください。

1. まず私に、このデプロイの名前(例: family など英数字とハイフンのみ)を聞いてください。
   この名前はWorker名になり、そのままURL(https://<名前>.<サブドメイン>.workers.dev)になります。
   個人が特定できる情報は含めないほうが安全です。日本語は使えません。
2. git clone https://github.com/yoshihik0/family-talk.git を実行し、そのディレクトリに移動する
3. npm install を実行する
4. npx wrangler whoami でログイン済みか確認する。ログインしていなければ
   npx wrangler login を実行してもらうよう私に伝えて、完了を待つ
5. npx wrangler d1 create <決めた名前> を実行する
   (すでに同名のデータベースがあれば、別の名前を私に確認する)
6. 出力された database_id をコピーし、wrangler.toml の
   database_id フィールドに書き込む(database_name も同じ名前に変更する)
7. wrangler.toml の 先頭の name フィールドも、決めた名前に変更する
8. npm run deploy を実行する(ビルド・マイグレーション適用・デプロイを行う)
9. デプロイ後、表示されたURLに対して /api/v1/health と /api/v1/setup に
   アクセスして、200が返り setup が needsSetup: true になっていることを確認する
10. 最後に、発行されたURLを私に伝えてください。
```

</details>

4. AIが完了したら、渡されたURLをスマートフォンで開き、「はじめまして」画面で自分の名前・グループ名・アイコンを入力
   (**グループ名とアイコンはあとから変更できません**。ホーム画面のアイコンにも使われるので、ここで決めておきましょう)
5. ブラウザの「ホーム画面に追加」でアプリ化して完了

### ボタンから設置する

CLIやGitの知識が無くても、ボタンから設置できます。ただしCloudflareに加えて**GitHub(またはGitLab)のアカウントも必要**です。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yoshihik0/family-talk)

1. 上のボタンを押す
2. Cloudflareにログイン(アカウントが無ければ作成)
3. Worker名・データベース名を確認して「Deploy」(基本はそのままでよい)
4. 数分待つと、`https://<名前>.workers.dev` のURLが発行される
5. そのURLをスマートフォンで開くと「はじめまして」画面が出るので、名前・グループ名・アイコンを入力(**グループ名とアイコンはあとから変更できません**)
6. ブラウザの「ホーム画面に追加」でアプリ化して完了

いずれの方法でも、シークレットの入力や事前設定は不要です。Web Push通知だけは任意で、使う場合は後から `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` をCloudflareのWorker設定でシークレットとして追加してください([web-push generate-vapid-keys](https://www.npmjs.com/package/web-push)で生成できます)。

## 家族を追加する

1. 管理者(最初にセットアップした人)が、右上の歯車アイコン→設定画面を開く
2. 「メンバー」欄の「追加」をクリックすると、QRコードとURLが表示される
3. それを追加したい家族に渡す(QRコードを読み取ってもらうか、URLを開いてもらう)
4. 相手が名前を入力して参加すると、会話に加わる

参加時に決める名前は、あとから変更できません。アイコンと色は、参加後いつでも自分の設定から変更できます(名前は変更できません)。

## 現在の実装

- 家族のおしゃべりのモバイルファースト画面
- SpaceごとのCSSテーマ・アプリアイコン(Web App Manifest)
- D1向け汎用データモデル
- 任意JSON Recordの作成・取得リポジトリ
- Spaceに固定された端末セッション
- D1からの会話取得と投稿保存
- シークレット不要の初回セットアップ(1デプロイ1Spaceのみ・一度きり)
- 音声入力と読み上げ
- 会話画面に統合された設定(自分の設定・メンバー管理・招待QR・別端末の追加)
- 1回限りの招待リンク発行と参加画面
- 期限付きDevice LinkによるPWAの別端末追加
- Web Push通知
- 基盤ヘルスチェックAPI
- Drizzleマイグレーション

設計の詳細は[docs/architecture.md](docs/architecture.md)、プロダクト全体の構想は[idea.md](idea.md)を参照してください。

## 自分でCLIを操作する場合

AIエージェントを使わず、上の「AIエージェントへの指示書」と同じ手順を自分の手で行う場合はこちらです。`npx wrangler d1 create <名前>` の出力に含まれる `database_id` を、`wrangler.toml` の `database_id`(と `name` / `database_name`)に**手で書き込む工程を忘れないでください**。ここを飛ばすと `npm run deploy` が失敗します。

```bash
git clone https://github.com/yoshihik0/family-talk.git
cd family-talk
npm install
npx wrangler login                # Cloudflareアカウントでログイン
npx wrangler d1 create <好きな名前>  # 表示された database_id を wrangler.toml に書き込む
npm run deploy                    # ビルド → マイグレーション適用 → デプロイ
```

## 次の実装

エクスポート/バックアップを実装します。認証を通さない汎用書き込みAPIは公開しません。

画像添付は意図的に実装しません。文字と音声だけに絞ることで、迷う要素そのものを無くしています。
