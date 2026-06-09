# Imported Outputs

`_imported_outputs/` は昨日までの作業成果物を取り込むための一時ディレクトリです。

## 確認結果

| 取り込み元 | 統合先 | 状態 |
| --- | --- | --- |
| `_imported_outputs/app.js` | `src/app.js` | 同一内容で統合済み |
| `_imported_outputs/styles.css` | `src/styles.css` | 同一内容で統合済み |
| `_imported_outputs/pdf-lib.min.js` | `vendor/pdf-lib.min.js` | 同一内容で統合済み |
| `_imported_outputs/index.html` | `index.html` | `src/` と `vendor/` を参照する入口として再構成済み |
| `_imported_outputs/README.md` | `README.md` | GitHub向けの説明と構成情報を追加して再構成済み |

## Git管理方針

`_imported_outputs/` は元の生成物を保管するための取り込み元であり、正式なソースではありません。重複を避けるため `.gitignore` で除外しています。
