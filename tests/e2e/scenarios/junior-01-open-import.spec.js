// junior 手順 1: 先輩(primary)の .sb を GUI の Import で開き、構成を眺める。
// 開いた図のブロック・グループの数が DSL の行数と一致し、本文欄に DSL がそのまま出ていること。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, getEditorText, FIXTURES } = require('./_scenario');

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
