// 端末を失った管理者が、Cloudflareの管理権限だけで会話に戻るためのコマンド。
//
// このシステムでの「管理者」は、そのデプロイのCloudflareアカウントを持っている人。
// だから復旧の資格情報を別に作る必要はなく、wranglerが通ることそのものが本人確認になる。
// アプリ側に復旧用の入口を増やさないので、公開される攻撃面はゼロのまま。
//
//   npm run recover -- --url https://family-talk.example.workers.dev
//   npm run recover -- --url https://omiya.example.workers.dev --database omiya
//   npm run recover -- --config wrangler.personal.toml --env omiya --url https://omiya.example.workers.dev
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const config = arg('config');
const environment = arg('env');
// --database があれば、wrangler.toml を用意しなくてもD1を直接指定できる。
// セットアップしたディレクトリを失ってクローンし直した場合はこちらを使う。
const database = arg('database') ?? 'DB';
const siteUrl = arg('url');
const memberName = arg('member');

const local = process.argv.includes('--local');

function run(args) {
  try {
    return execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const note = detail.match(/"text":\s*"([^"]*could not be found[^"]*)"/)?.[1]
      ?? detail.match(/\[code:\s*\d+\]/)?.[0]
      ?? detail.trim().split('\n').slice(-3).join(' ');
    throw new Error(`wrangler の実行に失敗しました: ${note}`);
  }
}

// wrangler は必ず設定ファイルを読み、そこに載っているDBしか受け付けない。
// 名前を渡すと wrangler.toml の database_name に一致してしまい、公開テンプレートでは
// database_id がプレースホルダのままなので「見つからない」になる。
// そこで --database が指定されたときは、正しいIDを書いた一時的な設定ファイルを作って渡す。
let generatedConfig = null;
function configArgs() {
  if (config) return ['--config', config];
  if (local || database === 'DB') return [];
  if (!generatedConfig) {
    const list = JSON.parse(run(['wrangler', 'd1', 'list', '--json']));
    const found = list.find((item) => item.name === database || item.uuid === database);
    if (!found) {
      throw new Error(`データベース「${database}」が見つかりません。使えるのは: ${list.map((item) => item.name).join(', ')}`);
    }
    generatedConfig = join(mkdtempSync(join(tmpdir(), 'family-talk-recover-')), 'wrangler.toml');
    writeFileSync(generatedConfig, [
      'name = "family-talk-recover"',
      'compatibility_date = "2026-05-15"',
      '',
      '[[d1_databases]]',
      'binding = "DB"',
      `database_name = "${found.name}"`,
      `database_id = "${found.uuid}"`,
      '',
    ].join('\n'));
  }
  return ['--config', generatedConfig];
}

function d1(sql) {
  // --local は手元の開発用DBに向ける(動作確認用)。既定は本番。
  const args = ['wrangler', 'd1', 'execute', 'DB', local ? '--local' : '--remote', '--json', '--command', sql, ...configArgs()];
  if (environment !== undefined) args.push('--env', environment);
  const raw = run(args);
  return JSON.parse(raw.slice(raw.indexOf('[')))[0].results;
}

// 対象は既定でグループのオーナー。--member "名前" で別のメンバーにも出せる。
process.on('uncaughtException', (error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});

const escaped = (memberName ?? '').replace(/'/g, "''");
const [target] = d1(memberName
  ? `select i.id, i.display_name, m.space_id from space_members m join identities i on i.id = m.identity_id where i.display_name = '${escaped}' limit 1`
  : `select i.id, i.display_name, s.id as space_id from spaces s join identities i on i.id = s.owner_id limit 1`);

if (!target) {
  console.error(memberName ? `「${memberName}」というメンバーが見つかりませんでした。` : 'グループがまだ作られていません。');
  process.exit(1);
}

const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const now = Date.now();
const expiresAt = now + 24 * 60 * 60 * 1000;

d1(`insert into device_links (id, space_id, identity_id, token_hash, expires_at, used_at, created_at) values ('${crypto.randomUUID()}', '${target.space_id}', '${target.id}', '${tokenHash}', ${expiresAt}, null, ${now})`);

const path = `/device/${token}`;
console.log(`\n${target.display_name} さんの端末をつなぐリンクを作りました(24時間有効・1回だけ使えます)。\n`);
console.log(siteUrl ? `  ${siteUrl.replace(/\/$/, '')}${path}\n` : `  https://<このアプリのURL>${path}\n`);
console.log('このリンクをスマートフォンで開くと、元の名前のまま会話に戻れます。');
// 代理で作業しているAIエージェントが、確認のつもりで開いて消費してしまう事故を防ぐ。
console.log('※ 1回しか使えません。動作確認のために開かないでください(開いた時点で無効になります)。');
