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

  // 結ぶ前: 入口はクリックした順の「a → b」1 ボタンだけ(3 つ以上の「a → b → c」と同じ場所・同じ形。向き違いの「b → a」は無く、
  // 向きは結んだ後に「⇄ 反転」で変える)。色点で結ぶ入口も無い(BLK-owner-20260926-1009-prune)
  await expect(props.getByText('色を指定して接続')).toHaveCount(0);
  await expect(props.getByRole('button', { name: 'dma → app' })).toHaveCount(0);
  await expect(props.locator('#chain-btn')).toHaveText('app → dma');
  await expect(props.locator('#chain-btn')).toHaveAttribute('title', /⇄ 反転/);   // 向きの変え方はボタンのツールチップ
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

test('junior-02: 3 個以上をクリックした順に選ぶと鎖状に結べ、結んだ直後にラベルを順に打てる(Enter で次へ)。右ボタンのドラッグでも 1 本結べる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);
  const props = page.locator('#prop-content');
  const before = await getEditorText(page);

  // クリックした順(b1 → b2 → b3 → b4)。入口は 2 個の「a → b」と同じ場所・同じ形
  await block(page, 'b1').click();
  for (const id of ['b2', 'b3', 'b4']) await block(page, id).click({ modifiers: ['Shift'] });
  await expect(status(page)).toContainText('Selected: 4');
  await props.getByRole('button', { name: 'b1 → b2 → b3 → b4', exact: true }).click();
  await expect(status(page)).toContainText('Conn: 3');
  // 本文は接続の行が本数ぶん末尾に足されるだけ
  expect(await getEditorText(page)).toBe(before.trimEnd() + '\nb1 -> b2\nb2 -> b3\nb3 -> b4\n');

  // 結んだ直後は 1 本目のラベル欄にフォーカス。打って Enter で次の接続へ、最後の Enter でキャンバスへ戻る
  await expect(page.locator('.link-label[data-i="0"]')).toBeFocused();
  await page.keyboard.type('req');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');                        // 2 本目はラベル無し
  await page.keyboard.type('done');
  await page.keyboard.press('Enter');
  expect(await getEditorText(page)).toContain('b1 -> b2 "req"\nb2 -> b3\nb3 -> b4 "done"');
  await expect(page.locator('.link-label')).toHaveCount(3);
  await expect(page.locator('#prop-content input:focus')).toHaveCount(0);

  // 既にある組は二重に足さない(b4 → b3 は b3 -> b4 があるので足さない)。キャンバスで Enter でも結べる
  await block(page, 'b8').click();
  for (const id of ['b4', 'b3']) await block(page, id).click({ modifiers: ['Shift'] });
  await expect(props.getByRole('button', { name: 'b8 → b4 → b3', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Conn: 4');
  expect(await getEditorText(page)).toMatch(/b3 -> b4 "done"\nb8 -> b4\n$/);

  // 2 個の「a → b」も結んだ直後にラベル欄へ。打って Enter で確定
  await block(page, 'b5').click();
  await block(page, 'b6').click({ modifiers: ['Shift'] });
  await props.getByRole('button', { name: 'b5 → b6', exact: true }).click();
  await expect(page.locator('#conn-label-input')).toBeFocused();
  await page.keyboard.type('cfg');
  await page.keyboard.press('Enter');
  expect(await getEditorText(page)).toMatch(/b5 -> b6 "cfg"\n$/);
  await expect(page.locator('#prop-content input:focus')).toHaveCount(0);

  // Ctrl+A(順が決まらない選び方)では鎖の入口を出さない
  await page.keyboard.press('Control+a');
  await expect(status(page)).toContainText('Selected: 8');
  await expect(props.locator('#chain-btn')).toHaveCount(0);
  // 右ボタンで block から block へドラッグすると 1 本結べ、そのままラベルを打てる(クリック 1 回で 1 本)
  await page.keyboard.press('Escape');
  const center = async id => { const bb = await block(page, id).locator('rect').first().boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  const p6 = await center('b6'), p7 = await center('b7');
  await page.mouse.move(p6.x, p6.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(p7.x, p7.y, { steps: 5 });
  await expect(page.locator('#link-ghost')).toHaveCount(1);          // ドラッグ中は点線で行き先を示す
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#link-ghost')).toHaveCount(0);
  await expect(page.locator('#conn-label-input')).toBeFocused();
  await page.keyboard.type('seq');
  expect(await getEditorText(page)).toMatch(/b6 -> b7 "seq"\n$/);
  await expect(status(page)).toContainText('Selected: 2');
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

  // group の「+ 中にブロック」を 8 回。毎回 group を選び直す(ラベルの帯をクリック。角は選択中のリサイズハンドル)
  for (let i = 0; i < 8; i++) {
    const before = await getEditorText(page);
    await page.locator(`#svg-wrap svg g[data-type="group"][data-id="${gid}"]`).click({ position: { x: 40, y: 26 } });
    await expect(page.locator("#prop-id")).toHaveValue(gid);
    await page.getByRole('button', { name: '+ 中にブロック' }).click();
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
  await page.locator('#preview-area').click({ position: { x: 8, y: 8 } });   // 左端 5px は DSL 欄との境界(ドラッグで幅を変える)
  await page.keyboard.press('f');
  const fit = await page.locator('#svg-wrap svg').boundingBox();
  expect(fit.x + fit.width).toBeLessThanOrEqual(prop.x);
  await expect(page.locator('#zoom-label')).not.toHaveText('150%');
});

test('junior-02: DSL 欄・プレビュー・ツール欄の境界をドラッグで動かして幅を変えられ、開き直しても同じ幅、ダブルクリックで元の幅', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootPlain(page);
  const width = sel => page.locator(sel).evaluate(e => Math.round(e.getBoundingClientRect().width));
  const drag = async (sel, dx) => {
    const b = await page.locator(sel).boundingBox();
    const x = b.x + b.width / 2, y = b.y + 300;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 6 }); await page.mouse.up();
  };
  const ed0 = await width('#editor-panel'), pp0 = await width('#prop-panel');
  await expect(page.locator('#split-left')).toHaveAttribute('title', /ドラッグ/);

  // DSL | プレビュー を右へ 120px: DSL 欄が広がり、ツール欄はそのまま
  await drag('#split-left', 120);
  expect(Math.abs(await width('#editor-panel') - (ed0 + 120))).toBeLessThanOrEqual(2);
  expect(await width('#prop-panel')).toBe(pp0);
  // プレビュー | ツール欄 を左へ 100px: ツール欄が広がる
  await drag('#split-right', -100);
  expect(Math.abs(await width('#prop-panel') - (pp0 + 100))).toBeLessThanOrEqual(2);
  // 寄せすぎてもプレビューは潰れない(最小幅 240px が残る)
  await drag('#split-left', 2000);
  expect(await width('#preview-panel')).toBeGreaterThanOrEqual(238);
  await drag('#split-left', -2000);
  expect(await width('#editor-panel')).toBeGreaterThanOrEqual(160);
  // ←/→ キーでも動く(キャンバスの矢印キー移動にはならない)
  const before = await width('#editor-panel');
  await page.locator('#split-left').focus();
  await page.keyboard.press('ArrowRight');
  expect(await width('#editor-panel')).toBe(before + 16);

  // 開き直しても同じ幅
  const ed1 = await width('#editor-panel'), pp1 = await width('#prop-panel');
  await page.reload();
  await expect(page.locator('#svg-wrap svg')).toBeVisible();
  expect(await width('#editor-panel')).toBe(ed1);
  expect(await width('#prop-panel')).toBe(pp1);

  // ダブルクリックで既定の幅に戻る
  await page.locator('#split-right').dblclick();
  expect(await width('#editor-panel')).toBe(ed0);
  expect(await width('#prop-panel')).toBe(pp0);
});

test('junior-02: ID は作図 UI で決める(ラベルに追従し、プロパティ欄の ID で変えると接続も追従する)', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  // ツールバーの「ID補正」は仮の ID のままの要素にラベルから ID を一括で付ける(BLK-human-20260926-2045-4 で戻した。1 つずつの改名は ID 欄)
  await expect(page.getByRole('button', { name: 'ID補正' })).toHaveAttribute('title', /仮の ID\(__new_\)のままの要素に、ラベルから ID を一括で付ける/);

  // 新しい block はラベルを打つと ID がその表記のまま付く(大文字と _ を落とさない)
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  const label = props.locator('.prop-section', { hasText: 'ラベル' }).locator('input');
  await label.fill('');
  await label.pressSequentially('Spi_Api');
  await expect(props.locator('#prop-id')).toHaveValue('Spi_Api');
  await expect(props.locator('#prop-id')).toBeVisible();                   // 名前がまだ無かった要素は ID 欄が開いている
  await expect(props.locator('#prop-id-now')).toHaveText('Spi_Api');
  await expect.poll(() => getEditorText(page)).toMatch(/^block Spi_Api "Spi_Api" at /m);

  // 読み込んだ図の block はラベルを変えても ID は動かない。ID 欄で変えると定義行と接続の参照だけが変わる
  await svg.locator('g[data-type="block"][data-id="spi_d"]').click();
  const before = (await getEditorText(page)).split('\n');
  const id = props.locator('#prop-id');
  await expect(id).toHaveValue('spi_d');
  // ID 欄は普段は畳まれて今の ID だけが見え、「ID:」を押すと開く(開いたら選び直しても開いたまま)
  await expect(props.locator('#prop-id-now')).toHaveText('spi_d');
  await expect(id).toBeHidden();
  await props.locator('#prop-id-box > summary').click();
  await expect(id).toBeVisible();
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
  await expect(props.locator('#prop-id-now')).toHaveText('Spi_Driver');
  await svg.locator('g[data-type="block"][data-id="dma"]').click();
  await expect(props.locator('#prop-id')).toBeVisible();
  await svg.locator('g[data-type="block"][data-id="Spi_Driver"]').click();

  // 既にある ID には変えられない
  await props.locator('#prop-id').fill('dma');
  await props.locator('#prop-id').press('Enter');
  await expect(props.locator('#prop-id-msg')).toContainText('既に使われています');
  await expect(props.locator('#prop-id')).toBeFocused();                   // 使えない ID なら欄に残って打ち直せる

  // 英数字の無いラベル(日本語の部品名)からは ID を作れない。キャンバス上でラベルを打って Enter すると、その場で ID 欄へ移り、
  // 打って Enter で ID が付く(BLK-junior-20260926-0950-wish: 何も知らせず __new_ のまま確定していた)
  const inline = page.locator('#inline-label');
  const bar = page.locator('#error-bar');
  await page.keyboard.press('Escape');
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  const n1 = await props.locator('#prop-id').inputValue();
  expect(n1).toMatch(/^__new_\d+$/);
  await svg.locator(`g[data-type="block"][data-id="${n1}"]`).dblclick();
  await expect(inline).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('通信管理');
  await page.keyboard.press('Enter');
  await expect(inline).toHaveCount(0);
  await expect(props.locator('#prop-id')).toBeFocused();
  await expect(props.locator('#prop-id-help')).toContainText('ラベルから ID を作れない');
  await expect(bar).toContainText(`block「${n1}」(「通信管理」)はまだ仮の ID`);
  await page.keyboard.type('Com_Mgr');
  await page.keyboard.press('Enter');
  await expect.poll(() => getEditorText(page)).toMatch(/^block Com_Mgr "通信管理" at /m);
  await expect(props.locator('#prop-id-now')).toHaveText('Com_Mgr');
  await expect(bar).not.toContainText('仮の ID');

  // プロパティ欄のラベル欄の Enter でも同じ。Esc で後回しにでき(ID は仮のまま、打ちかけは捨てる)、残った仮の ID はエラー欄に行番号付きで出る
  await page.keyboard.press('Escape');
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  const n2 = await props.locator('#prop-id').inputValue();
  await label.fill('監視');
  await label.press('Enter');
  await expect(props.locator('#prop-id')).toBeFocused();
  await page.keyboard.type('Wd');
  await page.keyboard.press('Escape');
  const lines = (await getEditorText(page)).split('\n');
  const at = lines.findIndex(l => l.startsWith(`block ${n2} "監視" at `)) + 1;
  expect(at).toBeGreaterThan(0);
  expect(lines.some(l => /^block Wd /.test(l))).toBe(false);
  await expect(bar.locator('.diag-warn', { hasText: `L${at}: block「${n2}」(「監視」)はまだ仮の ID` })).toHaveCount(1);
  // 英数字を含むラベルは今どおり自動で ID が付き、ID 欄へは移らない
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  await label.fill('SPI ドライバ');
  await label.press('Enter');
  await expect(props.locator('#prop-id-now')).toHaveText('SPI');
  await expect(props.locator('#prop-id')).not.toBeFocused();

  // 貼り付けた要素は仮の ID のまま。「ID補正」1 回でラベルの表記の ID が付き(重なれば _2)、英数字の無いラベルの要素は仮のまま残ると知らせる
  await svg.locator('g[data-type="block"][data-id="SPI"]').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect.poll(() => getEditorText(page)).toMatch(/^block __new_\d+ "SPI ドライバ" at /m);
  const beforeFix = (await getEditorText(page)).split('\n');
  await page.getByRole('button', { name: 'ID補正' }).click();
  await expect.poll(() => getEditorText(page)).toMatch(/^block SPI_2 "SPI ドライバ" at /m);
  const afterFix = (await getEditorText(page)).split('\n');
  expect(afterFix.filter((l, i) => l !== beforeFix[i])).toEqual([afterFix.find(l => l.startsWith('block SPI_2 '))]);   // 変わるのは定義行だけ
  const report = page.locator('#export-report');
  await expect(report).toContainText('ID補正: 1 件');
  await expect(report).toContainText('→ SPI_2');
  await expect(report).toContainText('付けられなかった 1 件(「監視」)');
  expect(afterFix.some(l => l.startsWith(`block ${n2} "監視"`))).toBe(true);
  await report.click();
  await expect(report).toBeHidden();
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
  await props.getByRole('button', { name: /中にブロック/ }).click();              // group 欄の追加
  await expect(props.locator('#dup-hint')).toHaveAttribute('title', /Ctrl\+C → Ctrl\+V/);   // 複製の入口は種類の見出しのツールチップ
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
  await w.press('Enter');                                                         // 数値の欄は Enter・Tab・欄から出たときに確定する
  await page.keyboard.press('Escape');                                            // ツール欄に戻る
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  await page.keyboard.press('Escape');
  await props.getByRole('button', { name: '+ ブロック追加' }).click();

  const bs = boxesOf(await page.locator('#editor').inputValue());
  expect(bs).toHaveLength(3);
  expect(new Set(bs.map(b => `${b.w}x${b.h} ${b.color}`)).size).toBe(1);
  expect(bs[0].w).toBe(6);                                                        // W 欄に打った 6 を引き継ぐ
  expect(bs.map(b => b.y)).toEqual([bs[0].y, bs[0].y, bs[0].y]);                  // 同じ行
  expect(bs[1].x).toBe(bs[0].x + bs[0].w + 1);                                    // 右隣(1 グリッド空ける)
  expect(bs[2].x).toBe(bs[1].x + bs[1].w + 1);
});

// ─── 入れ子の group: 親の中で「選択をグループ化」「+ 中にブロック」「移動」をしても子は親の内側に収まり、
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

  // 新しい group のラベルを書き換えて Enter した直後でも、同じ欄の「+ 中にブロック」が効く
  await props.getByRole('button', { name: '+ グループ追加' }).click();
  await label().fill('ECU');
  await label().press('Enter');
  await expect(props.locator('#prop-id')).toHaveValue('ECU');
  await props.getByRole('button', { name: '+ 中にブロック' }).click();
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(1);
  await label().fill('CPU');
  for (const name of ['RAM', 'Flash']) {
    await selectGroup('ECU');
    await props.getByRole('button', { name: '+ 中にブロック' }).click();
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

  // 子 group を持つ親に「+ 中にブロック」: 子 group の中にも枠の上にも置かれず、親の直下に入る
  for (const name of ['CAN_Trcv', 'EEPROM']) {
    await selectGroup('ECU');
    await props.getByRole('button', { name: '+ 中にブロック' }).click();
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

// 「+ 中にブロック」で広がった group は、下のほかの group に掛からない(BLK-human-20260926-2045-1)。
// 掛かる group は中身ごと、元の隙間を保って押し出す(同じ親の中で子 group が広がったときと同じ)
test('junior-02: group にブロックを足し続けて group が広がっても、ほかの group に重ならず、下の group は中身ごと押し出される', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  const label = () => props.locator('.prop-section', { hasText: 'ラベル' }).locator('input');
  const selectGroup = id => svg.locator(`g[data-type="group"][data-id="${id}"]`).click({ position: { x: 30, y: 8 } });

  // group を 3 つ(空き位置に左から並び、3 つ目は 1 つ目の下へ折り返す)。3 つ目には block を 1 つ入れておく
  for (const name of ['A', 'B', 'C']) {
    await props.getByRole('button', { name: '+ グループ追加' }).click();
    await label().fill(name);
    await label().press('Enter');
    await expect(props.locator('#prop-id')).toHaveValue(name);
    await selectGroup(name);
    await page.keyboard.press('Escape');                                 // 選択を外してツール欄へ戻る
    await expect(page.locator('#prop-title')).toHaveText('ツール');
  }
  await selectGroup('C');
  await props.getByRole('button', { name: '+ 中にブロック' }).click();
  await label().fill('X');
  await expect(props.locator('#prop-id')).toHaveValue('X');
  let all = boxes(await getEditorText(page));
  const gap = all.C.y - (all.A.y + all.A.h);
  expect(gap, JSON.stringify(all)).toBeGreaterThanOrEqual(1);           // C は A の真下
  expect(hits({ ...all.A, h: all.A.h + 20 }, all.C)).toBe(true);
  const xInC = { dx: all.X.x - all.C.x, dy: all.X.y - all.C.y };

  // A に 6 個足す: A は下へ広がるが C に掛からず、C は X ごと元の隙間を保って下がる。B(A の右)は動かない
  const b0 = { ...all.B };
  for (let i = 0; i < 6; i++) {
    await selectGroup('A');
    await props.getByRole('button', { name: '+ 中にブロック' }).click();
    await label().fill(`a${i}`);
    await expect(props.locator('#prop-id')).toHaveValue(`a${i}`);
    all = boxes(await getEditorText(page));
    expect(hits(all.A, all.C), `${i + 1} 個目で A が C に掛かる ${JSON.stringify([all.A, all.C])}`).toBe(false);
    expect(hits(all.A, all.B), `${i + 1} 個目で A が B に掛かる`).toBe(false);
    expect(parentOf(all, `a${i}`)).toBe('A');
  }
  expect(all.A.h).toBeGreaterThan(8);
  expect(all.C.y - (all.A.y + all.A.h)).toBe(gap);
  expect({ dx: all.X.x - all.C.x, dy: all.X.y - all.C.y }).toEqual(xInC);
  expect(parentOf(all, 'X')).toBe('C');
  expect(all.B).toEqual(b0);
  await expect(page.locator('#error-bar')).not.toContainText('重なって');
});

// 入れ子の子 group に足して兄弟を押し出しても、兄弟は外側の group の外へ出ず、外側の group が広がる(BLK-owner-20260928-2255-1)。
// 「+ 中にブロック」と Ctrl+C → Ctrl+V の両方で
test('junior-02: 入れ子の子 group に足して兄弟の block を押し出しても、押し出された block は外側の group の中に残る', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  const label = () => props.locator('.prop-section', { hasText: 'ラベル' }).locator('input');
  const selectGroup = id => svg.locator(`g[data-type="group"][data-id="${id}"]`).click({ position: { x: 30, y: 8 } });
  const block = id => svg.locator(`g[data-type="block"][data-id="${id}"]`);

  await props.getByRole('button', { name: '+ グループ追加' }).click();
  await label().fill('ECU');
  await label().press('Enter');
  await expect(props.locator('#prop-id')).toHaveValue('ECU');
  const names = ['Cpu', 'Spi0', 'Can0', 'Adc0', 'Pmic', 'Wdg'];
  for (const name of names) {
    await selectGroup('ECU');
    await props.getByRole('button', { name: '+ 中にブロック' }).click();
    await label().fill(name);
    await expect(props.locator('#prop-id')).toHaveValue(name);
  }
  await block('Cpu').click();
  for (const id of ['Spi0', 'Can0', 'Adc0']) await block(id).click({ modifiers: ['Shift'] });
  await props.getByRole('button', { name: '選択をグループ化' }).click();
  await label().fill('MCU');
  await expect(props.locator('#prop-id')).toHaveValue('MCU');
  const grouped = await getEditorText(page);
  let all = boxes(grouped);
  expect(parentOf(all, 'MCU')).toBe('ECU');
  for (const id of ['Pmic', 'Wdg']) expect(parentOf(all, id), `${id} の親`).toBe('ECU');
  const check = (all, when) => {
    expect(hits(all.MCU, all.Pmic) || hits(all.MCU, all.Wdg), `${when}: MCU が Pmic・Wdg に掛かる`).toBe(false);
    for (const id of ['Pmic', 'Wdg']) expect(within(all[id], all.ECU, 1), `${when}: ${id} が ECU の外 ${JSON.stringify([all.ECU, all[id]])}`).toBe(true);
    expect(within(all.MCU, all.ECU, 1), `${when}: MCU が ECU の外`).toBe(true);
    for (const id of ['Pmic', 'Wdg']) expect(parentOf(all, id), `${when}: ${id} の親`).toBe('ECU');
  };

  // MCU に「+ 中にブロック」: MCU が下へ広がり Pmic・Wdg を押し出す → ECU も広がり、Pmic・Wdg は ECU の中に残る
  await selectGroup('MCU');
  await props.getByRole('button', { name: '+ 中にブロック' }).click();
  await label().fill('Ram');
  await expect(props.locator('#prop-id')).toHaveValue('Ram');
  all = boxes(await getEditorText(page));
  expect(parentOf(all, 'Ram')).toBe('MCU');
  expect(all.ECU.h).toBeGreaterThan(boxes(grouped).ECU.h);
  check(all, '+ 中にブロック');
  await expect(page.locator('#error-bar')).not.toContainText('枠をまたいでいる');

  // グループ化した直後の本文に戻して、MCU の中の Spi0 を Ctrl+C → Ctrl+V でも同じ
  await page.locator('#editor').fill(grouped);
  await expect(block('Ram')).toHaveCount(0);
  await block('Spi0').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect.poll(async () => Object.keys(boxes(await getEditorText(page))).length).toBe(Object.keys(boxes(grouped)).length + 1);
  all = boxes(await getEditorText(page));
  const pasted = Object.keys(all).find(id => !(id in boxes(grouped)));
  expect(parentOf(all, pasted)).toBe('MCU');
  check(all, 'Ctrl+V');
  await expect(page.locator('#error-bar')).not.toContainText('枠をまたいでいる');
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
  await page.getByRole('button', { name: '+ 中にブロック' }).click();
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
// 1 つ選んで文字を打つとラベルの編集になり、単キーのショートカット(L・N・H・F)で本文や表示が変わらない(BLK-owner-20260927-0728-2)
test('junior-02: 追加した直後にそのまま名前を打つとラベルになり、L・N・H・F を含む名前でも本文の @canvas 行や注釈の表示が変わらない', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  const canvasLine = async () => (await getEditorText(page)).split('\n').find(l => l.startsWith('@canvas'));
  const labels = async () => [...(await getEditorText(page)).matchAll(/^block \S+ "([^"]*)"/gm)].map(m => m[1]);
  const c0 = await canvasLine();
  const anno = page.locator('#anno-btn');
  const annoClass = await anno.getAttribute('class');

  // 追加 → そのまま打つ → Enter: ラベルが打った名前になる(F で全体表示・L で線の形・N で注釈・H で薄めが走らない)
  for (const name of ['Filter Logic', 'Nvm Hal']) {
    await props.getByRole('button', { name: '+ ブロック追加' }).click();
    await page.keyboard.type(name);
    await expect(page.locator('#inline-label')).toHaveValue(name);
    await page.keyboard.press('Enter');
    await expect.poll(labels).toContain(name);
    await page.keyboard.press('Escape');                              // Enter の後に ID 欄へ移った場合も含めて選択を外す
    await page.keyboard.press('Escape');
  }
  expect(await labels()).not.toContain('New Block');
  expect(await canvasLine()).toBe(c0);
  expect(await anno.getAttribute('class')).toBe(annoClass);
  await expect(page.locator('#hl-btn')).not.toHaveClass(/tb-hl-active/);

  // 選んだ block に打つと、そのラベルを打った文字で置き換える(Esc で取り消せば元のまま)
  const first = svg.locator('g[data-type="block"]').first();
  await first.click();
  await page.keyboard.type('Logger');
  await page.keyboard.press('Escape');
  expect(await labels()).toContain('Filter Logic');
  expect(await canvasLine()).toBe(c0);

  // 2 つ選んでいるときの L は本文を書き換えない。何も選んでいないときの L は今どおり線の形を切り替える
  await first.click();
  await svg.locator('g[data-type="block"]').nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('l');
  expect(await canvasLine()).toBe(c0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#prop-title')).toHaveText('ツール');
  await page.keyboard.press('l');
  await expect.poll(canvasLine).toMatch(/route=/);
});

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

test('junior-02: プロパティ欄の X / Y / W / H の ▲ は 1 つ選択でも複数選択でも値を 1 増やし、矢印キーは画面の向きのまま', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  const step = (field, dir) => props.locator(`div:has(> .prop-sub:text-is("${field}")) .step-btn.${dir}`);
  const line = id => getEditorText(page).then(t => t.split('\n').map(l => l.replace(/\s+/g, ' ')).find(l => l.startsWith(`block ${id} `)));

  // 1 つ選択: X ▲ → x+1、Y ▲ → y+1、W ▲ → w+1、H ▼ → h-1
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await step('X', 'up').click();
  await expect.poll(() => line('app')).toContain('at 3,3 size 9x3');
  await step('Y', 'up').click();
  await expect.poll(() => line('app')).toContain('at 3,4 size 9x3');
  await step('W', 'up').click();
  await step('H', 'dn').click();
  await expect.poll(() => line('app')).toContain('at 3,4 size 10x2');

  // 複数選択: 同じ ▲ が同じ向き(X ▲ で両方 x+1、Y ▲ で両方 y+1、W ▲ で両方 w+1)
  await svg.locator('g[data-type="block"][data-id="dma"]').click({ modifiers: ['Shift'] });
  await expect(props).toContainText('2個のアイテムを選択中');
  await step('X', 'up').click();
  await step('Y', 'up').click();
  await step('W', 'up').click();
  await expect.poll(() => line('app')).toContain('at 4,5 size 11x2');
  await expect.poll(() => line('dma')).toContain('at 14,9 size 10x3');
  await step('X', 'dn').click();
  await step('Y', 'dn').click();
  await expect.poll(() => line('app')).toContain('at 3,4 size 11x2');
  await expect.poll(() => line('dma')).toContain('at 13,8 size 10x3');

  // 矢印キーは画面の向き(↑ で上 = y-1、→ で右 = x+1)。▲▼ とは別
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => line('app')).toContain('at 4,3 size 11x2');
  await expect.poll(() => line('dma')).toContain('at 14,7 size 10x3');
});

// プロパティ欄の数値・色の欄は打っている間は本文に書かず、Enter・Tab・欄から出たときに 1 回だけ書く(BLK-owner-20260927-0728-1)
test('junior-02: プロパティ欄の W・H・色・角丸にキーボードで 2 桁以上を打て、Enter・Tab・欄から出たときに 1 回で確定し、Ctrl+Z 1 回で戻る', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, BLANK);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');
  const field = f => props.locator(`[data-field="${f}"]`);
  const focused = () => page.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.field || null : null);
  const line = id => getEditorText(page).then(t => t.split('\n').find(l => l.startsWith(`block ${id} `)) || '');

  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  await props.locator('#prop-label').fill('Cpu');
  await props.locator('#prop-label').press('Enter');
  await expect.poll(() => line('Cpu')).toContain('size 8x3');

  // W にキーボードで 12: 1 文字目では書かず、Enter で 1 回。フォーカスは W に残る
  await field('w').click({ clickCount: 3 });
  await page.keyboard.type('1');
  expect(await line('Cpu')).toContain('size 8x3');
  await expect(field('w')).toBeFocused();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect.poll(() => line('Cpu')).toContain('size 12x3');
  expect(await focused()).toBe('w');

  // Tab で H へ移り、そのまま 4 と打って Tab で確定(次の欄へ進む)
  await page.keyboard.press('Tab');
  expect(await focused()).toBe('h');
  await page.keyboard.type('4');
  await page.keyboard.press('Tab');
  await expect.poll(() => line('Cpu')).toContain('size 12x4');
  expect(await focused()).toBe('color');

  // 色 #FF0000: # や桁の足りない途中では書かず(色が消えない)、6 桁が揃って書く
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#FF00');
  expect(await line('Cpu')).toMatch(/color=#3B82F6/);
  await page.keyboard.type('00');
  await expect.poll(() => line('Cpu')).toMatch(/color=#FF0000/);
  await expect(field('color')).toBeFocused();

  // 角丸に 12 と打ち、キャンバスの余白を押して欄から出ると確定する
  await field('round').click({ clickCount: 3 });
  await page.keyboard.type('12');
  expect(await line('Cpu')).toMatch(/round=4/);
  await svg.click({ position: { x: 600, y: 300 } });
  await expect.poll(() => line('Cpu')).toMatch(/round=12/);

  // 確定 1 回 = Ctrl+Z 1 回
  await page.keyboard.press('Control+z');
  await expect.poll(() => line('Cpu')).toMatch(/round=4/);
  expect(await line('Cpu')).toMatch(/size 12x4 color=#FF0000/);

  // Esc は打った値を捨てる。欄の中の ↑ は ▲ と同じく 1 押しで確定
  await svg.locator('g[data-type="block"][data-id="Cpu"]').click();
  await field('x').click({ clickCount: 3 });
  const x0 = Number(await field('x').inputValue());
  await page.keyboard.type('9');
  await page.keyboard.press('Escape');
  expect(await line('Cpu')).toContain(`at ${x0},`);
  await svg.locator('g[data-type="block"][data-id="Cpu"]').click();
  await field('w').click();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => line('Cpu')).toContain('size 13x4');
  expect(await focused()).toBe('w');

  // 打ちかけの W を残したままほかの block を押しても、打った block に入る(押した block には入らない)
  await page.keyboard.press('Escape');
  await props.getByRole('button', { name: '+ ブロック追加' }).click();
  await props.locator('#prop-label').fill('Ram');
  await props.locator('#prop-label').press('Enter');
  await expect.poll(() => line('Ram')).toMatch(/ size \d+x\d+/);
  const ramH = (await line('Ram')).match(/ size \d+x(\d+)/)[1];
  await field('w').click({ clickCount: 3 });
  await page.keyboard.type('20');
  await svg.locator('g[data-type="block"][data-id="Cpu"]').click();
  await expect.poll(() => line('Ram')).toContain(`size 20x${ramH}`);
  expect(await line('Cpu')).toContain('size 13x4');
});

