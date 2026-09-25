// junior 手順 2: 作図 UI だけで図を作る(本文欄には触らない)。接続は「ブロックを選んで結ぶ」。
// 接続を作る入口は 2 つ選んだときの「a → b」だけ(ID を打つ from/to 欄と「色を指定して接続」は畳んだ)。色は結んだ後に「線の色」で変える。
const path = require('node:path');
const { test, expect, bootPlain, importSb, getEditorText, exportSb, saveDir, FIXTURES } = require('./_scenario');

const SENPAI = path.join(FIXTURES, 'primary-spi_swc.sb');

test('junior-02: 2 つ選んで「a → b」で結び、結んだ後に線の色を変える', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');

  // 何も選んでいない: ID を打つ入口は無く、選んで結ぶ入口への案内が 1 行ある
  await expect(props.locator('#conn-from')).toHaveCount(0);
  await expect(props.locator('#conn-to')).toHaveCount(0);
  await expect(props.getByRole('button', { name: '接続追加' })).toHaveCount(0);
  await expect(props.locator('#conn-guide')).toContainText('a → b');

  // 2 つ選ぶ(クリック → Shift+クリック)
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await svg.locator('g[data-type="block"][data-id="dma"]').click({ modifiers: ['Shift'] });
  await expect(props).toContainText('2個のアイテムを選択中');

  // 結ぶ前: 入口は「a → b」「b → a」の 2 ボタンだけで、色点で結ぶ入口は無い
  await expect(props.getByText('色を指定して接続')).toHaveCount(0);
  const before = await getEditorText(page);
  await props.getByRole('button', { name: 'app → dma' }).click();

  // 本文の差分は色の無い 1 行だけ
  const after = await getEditorText(page);
  expect(after.startsWith(before.trimEnd())).toBe(true);
  expect(after.slice(before.trimEnd().length).trim()).toBe('app -> dma');

  // 結んだ後: 接続パネルの「線の色」で色を付ける
  await expect(props).toContainText('線の色');
  const colorRow = props.locator('.prop-sub', { hasText: '線の色' }).locator('xpath=following-sibling::div[1]');
  await colorRow.locator('.color-dot').nth(4).click();   // #EF4444
  await expect.poll(() => getEditorText(page)).toMatch(/^app -> dma color=#EF4444$/m);
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(8);
});

test('junior-02: 注釈は block と同じ 1 手で置け、そのまま選んで動かせ、全選択 → Delete で消える', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');

  // 注釈だけを触るモード(ツールバーの「✎ 編集」)は無い。何も選んでいないツール欄の「+ 注釈追加」1 回で note が入り、選択されている
  await expect(page.locator('#anno-edit-btn')).toHaveCount(0);
  await expect(page.locator('#header')).not.toContainText('✎');
  await props.getByRole('button', { name: '+ 注釈追加' }).click();
  const added = svg.locator('g[data-type="note"][data-id^="__new_"]');
  await expect(added).toHaveCount(1);
  await expect(props.locator('#prop-id')).toHaveValue(/^__new_/);

  // 通常モードのまま block も note も選べる
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await expect(props.locator('#prop-id')).toHaveValue('app');
  await svg.locator('g[data-type="note"][data-id="memo"]').click();
  await expect(props.locator('#prop-id')).toHaveValue('memo');

  // note をドラッグで動かせる(本文の note 行の座標が変わる)
  const box = await svg.locator('g[data-type="note"][data-id="memo"] rect').first().boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 70, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => getEditorText(page)).not.toMatch(/^note memo "Job 単位で排他" at 35,3 /m);

  // Ctrl+A → Delete で note も含めて空になる
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(svg.locator('g[data-type="block"], g[data-type="group"], g[data-type="note"]')).toHaveCount(0);
  expect(await getEditorText(page)).not.toMatch(/^\s*note\s/m);
});

// ─── 選択: 2 つ選んで結ぶ操作を 10 本続けても、毎回 2 個選択から結べる(BLK-owner-20260925-1921-2) ───
const SRC = path.join(FIXTURES, 'junior-8blocks.sb');
const PAIRS = [['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b1', 'b5'], ['b5', 'b6'], ['b6', 'b7'], ['b7', 'b8'], ['b2', 'b6'], ['b3', 'b7'], ['b4', 'b8']];

const block = (page, id) => page.locator(`#svg-wrap svg g[data-type="block"][data-id="${id}"]`);
const status = page => page.locator('#status');

