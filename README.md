# 家族のおしゃべり

利用者自身のCloudflare環境で運用する、家族専用のシンプルなコミュニケーションアプリです。
特に高齢者でも安心して利用できるようデザインされています。
個人で管理できるCloudflare上の汎用的な個人データ基盤の上に構築されています。

## 「家族のおしゃべり」の特長

- 文字が大きい
- 広告など、余計な情報が入ってこない
- 家族だけの安心感
- 音声で入力、音声で聞ける
- 管理者以外は、細かい設定もなし
- データはすべて自分の管理　プラットフォーマーからの独立
- AIで簡単インストール
- ユーザーは、QRコードのスキャン
- PWAアプリで、更新も不要

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
   npx wrangler login を実行する(ブラウザが開いて認可画面が出るので、
   相手に「許可」を押してもらい、ターミナルに戻ってくるまで待つ。
   Cloudflareのダッシュボードに普段ログインしているだけでは不十分)
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
5. ブラウザの「ホーム画面に追加」でアプリをインストールします。

### Cloudflareのインストールボタンから設置する

**Cloudflare　と　GitHub(またはGitLab)のアカウントが必要**です。

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

## アップデートする

**デプロイは自動更新されません。** 各家庭のデプロイは、設置した時点のコードの完全に独立したコピーです。このテンプレート側(`github.com/yoshihik0/family-talk`)に新しい修正が入っても、すでに設置済みのものには自動で届きません。取りに行く必要があります。

今の自分のバージョンは `https://<自分のURL>/api/v1/health` の `version` で確認できます。アプリ内の「設定 → アップデートを確認」でも同じことができます。

更新方法は、最初にどちらの方法で設置したかによって変わります。

### CLI(AIエージェント)で設置した場合

デプロイ時に使ったのと同じディレクトリ(`git clone`したフォルダ)で、下の指示書をAIエージェントに渡してください。アプリの管理ツール(`/admin/<スペースID>`、設定パネルの「管理ツールを開く」から)からも同じ文章をコピーできます。

<details>
<summary>AIエージェントへの更新指示書(クリックで展開)</summary>

```
このデプロイを最新版に更新してください。

1. 前回 git clone したディレクトリで作業する(見つからなければ私に聞く)
2. 現在の wrangler.toml の name と database_id の値を控えておく
3. git fetch origin してから git log HEAD..origin/main --oneline で
   新しいコミットがあるか確認する。無ければ「最新です」と伝えて終了する
4. あれば、git stash で今の wrangler.toml の変更を退避してから
   git pull origin main を実行する
5. git stash pop でローカルの変更を戻す。
   競合が出たら、控えておいた name と database_id を wrangler.toml に書き戻す
6. npm install を実行する
7. npm run deploy を実行する
8. デプロイ後、/api/v1/health の version が上がっていることを確認する
9. 手順3で見つかった変更点を、日本語で簡潔に私に説明してください
```

</details>

このデプロイ自体は自動更新されません。都度、この手順(またはAIへの依頼)をやり直す必要があります。

### Cloudflareのボタンで設置した場合

ボタンで作成したWorkerは、あなたのGitHub上のフォークとCloudflareが自動でつながっている(Git連携)ことが多く、その場合は**フォークを同期するだけで、ビルドとデプロイはCloudflareが自動で行います**。

1. 自分のGitHub上のフォーク(`あなたのユーザー名/family-talk`)を本家(`yoshihik0/family-talk`)と同期する(Sync fork)。GitHubの画面上のボタンでも、AIエージェントに `gh repo sync <あなたのユーザー名>/family-talk --source yoshihik0/family-talk` を頼んでも構いません
2. Cloudflareダッシュボード → Workers & Pages → 対象のWorker → 「Deployments」タブで新しいデプロイが始まっていることを確認する

Git連携が有効かどうかは、Workerの Settings → Build(または Git)に `Connected repository` の表示があるかで確認できます。表示がない場合は連携されていないので、フォーク同期のあとにダッシュボードから手動で再デプロイ(Deployments → Retry deployment、または再度ボタンから設置)してください。
