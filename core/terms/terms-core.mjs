// StableBlock の画面の語彙(HTML版 / VSCode拡張 Webview 共用)。
// ツールバーとプロパティ欄の入口の名前・ツールチップ・選択肢の表示名をここで 1 か所に決める。
// 画面に出す名前は短く(何の入口か分かる語だけ)、何をするか・どう効くかはツールチップ(カーソルを合わせたとき)で補う。
// 略語・絵文字だけの名前にはしない。
// HTML版は日本語(ja)、VSCode拡張は英語(en)。同じ入口は両方で同じ意味の語にそろえる。
// browser 版は core/excel/build-browser.mjs が terms-core.browser.js を生成する
// (window.StableBlockTerms)。DOM API は使用禁止 — node --test で検証する純粋関数のみ。
//
// 静的に HTML に書いた入口は data-term="キー" を持ち、その文字と title が
// termText / termTitle と一致することを core/terms/__tests__ が確かめる。

const SB_TERMS_TABLE = {
  // ツールバー: [表示名, ツールチップ(動詞で何をするか)]
  'zoom-out': { ja: ['−', '縮小する'], en: ['−', 'Zoom out'] },
  'zoom-in': { ja: ['+', '拡大する'], en: ['+', 'Zoom in'] },
  'fit': { ja: ['全体表示', '図の全体を画面に収める(F キー)'], en: ['Fit', 'Fit the whole diagram (F key)'] },
  'undo': { ja: ['↩', '元に戻す(Ctrl+Z)'], en: ['↩', 'Undo (Ctrl+Z)'] },
  'redo': { ja: ['↪', 'やり直す(Ctrl+Y)'], en: ['↪', 'Redo (Ctrl+Y)'] },
  'line-mode': { ja: ['⌇ 曲線', '線の形を切り替える: 曲線 → 直線 → 直角(図全体の既定。route を書いていない接続に効き、本文の @canvas 行に書く。L キー)'] },
  'highlight': { ja: ['◎ 未接続', '接続の無いブロックを薄く表示する/戻す(H キー)'], en: ['◎ Dim unlinked', 'Dim blocks without connections / restore (H key)'] },
  'anno': { ja: ['◇ 注釈', '注釈を表示する/隠す(N キー)。表示中の注釈はそのままクリックで選べる'], en: ['◇ Show notes', 'Show / hide notes (N key). Click a shown note to select it'] },
  // 仮の ID(__new_)のまま残った要素に、ラベルから ID を一括で付ける(プロパティ欄の ID 欄は 1 つずつの改名)
  'fix-id': { ja: ['ID補正', '仮の ID(__new_)のままの要素に、ラベルから ID を一括で付ける(表記はラベルのまま、接続も追従)。英数字の無いラベルはプロパティ欄の ID で付ける'], en: ['Fix IDs', 'Give elements still on a placeholder ID (__new_) an ID from their label, as written (connections follow). Labels without letters or digits need the ID field'] },
  'export-svg': { ja: ['SVG', 'SVG で書き出す'], en: ['SVG', 'Save as SVG'] },
  'export-png': { ja: ['PNG', 'PNG で書き出す'], en: ['PNG', 'Save as PNG'] },
  // PNG は 1 つの入口: 「PNG」で保存し、横の ▾ から背景の透過・クリップボードへのコピーを選ぶ
  'png-more': { ja: ['▾', 'PNG のほかの出し方を選ぶ(透過PNG・クリップボードにコピー)'], en: ['▾', 'More PNG options (transparent background, copy to the clipboard)'] },
  'export-png-transparent': { ja: ['透過PNG', '背景を透過した PNG で書き出す'], en: ['Save with transparent background', 'Save as PNG with a transparent background'] },
  'copy-png': { ja: ['コピー', 'PNG 画像をクリップボードにコピーする'], en: ['Copy to clipboard', 'Copy the diagram to the clipboard as PNG'] },
  'export-xlsx': { ja: ['Excel', 'Excel(.xlsx)で書き出す'], en: ['Excel', 'Save as Excel (.xlsx)'] },
  'export-mermaid': { ja: ['Mermaid', 'Mermaid(.mmd)で書き出す'], en: ['Mermaid', 'Save as Mermaid (.mmd)'] },
  // 一緒に読み込んだ図が 2 枚以上のときだけ書き出しの並びの後ろに出る「一括 ▾」と、その選択肢(形式ごとに 1 つの zip)
  'export-all': { ja: ['一括 ▾', '一緒に読み込んだ全部の図を書き出す。形式を選ぶと 1 枚ずつ include を解決して 1 つの zip で保存する'] },
  'export-svg-all': { ja: ['SVG', '読み込んだ全部の図を SVG で書き出し、1 つの zip で保存する'] },
  'export-png-all': { ja: ['PNG', '読み込んだ全部の図を PNG で書き出し、1 つの zip で保存する'] },
  'export-png-transparent-all': { ja: ['透過PNG', '読み込んだ全部の図を背景を透過した PNG で書き出し、1 つの zip で保存する'] },
  'export-xlsx-all': { ja: ['Excel', '読み込んだ全部の図を Excel(.xlsx)で書き出し、1 つの zip で保存する'] },
  'export-mermaid-all': { ja: ['Mermaid', '読み込んだ全部の図を Mermaid(.mmd)で書き出し、1 つの zip で保存する'] },
  // ツール欄(何も選んでいないとき)の「共通部(@include)」
  'add-include': { ja: ['取り込む', '選んだ図を @include で取り込む(本文に @include の 1 行を足す)'] },
  'add-include-all': { ja: ['すべてに取り込む', '一緒に読み込んだ図のうち取り込める図すべての本文に @include の 1 行を足す(「.sb 保存」で変わった図を全部書き出す)'] },
  'remove-include': { ja: ['外す', 'この @include 行を本文から消す(取り込んでいた要素は図から消える)'] },
  'new-sb': { ja: ['新規', '空の図(@canvas の 1 行だけ)から始める。前の図は ↩ で戻せる'] },
  'save-sb': { ja: ['.sb 保存', '.sb ファイルに保存する(読み込んだ図は同じファイル名で)'] },
  // 「.sb 読込 ▾」は 1 つの入口: 開くと「ファイルを選ぶ」(複数可)と「フォルダを選ぶ」(配下の .sb を全部)。ファイル・フォルダをプレビューへドロップしても同じ
  'open-sb': { ja: ['.sb 読込 ▾', '.sb を読み込む。ファイルを選ぶか、フォルダを選んで配下の .sb を全部読む(プレビューへファイル・フォルダをドロップしても読める)'] },
  'open-sb-files': { ja: ['ファイルを選ぶ', '.sb ファイルを選んで読み込む(本体と include 先を一緒に選べる)'] },
  'open-sb-folder': { ja: ['フォルダを選ぶ', 'フォルダを選び、配下の .sb を全部読み込む。@include を相対パスで解き、ほかの図から取り込まれていない図を開く'] },
  'search': { ja: ['🔍 検索', 'ID・ラベルで絞り込み、外れた要素を薄くする。Enter で当たりを読み順に 1 つずつ選ぶ(Shift+Enter で戻る)。一緒に読み込んだ図の名前にも当たり、図名の行を押すか Enter で開く'], en: ['Search ID / label', 'Filter by ID / label and dim the rest. Enter selects the matches one by one in reading order (Shift+Enter: back)'] },
  // プロパティ欄
  'add-block': { ja: ['+ ブロック追加', '直前に足したブロックの右隣に、同じ大きさ・色で追加する'], en: ['+ Block', 'Add a block right of the last one added (same size and color)'] },
  'add-group': { ja: ['+ グループ追加', 'グループを空き位置に追加する'], en: ['+ Group', 'Add a group at a free spot'] },
  'add-note': { ja: ['+ 注釈追加', '注釈を空き位置に追加する'], en: ['+ Note', 'Add a note at a free spot'] },
  'add-block-in-group': { ja: ['+ 中にブロック', 'このグループの中、最後のブロックの右隣に同じ大きさ・色で追加する'], en: ['+ Block in Group', 'Add a block inside this group, right of its last block (same size and color)'] },
};

