# Personal Data Hub アーキテクチャ

## 基本方針

Cloudflare側は「家族チャット専用サーバー」ではなく、所有者自身が運用する汎用データ基盤とする。アプリ固有の意味はフロントエンドとCollection定義が担い、中核APIは任意JSONを扱う。

## 中核モデル

- `Identity`: 人または連携サービス
- `Space`: 権限とデータ分離の境界
- `SpaceMember`: IdentityとSpaceの役割・権限
- `DeviceSession`: 一つの端末・一つのSpaceに固定されたセッション
- `Invite`: Spaceへ参加するための期限・利用回数付きトークン
- `Collection`: JSON Recordの集合と任意スキーマ
- `Record`: アプリ非依存の構造化JSON
- `Event`: 変更通知、監査、外部連携のための追記型イベント
- `PushSubscription`: アプリ非依存の通知先
- `Asset`: 将来R2を有効にしたときのファイルとメタデータ

## 家族のおしゃべりとの対応

| 汎用基盤 | 家族のおしゃべり |
| --- | --- |
| Space | 自宅家族、実家、配偶者の実家 |
| Collection | `messages` |
| Record | 1件のメッセージ |
| Identity | 家族の一人 |
| SpaceMember | ホスト、メンバー、閲覧者 |
| Event | `record.created` |
| Space settings | CSSテーマ、投稿ポリシー |

複数の家族グループを別Spaceにすることで、データと権限を構造的に分離する。グループの存在自体を他Spaceの参加者へ公開しない。

## JSONと検索

Record本体は`data_json`に保存し、アプリごとに自由な構造を許可する。ただし、ID、Collection、作成者、日時、状態、スキーマバージョンは共通列として持つ。検索が必要なデータは、無制限なJSONクエリではなく、Collection定義に基づいて`searchable_text`または将来の投影テーブルへ安全に抽出する。

## API境界

中核APIは以下の資源を中心に構成する。

```text
/api/v1/spaces
/api/v1/spaces/:spaceId/collections
/api/v1/collections/:collectionId/records
/api/v1/records/:recordId
/api/v1/events
/api/v1/notify/subscriptions
```

`/messages`のような用途固有APIは中核に置かない。必要な場合はアプリ側の薄いアダプターとして実装する。

## 初期実装の境界

現在の実装は、汎用D1スキーマ、Recordリポジトリ、端末セッション、Space権限検証、家族のおしゃべり用アダプターAPI、D1に接続した会話画面までを対象とする。

ローカルでは確認用Spaceと端末セッションを自動作成する。この入口は`localhost`だけで動作し、公開環境では利用できない。本番の初回ホスト登録と家族参加は、Cloudflare Secretと一度だけ使えるInviteを使う。
