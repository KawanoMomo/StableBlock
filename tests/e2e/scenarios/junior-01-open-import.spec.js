// junior 手順 1: 先輩(primary)の .sb を GUI の Import で開き、構成を眺める。
// 開いた図のブロック・グループの数が DSL の行数と一致し、本文欄に DSL がそのまま出ていること。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, importFolder, getEditorText, FIXTURES } = require('./_scenario');

const SENPAI = path.join(FIXTURES, 'primary-spi_swc.sb');

test('junior-01: 先輩の .sb を Import で開くと、ブロック数が DSL と一致する', async ({ page }) => {
  const text = fs.readFileSync(SENPAI, 'utf8');
  const count = kw => text.split('\n').filter(l => new RegExp(`^\\s*${kw}\\s`).test(l)).length;

  await bootPlain(page);
  await importSb(page, SENPAI);

  expect(await getEditorText(page)).toBe(text.replace(/\r\n/g, '\n'));
  // 読めない行・存在しない参照(error)は無い。手本には線の横切りの warn があるのでエラー表示欄そのものは出うる
  await expect(page.locator('#error-bar .diag-error')).toHaveCount(0);
  await expect(page.locator('#status')).not.toContainText('Err:');
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(count('block'));
  await expect(svg.locator('g[data-type="group"]')).toHaveCount(count('group'));
  // note も既定で描かれている(注釈の表示を切り替えなくても見える)
  expect(count('note')).toBe(1);
  await expect(svg.locator('g[data-type="note"]')).toHaveCount(count('note'));
  await expect(svg.locator('g[data-type="note"][data-id="memo"]')).toBeVisible();
  expect(count('block')).toBe(8);

  // 眺める: 手本のブロックをクリックすると選択され、プロパティパネルにその名前が出る
  await svg.locator('g[data-type="block"][data-id="spi_d"]').click();
  await expect(page.locator('#prop-content #prop-id')).toHaveValue('spi_d');
});

// 眺める: 1 グリッド間隔で並んだ block の間のラベルも、block の下に隠れず読める(block より上に白地で描かれ、block の名前・他のラベルに掛からない)
test('junior-01: 詰めて並べた図の接続ラベルが全部 block より上に見え、名前にも互いにも重ならない', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, path.join(FIXTURES, 'owner-critique2-swc.sb'));
  const svg = page.locator('#svg-wrap svg');
  const labels = svg.locator('g.conn-label');
  await expect(labels).toHaveCount(10);
  const r = await page.evaluate(() => {
    const svg = document.querySelector('#svg-wrap svg');
    const all = [...svg.querySelectorAll('g[data-type="block"], g.conn-label')];
    const lastBlock = all.map(e => e.matches('g.conn-label')).lastIndexOf(false);
    const firstLabel = all.findIndex(e => e.matches('g.conn-label'));
    const box = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const labels = [...svg.querySelectorAll('g.conn-label')].map(g => ({ text: g.textContent, box: box(g.querySelector('rect')) }));
    const names = [...svg.querySelectorAll('g[data-type="block"] text')].map(t => ({ text: t.textContent, box: box(t) }));
    const hits = [];
    labels.forEach((l, i) => {
      for (const n of names) if (ov(l.box, n.box) > 4) hits.push(`${l.text} が ${n.text} に掛かる`);
      for (let j = 0; j < i; j++) if (ov(l.box, labels[j].box) > 4) hits.push(`${l.text} が ${labels[j].text} に掛かる`);
    });
    return { order: firstLabel > lastBlock, hits, texts: labels.map(l => l.text) };
  });
  expect(r.order, 'ラベルが block より先(下)に描かれている').toBe(true);
  expect(r.hits).toEqual([]);
  expect(r.texts.sort()).toEqual(['cfg', 'ch', 'done', 'init', 'irq', 'next', 'req', 'start', 'tc', 'write']);
  // 隠れていないのでラベルの警告は出ない(本文は読み込んだまま)
  await expect(page.locator('#error-bar')).not.toContainText('ラベル');
});

// 手順 1 は担当の図と共通部を毎回 1 枚ずつ選び直さず、フォルダを 1 回選べば済む(BLK-junior-20260926-1705-wish)。
// 配下の .sb を全部読み(.mmd・.txt・隠しフォルダの下は読まない)、@include を相対パスで解き、ほかの図から取り込まれていない図が本文に出る
const FOLDER = path.join(FIXTURES, 'junior-folder');

test('junior-01: 「.sb 読込 ▾」でフォルダを 1 回選ぶと、担当の図と共通部が一緒に読まれ include のエラーが出ない', async ({ page }) => {
  await bootPlain(page);
  await page.getByRole('button', { name: '.sb 読込' }).click();
  await expect(page.locator('#open-menu [role="menuitem"]')).toHaveText(['ファイルを選ぶ', 'フォルダを選ぶ']);
  await expect(page.locator('#open-menu [role="menuitem"]').first()).toBeFocused();
  await page.keyboard.press('Escape');                                         // Esc で閉じる
  await expect(page.locator('#open-menu')).toBeHidden();

  await importFolder(page, FOLDER, path.join(FOLDER, 'spi_dataflow.sb'));     // パスの順で最初の、取り込まれていない図
  await expect(page).toHaveTitle(/spi_dataflow\.sb/);
  await expect(page.locator('#error-bar')).not.toContainText('include');
  await expect(page.locator('#error-bar .diag-error')).toHaveCount(0);
  await expect(page.locator('#status')).not.toContainText('Err:');
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"][data-id="rte"]')).toHaveCount(1);   // 共通部の RTE が解決されて描かれる
  // 読んだのは .sb の 3 枚だけ(一括 ▾ の見出しに枚数が出る)
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu-head')).toHaveText('読み込んだ全部の図(3 枚)');
  await page.keyboard.press('Escape');
  // もう 1 枚の担当の図は検索欄の図名から開け、こちらも共通部が解決される
  await page.locator('#search-input').fill('spi_swc');
  await page.locator('#search-hits .sh-file[data-path="spi_swc.sb"]').click();
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  expect(await getEditorText(page)).toBe(fs.readFileSync(path.join(FOLDER, 'spi_swc.sb'), 'utf8'));
  await expect(page.locator('#error-bar')).not.toContainText('include');
  await expect(svg.locator('g[data-type="block"][data-id="hal"]')).toHaveCount(1);
});

// ドロップはファイルを実マウスで運べないので、プレビューに drop イベントを送って確かめる(フォルダの辿り方は unit の folderSbEntries と同じ規則)
test('junior-01: プレビューへ .sb を落とすと「.sb 読込」と同じに読み、.sb 以外は読まない', async ({ page }) => {
  await bootPlain(page);
  const texts = Object.fromEntries(['spi_swc.sb', 'spi_dataflow.mmd', 'shared/common.sb'].map(f => [f.split('/').pop(), fs.readFileSync(path.join(FOLDER, f), 'utf8')]));
  await page.evaluate(async t => {
    const dt = new DataTransfer();
    for (const [name, text] of Object.entries(t)) dt.items.add(new File([text], name));
    const area = document.getElementById('preview-area');
    area.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    area.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, texts);
  await page.waitForFunction(e => typeof dsl === 'string' && dsl === e, texts['spi_swc.sb']);   // eslint-disable-line no-undef
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('#error-bar')).not.toContainText('include');
  await expect(page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]')).toHaveCount(1);
  await expect(page.locator('#drop-hint')).toBeHidden();
  expect(await page.evaluate(() => Object.keys(includeFiles).sort())).toEqual(['common.sb', 'spi_swc.sb']);   // eslint-disable-line no-undef
});