test('junior-02: 資料の寸法に合わせた図は「はみ出したら自動で広げる」を外して固定でき、広がった直後は「元の寸法に戻して固定」で戻せる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SMALL);
  const canvasLine = async () => (await getEditorText(page)).split('\n').find(l => l.startsWith('@canvas'));
  const grew = page.locator('#canvas-bar #canvas-grew');   // プレビューの上端に出る(下端では見落とす。BLK-human-20260926-2045-4)
  const bar = page.locator('#error-bar');

  // 既定は自動で広げる(下端の Canvas にも「自動拡張」)。block を 1 つ置いて X に 30 を打つと広がり、下端に広げた寸法と戻す入口が出る
  const status = page.locator('#status #status-canvas');
  await expect(page.locator('#canvas-grow')).toBeChecked();
  await expect(status).toHaveText('Canvas: 400×300 自動拡張');
  await page.getByRole('button', { name: '+ ブロック追加' }).click();
  const x = page.locator('#prop-content div:has(> .prop-sub:text-is("X")) input');
  await x.fill('30');
  await x.press('Enter');
  await expect.poll(canvasLine).not.toBe('@canvas width=400 height=300 grid=20');
  await expect(grew).toContainText('400×300 →');
  await expect(bar.getByText('キャンバス')).toBeHidden();

  // 「元の寸法に戻して固定」1 回で元の寸法に戻り、本文の差分は @canvas の 1 行(grow=off)。はみ出した block はエラー欄に出て、画面にも描かれたまま
  const before = await getEditorText(page);
  await grew.getByRole('button', { name: '元の寸法に戻して固定' }).click();
  await expect.poll(canvasLine).toBe('@canvas width=400 height=300 grid=20 grow=off');
  expect(removedLines(before, await getEditorText(page))).toHaveLength(1);
  await expect(grew).toHaveCount(0);
  await expect(bar).toContainText('キャンバス(400×300)の外に右へ');
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toBeVisible();

  // 固定中は GUI の操作でも広げない(X を 31 にしても @canvas はそのまま)。ツール欄のチェックは外れている
  await x.fill('31');
  await x.press('Enter');
  await expect.poll(async () => (await getEditorText(page)).includes(' at 31,')).toBe(true);
  expect(await canvasLine()).toBe('@canvas width=400 height=300 grid=20 grow=off');
  // 設定の在りか(BLK-human-20260926-2045-3): block を選んだままでも、下端の「Canvas: 400×300 固定」を押せば選択が外れ、
  // ツール欄の「キャンバス (px)」とチェックが出てそこにフォーカスが来る
  await expect(status).toHaveText('Canvas: 400×300 固定');
  await expect(page.locator('#canvas-grow')).toHaveCount(0);
  await status.click();
  await expect(page.locator('#status')).toContainText('Selected: 0');
  await expect(page.locator('#canvas-section')).toHaveClass(/flash/);
  await expect(page.locator('#canvas-grow')).toBeFocused();
  await expect(page.locator('#canvas-grow')).not.toBeChecked();

  // はみ出しを直して(X を 2 に)チェックを戻すと grow=off が消え、元の 1 行に戻る
  await page.locator('#svg-wrap svg g[data-type="block"]').click();
  await x.fill('2');
  await x.press('Enter');
  await expect(bar.getByText('キャンバス')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('#canvas-grow').check();
  await expect.poll(canvasLine).toBe('@canvas width=400 height=300 grid=20');
  // 広げたままでよければ「このまま」で知らせを閉じる(寸法は広げたまま)
  await page.locator('#svg-wrap svg g[data-type="block"]').click();
  await x.fill('30');
  await x.press('Enter');
  await expect(grew).toContainText('400×300 →');
  await grew.getByRole('button', { name: 'このまま' }).click();
  await expect(page.locator('#canvas-bar')).toBeHidden();
  await expect.poll(canvasLine).not.toBe('@canvas width=400 height=300 grid=20');
});

