// primary 手順 2〜3: 全図横断で部品 ID `SpiDrv` を `SpiMasterDrv` に改名する(接続・ラベル・include 先を含めて 1 操作で)。
// 作図 UI だけで: 「.sb 読込」で図をまとめて読み、ツールバーの検索で表示していない図の参照を図と行で見つけ、プロパティ欄の ID を 1 回変えると
// 読み込んだ全部の図の定義行と接続の from / to が変わる。「.sb 保存」で変わった図が全部書き出され、座標・サイズの行は 1 バイトも動かない。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, getEditorText, saveDir, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-set');
const FILES = ['can_swc.sb', 'spi_swc.sb', 'spi_dataflow.sb', path.join('shared', 'common.sb')].map(f => path.join(SET, f));
const read = f => fs.readFileSync(f, 'utf8');

// 「.sb 保存」を押し、続けて出るダウンロード(表示中の図 + 変わったほかの図)を count 個受け取る
async function saveAll(page, dir, count) {
  const got = [];
  const done = new Promise(resolve => {
    page.on('download', async d => {
      const file = path.join(dir, d.suggestedFilename());
      await d.saveAs(file);
      got.push(file);
      if (got.length === count) resolve();
    });
  });
  await page.getByRole('button', { name: '.sb 保存' }).click();
  await done;
  return got;
}

test('primary-02: 検索で参照元を図と行で見つけ、ID を 1 回変えると読み込んだ全部の図が改名され、保存で変わった図が全部出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, FILES);   // 表示されるのは先頭の can_swc.sb(SpiDrv を使っていない図)
  await expect(page).toHaveTitle(/can_swc\.sb/);

  // 参照元を開かずに探す: ツールバーの検索に ID を打つと、表示していない図の当たりが図と行で並ぶ
  await page.locator('#search-input').click();
  await page.keyboard.type('SpiDrv');
  const hits = page.locator('#search-hits .sh-item');
  await expect(page.locator('#search-hits')).toBeVisible();
  await expect(page.locator('#search-hits .sh-head')).toContainText('3 枚のうち 2 枚・5 行');
  await expect(hits).toHaveCount(5);
  expect(await hits.evaluateAll(els => els.map(e => `${e.dataset.path}:${e.dataset.line}`))).toEqual(
    ['spi_swc.sb:4', 'spi_swc.sb:6', 'spi_swc.sb:7', 'spi_dataflow.sb:4', 'spi_dataflow.sb:6']);
  await expect(hits.first()).toContainText('spi_swc.sb');
  await expect(hits.first()).toContainText('L4 定義');

  // 当たりを押すとその図が開き、その要素が選ばれる(一覧は閉じてプロパティ欄を隠さない)
  await hits.first().click();
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('#search-hits')).toBeHidden();
  expect(await getEditorText(page)).toBe(read(FILES[1]));
  await expect(page.locator('#prop-id')).toHaveValue('SpiDrv');
  await expect(page.locator('#prop-id-elsewhere')).toContainText('spi_dataflow.sb(L4, L6)');
  await expect(page.locator('#prop-id')).toBeVisible();                    // ほかの図でも使う ID は ID 欄が開いている

  // 既にほかの図にある ID には変えられず、どの図も変わらない
  await page.locator('#prop-id').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('spidata');
  await page.keyboard.press('Enter');
  await expect(page.locator('#prop-id-msg')).toContainText('既に定義されている: spi_dataflow.sb:5');
  expect(await getEditorText(page)).toBe(read(FILES[1]));

  // 1 操作で全図を改名: ID 欄に新しい ID を書いて Enter
  await page.locator('#prop-id').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SpiMasterDrv');
  await page.keyboard.press('Enter');
  await expect(page.locator('#prop-id')).toHaveValue('SpiMasterDrv');
  await expect(page.locator('#prop-id-note')).toContainText('2 枚で改名');
  await expect(page.locator('#status-unsaved')).toContainText('1');

  // 手順 3: 保存した図の差分は改名した行だけ(座標・サイズの行は動かない)。ID と同じだった表示名も揃う
  const dir = saveDir(testInfo);
  const saved = await saveAll(page, dir, 2);
  expect(saved.map(f => path.basename(f)).sort()).toEqual(['spi_dataflow.sb', 'spi_swc.sb']);
  const expectRenamed = (orig, out, changed) => {
    const a = read(orig).split('\n'), b = read(out).split('\n');
    expect(b.length).toBe(a.length);
    const diff = a.map((l, i) => (l === b[i] ? null : i + 1)).filter(Boolean);
    expect(diff).toEqual(changed);
    for (const n of changed) expect(b[n - 1]).toBe(a[n - 1].split('SpiDrv').join('SpiMasterDrv'));
  };
  expectRenamed(FILES[1], path.join(dir, 'spi_swc.sb'), [4, 6, 7]);
  expectRenamed(FILES[2], path.join(dir, 'spi_dataflow.sb'), [4, 6]);
  expect(read(path.join(dir, 'spi_swc.sb')).split('\n')[3]).toBe('block SpiMasterDrv "SpiMasterDrv" at 4,2 size 8x3 color=#6366F1 text=#FFFFFF round=4');
  await expect(page.locator('#status-unsaved')).toHaveCount(0);

  // 検索し直すと、ほかの図の当たりは新しい ID で並ぶ
  await page.locator('#search-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SpiMasterDrv');
  await expect(page.locator('#search-hits .sh-item')).toHaveCount(2);
  await expect(page.locator('#search-hits .sh-item').first()).toContainText('spi_dataflow.sb');

  // ↩ で全部の図の改名が 1 段で戻る
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '↩' }).click();
  expect(await getEditorText(page)).toBe(read(FILES[1]));
  await expect(page.locator('#status-unsaved')).toContainText('1');
});