test('junior-02: 8 block に 10 本、毎回 2 個選択の状態から結べる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(8);

  for (const [i, [x, y]] of PAIRS.entries()) {
    await block(page, x).click();                          // 選択済み(前の組の 2 つ目)でも、その 1 つに置き換わる
    await expect(status(page)).toContainText('Selected: 1');
    await block(page, y).click({ modifiers: ['Shift'] });
    await expect(status(page)).toContainText('Selected: 2');
    await expect(page.locator('#prop-title')).toHaveText('2個選択中');
    await page.getByRole('button', { name: `${x} → ${y}`, exact: true }).click();
    await expect(status(page)).toContainText(`Conn: ${i + 1}`);
  }
  const text = await page.locator('#editor').inputValue();
  for (const [x, y] of PAIRS) expect(text).toContain(`${x} -> ${y}`);
});

test('junior-02: Esc とプレビューの余白クリックで選択が外れる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);

  await block(page, 'b1').click();
  await block(page, 'b2').click({ modifiers: ['Shift'] });
  await expect(status(page)).toContainText('Selected: 2');
  await page.keyboard.press('Escape');
  await expect(status(page)).toContainText('Selected: 0');
  await expect(page.locator('#prop-title')).toHaveText('ツール');

  // キャンバスの外(プレビュー欄の暗い余白)をクリック
  await block(page, 'b3').click();
  await expect(status(page)).toContainText('Selected: 1');
  const svgBox = await page.locator('#svg-wrap svg').boundingBox();
  const area = await page.locator('#preview-area').boundingBox();
  const mx = svgBox.x + 20, my = svgBox.y + svgBox.height + 40;
  expect(my).toBeLessThan(area.y + area.height - 20);        // 余白が画面にある
  await page.mouse.click(mx, my);
  await expect(status(page)).toContainText('Selected: 0');
  await expect(page.locator('#prop-title')).toHaveText('ツール');
});

test('junior-02: 本文から消えた要素はプロパティ欄と選択から消える', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);

  await block(page, 'b7').click();
  await block(page, 'b8').click({ modifiers: ['Shift'] });
  await expect(status(page)).toContainText('Selected: 2');
  const editor = page.locator('#editor');
  const drop = id => editor.inputValue().then(t => t.split('\n').filter(l => !l.startsWith(`block ${id} `)).join('\n'));
  await editor.fill(await drop('b8'));
  await expect(status(page)).toContainText('Selected: 1');
  await expect(page.locator('#prop-id')).toHaveValue('b7');
  await editor.fill(await drop('b7'));
  await expect(status(page)).toContainText('Selected: 0');
  await expect(page.locator('#prop-title')).toHaveText('ツール');
  await expect(page.locator('#prop-id')).toHaveCount(0);
});

test('junior-02: ドラッグは複数選択のまま全部動き、動かさずに離したクリックだけが 1 つに絞る', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);

  await block(page, 'b1').click();
  await block(page, 'b2').click({ modifiers: ['Shift'] });
  const box = await block(page, 'b2').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 45, { steps: 5 });   // 2 グリッド下へ
  await page.mouse.up();
  await expect(status(page)).toContainText('Selected: 2');
  const text = await page.locator('#editor').inputValue();
  const y1 = +text.match(/block b1 "Spi_Api"\s+at 1,(\d+) /)[1], y2 = +text.match(/block b2 "Spi_Hw"\s+at 10,(\d+) /)[1];
  expect(y1).toBeGreaterThan(1);
  expect(y2).toBe(y1);                                         // 2 つとも同じだけ動いた

  // 動かさずに離す(クリック)と、押した 1 つに絞られる
  await block(page, 'b2').click();
  await expect(status(page)).toContainText('Selected: 1');
  await expect(page.locator('#prop-id')).toHaveValue('b2');
});

// ─── キャンバス: 置いた要素は全部キャンバス内に描かれ(はみ出せば @canvas の 1 行だけが広がる)、「全体表示」で画面に全体を収めて見られる(BLK-owner-20260925-1921-1) ───
const SMALL = path.join(FIXTURES, 'junior-small-canvas.sb');