// ─── __new_ のまま残った ID を検索で順に直す(BLK-junior-20260926-0609-wish) ───
const NEW_IDS = path.join(FIXTURES, 'junior-new-ids.sb');

test('junior-02: 検索欄に __new_ と打つと件数が出て、Enter で読み順に 1 つずつ選ばれ、ID 欄で直すと件数が減り 0 件で終わる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, NEW_IDS);
  const svg = page.locator('#svg-wrap svg');
  const search = page.locator('#search-input');
  const count = page.locator('#search-count');
  const id = page.locator('#prop-id');

  await search.fill('__new_');
  await expect(count).toHaveText('3 件');
  // note も検索の対象: 当たらない note は block / group と同じく薄くなる
  await expect(svg.locator('g[data-type="note"][data-id="keep"]')).toHaveAttribute('opacity', '0.2');
  await expect(svg.locator('g[data-type="note"][data-id="__new_3"]')).not.toHaveAttribute('opacity', /.+/);
  await expect(svg.locator('g[data-type="block"][data-id="app"]')).toHaveAttribute('opacity', '0.2');

  // Enter で読み順(上から、左から)に選ばれ、Shift+Enter で戻る
  await search.press('Enter');
  await expect(id).toHaveValue('__new_1');
  await search.press('Enter');
  await expect(id).toHaveValue('__new_2');
  await search.press('Shift+Enter');
  await expect(id).toHaveValue('__new_1');

  // 業務の形: Enter → ID 欄で直して Enter → 検索欄で Enter → … 0 件で終わる
  const names = ['Spi', 'Spi_Handler', 'JobNote'];
  for (let i = 0; i < names.length; i++) {
    await search.click();
    await search.press('Enter');
    await expect(id).toHaveValue(/^__new_/);
    await id.fill(names[i]);
    await id.press('Enter');
    await expect(count).toHaveText(`${2 - i} 件`);
  }
  const text = await getEditorText(page);
  expect(text.split('\n').filter(l => !l.startsWith('#')).join('\n')).not.toContain('__new_');
  expect(text).toContain('app -> ');
  await search.press('Enter');   // 当たりが無ければ何もしない
  await expect(count).toHaveText('0 件');
});