// 規約が「ID は小文字・表示名はタイトルケース」のとき(BLK-primary-20260926-0950): ラベル欄 + Enter でほかの図の同じ表示名も揃い、
// 続けて ID 欄で小文字の ID に改名しても表示名は残る。2 回の入力で全図が規約どおりになり、変わる行は定義行と接続行だけ
test('primary-02: ラベル欄の Enter でほかの図の同じ表示名も揃い、ID 欄の改名と合わせて 2 回で全図が命名規約どおりになる', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, FILES);
  await page.locator('#search-input').click();
  await page.keyboard.type('SpiDrv');
  await page.locator('#search-hits .sh-item').first().click();
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  // ラベル欄の下に、Enter でほかの図の表示名も揃うことが出る。ID 欄の下には ID と同じラベルも一緒に変わることが出る
  await expect(page.locator('#prop-label-elsewhere')).toContainText('spi_dataflow.sb');
  await expect(page.locator('#prop-id-help')).toContainText('ID と同じ文字の表示名');

  // 表示名: ラベル欄に書いて Enter(表示中の図は打つたび、ほかの図は Enter で揃う)
  await page.locator('#prop-label').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SpiMasterDrv');
  await page.keyboard.press('Enter');
  await expect(page.locator('#prop-label-note')).toContainText('ほかの図 1 枚の表示名も揃えた: spi_dataflow.sb');
  await expect(page.locator('#status-unsaved')).toContainText('1');
  await expect(page.locator('#inline-label')).toHaveCount(0);        // Enter でキャンバス上のラベル編集は始まらない

  // ID: 小文字の ID に改名(表示名は旧 ID と違うので残る)
  await page.locator('#prop-id').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('spimasterdrv');
  await page.keyboard.press('Enter');
  await expect(page.locator('#prop-id-note')).toContainText('2 枚で改名');
  await expect(page.locator('#prop-label')).toHaveValue('SpiMasterDrv');

  const dir = saveDir(testInfo);
  await saveAll(page, dir, 2);
  const a1 = read(FILES[1]).split('\n'), b1 = read(path.join(dir, 'spi_swc.sb')).split('\n');
  const a2 = read(FILES[2]).split('\n'), b2 = read(path.join(dir, 'spi_dataflow.sb')).split('\n');
  const changed = (a, b) => a.map((l, i) => (l === b[i] ? null : i + 1)).filter(Boolean);
  expect(changed(a1, b1)).toEqual([4, 6, 7]);
  expect(changed(a2, b2)).toEqual([4, 6]);
  expect(b1[3]).toBe('block spimasterdrv "SpiMasterDrv" at 4,2 size 8x3 color=#6366F1 text=#FFFFFF round=4');
  expect(b2[3]).toBe('block spimasterdrv "SpiMasterDrv" at 4,14 size 8x3 color=#6366F1 text=#FFFFFF round=4');
  expect(b2[5]).toBe('spimasterdrv -> spidata');
});