// 描かれている block / group / note の矩形が全部 SVG のキャンバス(viewBox)に収まっているか
async function outsideCanvas(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#svg-wrap svg');
    const [, , cw, ch] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const out = [];
    svg.querySelectorAll('g[data-id] > rect').forEach(r => {
      const x = +r.getAttribute('x'), y = +r.getAttribute('y'), w = +r.getAttribute('width'), h = +r.getAttribute('height');
      if (x < 0 || y < 0 || x + w > cw || y + h > ch) out.push(r.parentElement.dataset.id);
    });
    return out;
  });
}

// 本文の行の差分(消えた行)。追加した行は数えない
function removedLines(before, after) {
  const a = new Set(after.split('\n'));
  return before.split('\n').filter(l => !a.has(l));
}

async function rects(page, type) {
  return page.evaluate(t => [...document.querySelectorAll(`#svg-wrap svg g[data-type="${t}"] > rect`)].map(r => ({
    id: r.parentElement.dataset.id, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'),
  })), type);
}

test('junior-02: group と block を作図 UI だけで置くと、キャンバスが広がり全部が描かれる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SMALL);
  expect(await getEditorText(page)).toContain('@canvas width=400 height=300 grid=20');

  // group を 1 つ
  await page.getByRole('button', { name: '+ グループ追加' }).click();
  const group = page.locator('#svg-wrap svg g[data-type="group"]');
  await expect(group).toHaveCount(1);
  const gid = await group.getAttribute('data-id');
  expect(await outsideCanvas(page)).toEqual([]);

  // group の「+ グループ内にブロック追加」を 8 回。毎回 group を選び直す(ラベルの帯をクリック。角は選択中のリサイズハンドル)
  for (let i = 0; i < 8; i++) {
    const before = await getEditorText(page);
    await page.locator(`#svg-wrap svg g[data-type="group"][data-id="${gid}"]`).click({ position: { x: 40, y: 26 } });
    await expect(page.locator("#prop-id")).toHaveValue(gid);
    await page.getByRole('button', { name: '+ グループ内にブロック追加' }).click();
    await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(i + 1);
    // 全部キャンバス内に描かれる
    expect(await outsideCanvas(page), `${i + 1} 個目の追加後`).toEqual([]);
    // 既存の行で変わるのは @canvas 行と、伸びた group の行だけ
    const changed = removedLines(before, await getEditorText(page));
    for (const l of changed) expect(l, `変わった行: ${l}`).toMatch(new RegExp(`^(@canvas |group ${gid} )`));
  }
  const text = await getEditorText(page);
  const canvasLine = text.split('\n').find(l => l.startsWith('@canvas'));
  expect(canvasLine).not.toBe('@canvas width=400 height=300 grid=20');   // 広がった
  expect(canvasLine).toMatch(/^@canvas width=\d+ height=\d+ grid=20$/);   // 属性の並びはそのまま

  // トップの「+ ブロック追加」を 3 回: 同じ位置に重ねず、既存の要素とも重ならない
  for (let i = 0; i < 3; i++) {
    await page.locator('#prop-content button', { hasText: '✕' }).click();   // 選択を外してツール欄に戻る
    await page.getByRole('button', { name: '+ ブロック追加' }).click();
  }
  const blocks = await rects(page, 'block');
  const groups = await rects(page, 'group');
  expect(blocks).toHaveLength(11);
  const tops = blocks.slice(-3);
  const inside = (c, p) => c.x >= p.x && c.y >= p.y && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h;
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const t of tops) {
    for (const o of [...blocks, ...groups]) {
      if (o.id === t.id) continue;
      expect(hit(t, o), `${t.id} が ${o.id} に重なる`).toBe(false);
    }
    expect(groups.some(g => inside(t, g)), `${t.id} が group の中に入った`).toBe(false);
  }
  expect(await outsideCanvas(page)).toEqual([]);

  // キャンバス寸法はツール欄でも変えられる(本文の差分は @canvas の 1 行)
  const beforeW = await getEditorText(page);
  await page.locator('#prop-content button', { hasText: '✕' }).click();
  const wInput = page.locator('#canvas-w');
  const w0 = +(await wInput.inputValue());
  await wInput.fill(String(w0 + 200));
  await wInput.press('Enter');
  const afterW = await getEditorText(page);
  expect(removedLines(beforeW, afterW)).toEqual([beforeW.split('\n').find(l => l.startsWith('@canvas'))]);
  expect(afterW).toContain(`@canvas width=${w0 + 200} `);

  // 全体表示: キャンバス全体がプレビュー欄に収まる
  await page.getByRole('button', { name: '全体表示' }).click();
  const area = await page.locator('#preview-area').boundingBox();
  const svgBox = await page.locator('#svg-wrap svg').boundingBox();
  expect(svgBox.x + svgBox.width).toBeLessThanOrEqual(area.x + area.width);
  expect(svgBox.y + svgBox.height).toBeLessThanOrEqual(area.y + area.height);
});

