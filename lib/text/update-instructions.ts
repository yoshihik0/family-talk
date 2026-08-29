export const UPDATE_INSTRUCTIONS_PROMPT =
  'family-talkの更新を確認してください。前回セットアップしたディレクトリで、git fetch origin してから git log HEAD..origin/main --oneline で新しいコミットがあるか確認し、あれば wrangler.toml の name と database_id を退避しつつ git pull → npm install → npm run deploy を実行してください。手順の詳細は https://github.com/yoshihik0/family-talk#アップデートする を参照してください。';