// reviewer の指摘は図名(spi_swc.sb など)で来る(BLK-owner-20260926-1525-1): ステータスバーの先頭に表示中の図名と何枚目かが出て、
// 検索欄に図名を打つと当たった図が一覧の先頭に図名だけの行で並び、Enter で開く。ステータスバーの図名を押すと読み込んだ図の名前が並ぶ
test('primary-02: ステータスバーに表示中の図名が出て、検索欄に図名を打って Enter で開ける(ID を覚えていなくても図へ移れる)', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, FILES);
  const name = page.locator('#status-file');
  await expect(name).toHaveText('can_swc.sb (1/4)');

  // 図名の一部を打つと、図名の行が一覧の先頭に出る(ID・ラベルの当たりが無ければその見出しは出ない)
  await page.locator('#search-input').click();
  await page.keyboard.type('dataflow');
  const files = page.locator('#search-hits .sh-file');
  await expect(files).toHaveCount(1);
  await expect(files.first()).toHaveAttribute('data-path', 'spi_dataflow.sb');
  await expect(page.locator('#search-hits .sh-files-head')).toContainText('図名で当たった図 1 枚(押すか Enter で開く)');
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(/spi_dataflow\.sb/);
  await expect(name).toHaveText('spi_dataflow.sb (3/4)');
  await expect(page.locator('#search-input')).toHaveValue('');            // 図名は検索語に残さない(開いた図が薄くならない)
  await expect(page.locator('#search-hits')).toBeHidden();
  expect(await getEditorText(page)).toBe(read(FILES[2]));

  // フォルダの中の図も名前で当たり、押しても開く
  await page.locator('#search-input').click();
  await page.keyboard.type('common');
  await expect(files).toHaveCount(1);
  await expect(files.first()).toHaveAttribute('data-path', 'common.sb');   // 読込で選んだファイルの名前(フォルダを持つパスでも名前で当たる: unit の searchFileNames)
  await files.first().click();
  await expect(page).toHaveTitle(/common\.sb/);
  await expect(name).toHaveText('common.sb (4/4)');

  // ステータスバーの図名を押すと検索欄へ移り、ほかに読み込んだ図の名前が並ぶ。↓ で行を選んで Enter で開く
  await name.click();
  await expect(page.locator('#search-input')).toBeFocused();
  await expect(page.locator('#search-hits .sh-files-head')).toContainText('読み込んだ図 4 枚・表示中は common.sb');
  expect(await files.evaluateAll(els => els.map(e => e.dataset.path))).toEqual(['can_swc.sb', 'spi_swc.sb', 'spi_dataflow.sb']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(files.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(/spi_swc\.sb/);

  // 表示中の図に ID・ラベルの当たりがあれば、Enter は今までどおり当たりを選ぶ(図名の行は ↓ で選ぶ)
  await page.locator('#search-input').click();
  await page.keyboard.type('spi');
  await expect(files).toHaveCount(1);
  await expect(files.first()).toHaveAttribute('data-path', 'spi_dataflow.sb');
  await expect(page.locator('#search-hits .sh-files-head')).toContainText('押すか ↓ で選んで Enter で開く');
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('#prop-id')).toHaveValue('SpiDrv');
  await page.locator('#search-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');

  // 保存していない変更がある図は図名に ● が付き、名前の一覧でも分かる
  await page.locator('#svg-wrap svg g[data-type="block"][data-id="SpiDrv"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(name).toHaveText('spi_swc.sb ● (2/4)');
  await name.click();
  await page.keyboard.press('Enter');                                     // 空の欄の Enter は先頭の図を開く
  await expect(page).toHaveTitle(/can_swc\.sb/);
  await expect(name).toHaveText('can_swc.sb (1/4)');
  await name.click();
  await expect(page.locator('#search-hits .sh-file[data-path="spi_swc.sb"] .sh-unsaved')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-hits')).toBeHidden();
});