test('junior-02: 既定の図は 1600px 幅の画面でも右端がプロパティ欄に隠れず、全体表示で全体が見える', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await bootPlain(page);
  const prop = await page.locator('#prop-panel').boundingBox();
  const area = await page.locator('#preview-area').boundingBox();
  expect(area.x + area.width).toBeLessThanOrEqual(prop.x + 1);   // プレビュー欄がプロパティ欄の下に潜らない
  const svgBox = await page.locator('#svg-wrap svg').boundingBox();
  expect(svgBox.x + svgBox.width).toBeLessThanOrEqual(prop.x);   // 開いた時点で右端まで見える
  expect(svgBox.y + svgBox.height).toBeLessThanOrEqual(area.y + area.height);

  // −/+ の後に「全体表示」(F キーでも)で戻る
  await page.getByRole('button', { name: '+', exact: true }).click();
  await page.getByRole('button', { name: '+', exact: true }).click();
  await page.locator('#preview-area').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('f');
  const fit = await page.locator('#svg-wrap svg').boundingBox();
  expect(fit.x + fit.width).toBeLessThanOrEqual(prop.x);
  await expect(page.locator('#zoom-label')).not.toHaveText('150%');
});

test('junior-02: ID は作図 UI で決める(ラベルに追従し、プロパティ欄の ID で変えると接続も追従する)', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  await expect(page.getByRole('button', { name: 'ID補正' })).toHaveCount(0);

  // 新しい block はラベルを打つと ID がその表記のまま付く(大文字と _ を落とさない)
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  const label = props.locator('.prop-section', { hasText: 'ラベル' }).locator('input');
  await label.fill('');
  await label.pressSequentially('Spi_Api');
  await expect(props.locator('#prop-id')).toHaveValue('Spi_Api');
  await expect.poll(() => getEditorText(page)).toMatch(/^block Spi_Api "Spi_Api" at /m);

  // 読み込んだ図の block はラベルを変えても ID は動かない。ID 欄で変えると定義行と接続の参照だけが変わる
  await svg.locator('g[data-type="block"][data-id="spi_d"]').click();
  const before = (await getEditorText(page)).split('\n');
  const id = props.locator('#prop-id');
  await expect(id).toHaveValue('spi_d');
  await id.fill('bad id');
  await id.press('Enter');
  await expect(props.locator('#prop-id-msg')).toContainText('英数字と _');
  await id.fill('Spi_Driver');
  await id.press('Enter');
  await expect(svg.locator('g[data-type="block"][data-id="Spi_Driver"]')).toHaveCount(1);
  const after = (await getEditorText(page)).split('\n');
  expect(after.length).toBe(before.length);
  const changed = before.map((l, i) => [l, after[i]]).filter(([a, b]) => a !== b);
  expect(changed.map(([, b]) => b)).toEqual([
    'block Spi_Driver "Spi_Driver"    at 2,8  size 9x3 color=#D97706 text=#FFFFFF round=4',
    'spi_h -> Spi_Driver',
    'Spi_Driver -> dma',
    'Spi_Driver -> mcal',
  ]);
  await expect(props.locator('#prop-id')).toHaveValue('Spi_Driver');

  // 既にある ID には変えられない
  await props.locator('#prop-id').fill('dma');
  await props.locator('#prop-id').press('Enter');
  await expect(props.locator('#prop-id-msg')).toContainText('既に使われています');
});

// ─── 置く: group の中に block 8 個を同じ大きさ・同じ色で並べる(BLK-junior-20260925-1921-friction) ───
const BLANK = path.join(FIXTURES, 'junior-blank.sb');
const boxesOf = text => [...text.matchAll(/^block (\S+) "[^"]*" at (\d+),(\d+) size (\d+)x(\d+) color=(\S+)/gm)]
  .map(m => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5], color: m[6] }));