const SB_STYLE_NAMES = {
  solid: { ja: '実線', en: 'Solid' },
  dashed: { ja: '破線', en: 'Dashed' },
  bold: { ja: '太線', en: 'Bold' },
};

// 線の形(DSL の route 値。'' は「既定」= `@canvas` 行の route(図全体の既定。ツールバーの「線の形」が書く)に従う)
const SB_LINE_SHAPE_NAMES = {
  '': { ja: '既定', en: 'Default' },
  curved: { ja: '曲線', en: 'Curved' },
  straight: { ja: '直線', en: 'Straight' },
  ortho: { ja: '直角', en: 'Right-angle' },
};
const SB_LINE_SHAPE_ICONS = { curved: '⌇', straight: '╱', ortho: '⊾' };

const SB_TYPE_NAMES = {
  block: { ja: 'ブロック', en: 'BLOCK' },
  group: { ja: 'グループ', en: 'GROUP' },
  note: { ja: '注釈', en: 'NOTE' },
};

function termEntry(key, lang) {
  const e = SB_TERMS_TABLE[key];
  if (!e) throw new Error('terms: unknown key ' + key);
  const v = e[lang || 'ja'];
  if (!v) throw new Error('terms: key ' + key + ' has no ' + (lang || 'ja'));
  return v;
}

// 入口の表示名
export function termText(key, lang) { return termEntry(key, lang)[0]; }

// 入口のツールチップ(何をするか)
export function termTitle(key, lang) { return termEntry(key, lang)[1]; }

// 語彙にあるキーの一覧(lang を渡すとその言語を持つキーだけ)
export function termKeys(lang) {
  return Object.keys(SB_TERMS_TABLE).filter(k => !lang || SB_TERMS_TABLE[k][lang]);
}

// 線・枠のスタイル(DSL の style 値)の表示名。未知の値はそのまま返す
export function styleName(style, lang) {
  const e = SB_STYLE_NAMES[style];
  return e ? e[lang || 'ja'] : String(style);
}

// 線の形(DSL の route 値)の表示名
export function lineShapeName(route, lang) {
  const e = SB_LINE_SHAPE_NAMES[route || ''];
  return e ? e[lang || 'ja'] : String(route);
}

// ツールバーの「線の形」ボタンの表示名。何を切り替えるか(線の形)と今の値を出す
export function lineModeText(mode, lang) {
  const l = lang || 'ja';
  const icon = SB_LINE_SHAPE_ICONS[mode] || SB_LINE_SHAPE_ICONS.curved;
  return l === 'ja' ? `${icon} ${lineShapeName(mode, l)}` : `${icon} Line: ${lineShapeName(mode, l)}`;
}

// 「一括 ▾」の選択肢の見出し。何枚を書き出すかを出す
export function exportAllText(n, lang) {
  return (lang || 'ja') === 'ja' ? `読み込んだ全部の図(${n} 枚)` : `All loaded diagrams (${n})`;
}

// 選択中の要素の種類の表示名
export function typeName(type, lang) {
  const e = SB_TYPE_NAMES[type];
  return e ? e[lang || 'ja'] : String(type);
}
