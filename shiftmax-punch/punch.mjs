#!/usr/bin/env node
// ShiftMax 勤怠打刻スクリプト（出発 / 上番 / 下番）
//
// 使い方:
//   SHIFTMAX_URL='<便利URL(WorkTimeListForStaff.aspx)>' \
//   node punch.mjs --action 出発 --expect 08:30 --window 06:30-07:29 [--dry-run]
//
// 動作:
//   1. 一覧ページ(SHIFTMAX_URL)を読み取り、その日の「出発/上番/下番」リンクと表示時刻を解析
//   2. --action と一致し、かつ表示時刻が --expect と一致する行を探す
//   3. 現在時刻(日本時間)が --window の許容範囲内かを確認
//   4. すべて満たせばリンク(GET)を開いて打刻し、「◯◯報告完了」を確認
//   ※ 範囲外・不一致・見つからない場合は絶対に押さず、理由を出力して終了
//
// 終了コードと RESULT 行で結果を通知する。

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const key = cur.slice(2);
      const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true';
      acc.push([key, val]);
    }
    return acc;
  }, [])
);

const ACTION = args.action;                 // 出発 / 上番 / 下番
const EXPECT = args.expect;                  // 表示時刻 例 "08:30"
const WINDOW = args.window;                  // 許容範囲 例 "06:30-07:29"
const DRY_RUN = args['dry-run'] === 'true';
const SAFETY_SEC = parseInt(args['safety-sec'] || '20', 10); // 終端手前の安全マージン(秒)
const URL_LIST = process.env.SHIFTMAX_URL;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function out(result, msg) {
  console.log(`RESULT:${result}`);
  console.log(`MESSAGE:${msg}`);
}
function fail(result, msg, code = 2) { out(result, msg); process.exit(code); }

if (!URL_LIST) fail('ERROR', '環境変数 SHIFTMAX_URL が未設定です', 3);
if (!ACTION || !EXPECT || !WINDOW) fail('ERROR', '--action / --expect / --window は必須です', 3);

// 日本時間(JST=UTC+9)の現在時刻
function jstNow() {
  const nowMs = Date.now();
  const j = new Date(nowMs + 9 * 3600 * 1000);
  return {
    ms: nowMs,
    h: j.getUTCHours(),
    m: j.getUTCMinutes(),
    s: j.getUTCSeconds(),
    hhmm: `${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`,
    hhmmss: `${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}:${String(j.getUTCSeconds()).padStart(2, '0')}`,
  };
}
const toSec = (hh, mm, ss = 0) => hh * 3600 + mm * 60 + ss;

import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// この環境では全HTTPS通信をプロキシ経由にする必要があり、Nodeのfetchはプロキシを
// 使わないため弾かれる。プロキシ/CAを正しく扱う curl を使って取得する。
async function fetchSjis(url) {
  const tmp = join(tmpdir(), `sm_${process.pid}_${Date.now()}.html`);
  try {
    const status = execFileSync('curl', [
      '-sS', '-A', UA, '--max-time', '30', '--retry', '2',
      '-o', tmp, '-w', '%{http_code}', url,
    ], { encoding: 'utf8' }).trim();
    const buf = readFileSync(tmp);
    const text = new TextDecoder('shift_jis').decode(buf);
    return { status: parseInt(status, 10) || 0, text };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function parseEntries(html) {
  // 時刻マーカー「・M/D HH:MM」の位置一覧
  const timeMarkers = [];
  for (const m of html.matchAll(/・\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/g)) {
    timeMarkers.push({ index: m.index, hhmm: `${String(+m[3]).padStart(2, '0')}:${m[4]}` });
  }
  // 打刻リンク一覧
  const anchors = [];
  for (const a of html.matchAll(/<a\s+href="(WorkTimeReportForStaff\.aspx\?[^"]+)"\s*>\s*\[(出発|上番|下番)\]/g)) {
    // 直前の時刻マーカーを紐付け
    let time = null;
    for (const tm of timeMarkers) { if (tm.index < a.index) time = tm.hhmm; else break; }
    anchors.push({ href: a[1], action: a[2], time });
  }
  return anchors;
}

(async () => {
  const now = jstNow();

  // 1. 一覧取得
  let list;
  try { list = await fetchSjis(URL_LIST); }
  catch (e) { fail('ERROR', `一覧ページの取得に失敗: ${e.message}`, 4); }
  if (list.status !== 200) fail('ERROR', `一覧ページが HTTP ${list.status} を返しました`, 4);

  // ログイン切れ検知（名前が消えてログイン画面等になっていないか）
  if (/type=(password|text)[^>]*name=/i.test(list.text) && !/報告/.test(list.text)) {
    fail('SESSION_EXPIRED', 'ログイン済みページが取得できませんでした（URLの有効期限切れの可能性）', 5);
  }

  // 2. 対象リンク検索
  const entries = parseEntries(list.text);
  const match = entries.find(e => e.action === ACTION && e.time === EXPECT);

  if (!match) {
    const summary = entries.length
      ? entries.map(e => `${e.action}(${e.time})`).join(', ')
      : '(打刻リンクなし)';
    // 対象が無い = 休みの日 / 既に打刻済み / パターン違い → 何もしない
    out('SKIP_NO_MATCH', `対象「${ACTION} ${EXPECT}」は見つかりませんでした。現在の一覧: ${summary}。打刻せず終了します。`);
    process.exit(0);
  }

  // 3. 時刻ウィンドウ判定
  const [ws, we] = WINDOW.split('-');
  const [wsH, wsM] = ws.split(':').map(Number);
  const [weH, weM] = we.split(':').map(Number);
  const nowSec = toSec(now.h, now.m, now.s);
  const startSec = toSec(wsH, wsM, 0);
  const endSec = toSec(weH, weM, 59) - SAFETY_SEC; // 終端手前で締める
  const inWindow = nowSec >= startSec && nowSec <= endSec;

  if (!inWindow) {
    fail('SKIP_OUT_OF_WINDOW',
      `現在 ${now.hhmmss}(JST) は許容範囲 ${WINDOW}(安全マージン${SAFETY_SEC}秒) の外です。誤打刻を避けるため押しません。手動で対応してください。`, 6);
  }

  // ここまで来たら「押す」条件を満たしている
  if (DRY_RUN) {
    out('DRYRUN_WOULD_PRESS',
      `[試験] 押す条件を満たしています。対象=${match.action}(${match.time}) href=${match.href} 現在=${now.hhmmss}(JST) 範囲=${WINDOW}。実際には押していません。`);
    process.exit(0);
  }

  // 4. 打刻実行（リンクをGET）
  const pressUrl = new URL(match.href, URL_LIST).toString();
  let resp;
  try { resp = await fetchSjis(pressUrl); }
  catch (e) { fail('ERROR', `打刻リンクのアクセスに失敗: ${e.message}`, 4); }

  if (resp.status !== 200) fail('ERROR', `打刻リンクが HTTP ${resp.status} を返しました`, 4);

  if (/報告完了/.test(resp.text)) {
    const m = resp.text.match(/([^\s<>・]{2,6}報告完了)/);
    out('SUCCESS', `${m ? m[1] : '報告完了'} を確認しました。（${match.action} ${match.time} / 押下 ${now.hhmmss} JST）`);
    process.exit(0);
  } else {
    fail('UNCERTAIN',
      `リンクは開けましたが「報告完了」の文字を確認できませんでした。手動で状態確認をお願いします。（${match.action} ${match.time}）`, 7);
  }
})();