test('junior-02: group の「ブロック追加」1 回と Ctrl+C → Ctrl+V で、8 個が同じ大きさ・色で group の中に並ぶ', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');

  await props.getByRole('button', { name: /グループ追加/ }).click();
  await props.getByRole('button', { name: /ブロック追加/ }).click();              // group 欄の追加
  await expect(props.locator('#dup-hint')).toContainText('Ctrl+C → Ctrl+V');      // 複製の入口が見える
  await props.locator('.color-dot').nth(3).click();                               // 1 個目だけ色を決める
  await page.keyboard.press('Control+c');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Control+v');

  const text = await page.locator('#editor').inputValue();
  const bs = boxesOf(text);
  expect(bs).toHaveLength(8);
  expect(new Set(bs.map(b => `${b.w}x${b.h} ${b.color}`)).size).toBe(1);        // 同じ大きさ・色
  const g = text.match(/^group (\S+) "[^"]*" at (\d+),(\d+) size (\d+)x(\d+)/m).slice(2).map(Number);
  for (const b of bs) {                                                           // 全部 group の中
    expect(b.x >= g[0] && b.y >= g[1] && b.x + b.w <= g[0] + g[2] && b.y + b.h <= g[1] + g[3], `${b.id} が group の外`).toBe(true);
  }
  for (const a of bs) for (const b of bs) if (a !== b) {                          // 重ならない
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} と ${b.id} が重なる`).toBe(true);
  }
  expect(new Set(bs.map(b => b.x)).size).toBeLessThanOrEqual(4);                  // グリッドに揃う(列がそろう)
  expect(new Set(bs.map(b => b.y)).size).toBeLessThanOrEqual(4);
});

test('junior-02: ツール欄の「+ ブロック追加」は直前の block の大きさ・色を引き継ぎ、その右隣に置く', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');

  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  await props.locator('.color-dot').nth(3).click();
  const w = props.locator('.prop-label', { hasText: 'サイズ' }).locator('xpath=..').locator('input').first();
  await w.fill('6');
  await page.keyboard.press('Escape');                                            // ツール欄に戻る
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  await page.keyboard.press('Escape');
  await props.getByRole('button', { name: '+ ブロック追加' }).click();

  const bs = boxesOf(await page.locator('#editor').inputValue());
  expect(bs).toHaveLength(3);
  expect(new Set(bs.map(b => `${b.w}x${b.h} ${b.color}`)).size).toBe(1);
  expect(bs.map(b => b.y)).toEqual([bs[0].y, bs[0].y, bs[0].y]);                  // 同じ行
  expect(bs[1].x).toBe(bs[0].x + bs[0].w + 1);                                    // 右隣(1 グリッド空ける)
  expect(bs[2].x).toBe(bs[1].x + bs[1].w + 1);
});

// ─── 入れ子の group: 親の中で「選択をグループ化」「+ グループ内にブロック追加」「移動」をしても子は親の内側に収まり、
//     親に足した block は親の直下に入る。枠をまたぐ配置は警告に出る(BLK-owner-20260926-0451-1) ───
const boxes = text => Object.fromEntries([...text.matchAll(/^(block|group) (\S+) "[^"]*" at (\d+),(\d+) size (\d+)x(\d+)/gm)]
  .map(m => [m[2], { type: m[1], id: m[2], x: +m[3], y: +m[4], w: +m[5], h: +m[6] }]));
const within = (c, p, m = 0) => c.x >= p.x + m && c.y >= p.y + m && c.x + c.w <= p.x + p.w - m && c.y + c.h <= p.y + p.h - m;
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// 要素の親 = 内側に含む group のうち最も小さいもの(画面の判定と同じ)
const parentOf = (all, id) => Object.values(all).filter(g => g.type === 'group' && g.id !== id && within(all[id], g))
  .sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id ?? null;

test('junior-02: 入れ子の group を作図 UI だけで組め、子は親の内側に収まり、親に足した block は親の直下に入る', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  const label = () => props.locator('.prop-section', { hasText: 'ラベル' }).locator('input');
  const selectGroup = id => svg.locator(`g[data-type="group"][data-id="${id}"]`).click({ position: { x: 30, y: 8 } });

  // 新しい group のラベルを書き換えて Enter した直後でも、同じ欄の「+ グループ内にブロック追加」が効く
  await props.getByRole('button', { name: '+ グループ追加' }).click();
  await label().fill('ECU');
  await label().press('Enter');
  await expect(props.locator('#prop-id')).toHaveValue('ECU');
  await props.getByRole('button', { name: '+ グループ内にブロック追加' }).click();
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(1);
  await label().fill('CPU');
  for (const name of ['RAM', 'Flash']) {
    await selectGroup('ECU');
    await props.getByRole('button', { name: '+ グループ内にブロック追加' }).click();
    await label().fill(name);
  }
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(3);

  // 親の中の 2 つを「選択をグループ化」: 新しい group は親の内側に 1 グリッド以上空けて収まり、ほかの block に掛からない
  await svg.locator('g[data-type="block"][data-id="CPU"]').click();
  await svg.locator('g[data-type="block"][data-id="RAM"]').click({ modifiers: ['Shift'] });
  await props.getByRole('button', { name: '選択をグループ化' }).click();
  await label().fill('MCU');
  await expect(props.locator('#prop-id')).toHaveValue('MCU');
  let all = boxes(await getEditorText(page));
  expect(within(all.MCU, all.ECU, 1), JSON.stringify(all)).toBe(true);
  expect(hits(all.MCU, all.Flash), 'MCU が Flash に掛かる').toBe(false);
  expect(parentOf(all, 'CPU')).toBe('MCU');
  expect(parentOf(all, 'Flash')).toBe('ECU');

  // 子 group を持つ親に「+ グループ内にブロック追加」: 子 group の中にも枠の上にも置かれず、親の直下に入る
  for (const name of ['CAN_Trcv', 'EEPROM']) {
    await selectGroup('ECU');
    await props.getByRole('button', { name: '+ グループ内にブロック追加' }).click();
    await label().fill(name);
    await expect(props.locator('#prop-id')).toHaveValue(name);
    all = boxes(await getEditorText(page));
    expect(parentOf(all, name), `${name} の親`).toBe('ECU');
    expect(hits(all[name], all.MCU), `${name} が MCU に掛かる`).toBe(false);
  }

  // 子の block を矢印キーで子 group の下端より下へ: 子 group と親が広がり、兄弟は取り込まれずに押し出される
  await svg.locator('g[data-type="block"][data-id="CPU"]').click();
  const before = await getEditorText(page);
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  const after = await getEditorText(page);
  all = boxes(after);
  expect(all.CPU.y).toBe(boxes(before).CPU.y + 5);
  expect(parentOf(all, 'CPU')).toBe('MCU');
  expect(within(all.CPU, all.MCU, 1), JSON.stringify(all)).toBe(true);
  expect(within(all.MCU, all.ECU, 1), JSON.stringify(all)).toBe(true);
  for (const id of ['Flash', 'CAN_Trcv', 'EEPROM']) {
    expect(parentOf(all, id), `${id} が MCU に取り込まれた`).toBe('ECU');
    expect(hits(all[id], all.MCU), `${id} が MCU に掛かる`).toBe(false);
  }
  // 本文で変わるのは座標・大きさの行だけ(行数・順は同じ)
  expect(after.split('\n').length).toBe(before.split('\n').length);
  after.split('\n').forEach((l, i) => { if (l !== before.split('\n')[i]) expect(l).toMatch(/^(@canvas |block |group )/); });
  await expect(page.locator('#error-bar')).not.toContainText('枠をまたいでいる');

  // 枠をまたぐ配置は警告に出る(本文で group をずらした場合)
  const editor = page.locator('#editor');
  await editor.fill(after.replace(/^(group MCU "MCU" at )(\d+),/m, (m, a, x) => `${a}${+x + 6},`));
  await expect(page.locator('#error-bar')).toContainText('group「MCU」が group「ECU」');
  await expect(page.locator('#error-bar')).toContainText('枠をまたいでいる');
});

test('junior-02: 「新規」で @canvas の 1 行だけの図から始まり、見本の見出し・要素が本文に混ざらない。保存名は diagram.sb', async ({ page }, testInfo) => {
  await bootPlain(page);
  await expect(page.locator('#editor')).toHaveValue(/# Application/);          // 起動時は見本
  await page.getByRole('button', { name: '新規', exact: true }).click();
  expect(await getEditorText(page)).toBe('@canvas width=960 height=520 grid=20\n');
  await expect(page.locator('#svg-wrap svg g[data-type]')).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('Blocks: 0');

  // 作図 UI だけで group と block を置く。本文は @canvas と足した要素の行だけ
  await page.getByRole('button', { name: '+ グループ追加' }).click();
  await page.getByRole('button', { name: '+ グループ内にブロック追加' }).click();
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(1);
  const text = await getEditorText(page);
  expect(text).not.toMatch(/^# /m);
  for (const l of text.split('\n').filter(Boolean)) expect(l).toMatch(/^(@canvas |group |block )/);

  const { file } = await exportSb(page, saveDir(testInfo));
  expect(require('node:path').basename(file)).toBe('diagram.sb');

  // 前の図(見本)は ↩ で戻せる
  await page.getByRole('button', { name: '↩' }).click();
  await page.getByRole('button', { name: '↩' }).click();
  await page.getByRole('button', { name: '↩' }).click();
  await expect(page.locator('#editor')).toHaveValue(/# Application/);
});

// ─── 名付け・複製をキャンバスの上で: ダブルクリック / F2 でその場でラベルを直し、貼り付けは間の接続も複製し、
//     キャンバスを押すとフォーカスがボタンから離れる(BLK-owner-20260926-0451-4) ───
test('junior-02: ラベルはキャンバス上でダブルクリック / F2 で直せ、コピーは間の接続も複製し、押したボタンに Enter が残らない', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);
  const svg = page.locator('#svg-wrap svg');
  const b = id => svg.locator(`g[data-type="block"][data-id="${id}"]`);
  const inline = page.locator('#inline-label');

  // ダブルクリックでその場の入力欄が開き、打って Enter で確定。本文で変わるのはラベルの 1 行だけ
  const t0 = await getEditorText(page);
  await b('b1').dblclick();
  await expect(inline).toBeFocused();
  await expect(inline).toHaveValue('Spi_Api');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Spi_Main');
  await page.keyboard.press('Enter');
  await expect(inline).toHaveCount(0);
  const t1 = await getEditorText(page);
  const diff = t1.split('\n').map((l, i) => [t0.split('\n')[i], l]).filter(([a, c]) => a !== c);
  expect(diff).toHaveLength(1);
  expect(diff[0][1]).toMatch(/^block b1 "Spi_Main"\s+at 1,1 /);
  expect(diff[0][0].replace('"Spi_Api"', '"Spi_Main"')).toBe(diff[0][1]);

  // F2 でも開く。Backspace は入力欄の文字だけを消し(block は消えない)、Esc で開く前の本文に戻る
  await b('b2').click();
  await page.keyboard.press('F2');
  await expect(inline).toBeFocused();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(b('b2')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(inline).toHaveCount(0);
  expect(await getEditorText(page)).toBe(t1);

  // 続けて名付ける: Tab で確定して読み順の次の block の編集へ移る(マウスへ戻らない)
  await b('b5').dblclick();
  for (const name of ['CPU', 'RAM', 'ROM']) {
    await expect(inline).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(name);
    await page.keyboard.press(name === 'ROM' ? 'Enter' : 'Tab');
  }
  await expect(inline).toHaveCount(0);
  const named = await getEditorText(page);
  expect(named).toMatch(/^block b5 "CPU"\s+at 1,8 /m);
  expect(named).toMatch(/^block b6 "RAM"\s+at 10,8 /m);
  expect(named).toMatch(/^block b7 "ROM"\s+at 19,8 /m);
  expect(named).toMatch(/^block b8 "Spi_Det"/m);

  // 接続した 4 block を選んで Ctrl+C → Ctrl+V: block 4 個と、その間の接続が同じ属性で増える
  const pairs = [['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4']];
  for (const [x, y] of pairs) {
    await b(x).click();
    await b(y).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: `${x} → ${y}`, exact: true }).click();
  }
  await b('b1').click();
  for (const id of ['b2', 'b3', 'b4']) await b(id).click({ modifiers: ['Shift'] });
  await expect(page.locator('#status')).toContainText('Selected: 4');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(12);
  const pasted = (await getEditorText(page)).split('\n').filter(l => /^__new_\d+ -> __new_\d+$/.test(l));
  expect(pasted).toHaveLength(3);
  await expect(page.locator('#status')).toContainText('Conn: 6');

  // ツールバーのボタンを押した後にキャンバスの block を押すと、フォーカスはボタンから離れる。Enter はボタンを押し直さずラベル編集を開く
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: '.sb 保存' }).click();
  await expect.poll(() => downloads).toBe(1);
  await b('b3').click();
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BUTTON');
  await page.keyboard.press('Enter');
  await expect(inline).toBeFocused();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(downloads).toBe(1);
});
