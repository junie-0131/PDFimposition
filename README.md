# PDF 面付 Pro

日本の商業印刷向けプリプレスPDF面付けツールです。ブラウザ上でPDFを読み込み、面付けPDFとJSONジョブチケットを生成します。PDF処理には同梱の `vendor/pdf-lib.min.js` を利用します。

## 主な機能

- PDF読込、ページ数取得、1ページ目サイズから仕上り寸法を自動反映
- 中綴じ向け折丁2面付け
- 4の倍数でない冊子の末尾2ページを差し込み両面として別版面出力
- 奇数ページPDFへの白ページ追加
- 差し込み2ページの左右位置合わせ、複製配置、ドンテン運用向け版面
- 差し込み複製面の180度回転によるドンテン配置
- 端物向け多面付け
- 右綴じ、左綴じ、天綴じの台割切替
- 菊判、四六判、A/B列本判、A3ノビなど日本の印刷用紙プリセット
- 用紙の縦向き・横向き90度回転
- マスタ用紙サイズの名前付きプリセット保存
- 面付設定の名前付きプリセット保存と読み込み
- PDF選択以外の前回設定自動復元
- くわえ、針側、紙目、ドブ、背丁ドブ、束見込み補正
- 断裁トンボ、折りトンボ、レジスターマーク、CMYKカラーバー、スラッグ情報
- 日本式2重トンボ
- 日本式トンボのドブ側1重処理
- 面付けPDF出力
- JSONジョブチケット出力
- プリフライト警告

## プロジェクト構成

```text
.
├── index.html
├── package.json
├── README.md
├── src/
│   ├── app.js
│   └── styles.css
└── vendor/
    └── pdf-lib.min.js
```

## ソースと生成物の扱い

- `src/`: アプリケーションの編集対象ソースです。
- `vendor/`: 実行に必要な外部ライブラリを配置します。現在はブラウザ実行用の `pdf-lib.min.js` を同梱しています。
- `index.html`: GitHub Pagesや静的ホスティングで直接配信する入口です。
- `_imported_outputs/`: 昨日までの出力成果物の取り込み元です。内容は統合済みのためGit管理対象から外しています。
- `dist/`: `npm run build` の生成先です。再生成できるためGit管理対象から外しています。

## ローカル起動

依存関係をインストールします。

```bash
npm install
```

開発サーバーを起動します。

```bash
npm run dev
```

Viteを使わず、`index.html` を直接ブラウザで開いて使うこともできます。

## 確認

```bash
npm run check
npm run build
```

## GitHub Pages

静的ファイルだけで動作します。GitHub Pagesで公開する場合は、リポジトリのPages設定で公開元を `main` ブランチのルートに設定してください。

## Acrobat Plug-in 化メモ

Adobe Acrobat Plug-in版では、WEB版の設定モデルと台割ロジックを流用し、PDF操作部分をAcrobat SDKのCos/PDE層へ置き換える構成が現実的です。

- UI: Acrobat Dialog Managerまたは外部パネル
- PDF読込: AVDoc/PDDoc
- ページ配置: PDEContent/PDEForm
- マーク描画: PDEPath/PDEText
- 設定保存: JSONジョブチケットを文書メタデータまたは外部ファイルへ保存
- 配布: Acrobat/Reader対応範囲、署名、OS別ビルド、Adobe SDKライセンス確認が必要

業務投入前には、刷版サイズ、CTPワークフロー、RIP、JDF/JMF連携、特色、透明効果、PDF/X、ページボックス、ドットゲイン、検版フローに合わせて検証してください。
