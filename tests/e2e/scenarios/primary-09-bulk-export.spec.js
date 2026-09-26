// primary 手順 9: 12 枚を設計書向けに一括で書き出す(SVG と Excel。1 枚ずつ Export を押さずに済む)。
// 「.sb 読込」で 12 枚 + 共通部を一緒に選ぶと、書き出しの並びの後ろに「一括 ▾」が出る。一括 ▾ →(読み込んだ全部の図(13 枚))の形式で、
// 1 枚ずつ @include を解決した図が 1 つの zip に入る。知らせは図の名前付きで画面右下に並ぶ(BLK-primary-20260926-1205)
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { test, expect, bootPlain, importSb, saveDir, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-set');
const NAMES = ['spi', 'can', 'uart', 'adc', 'timer', 'gpio'].flatMap(p => [`${p}_swc`, `${p}_dataflow`]);
const FILES = [...NAMES.map(n => path.join(SET, `${n}.sb`)), path.join(SET, 'shared', 'common.sb')];

// 「一括 ▾」を押して形式を選び、zip を受け取って中身を返す(2 クリック)
async function exportAll(page, term, dir) {
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu-head')).toHaveText('読み込んだ全部の図(13 枚)');
  const item = page.locator(`#export-menu [data-term="${term}"]`);
  await expect(item).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = path.join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  await expect(page.locator('#export-menu')).toBeHidden();
  return { name: dl.suggestedFilename(), zip: await JSZip.loadAsync(fs.readFileSync(file)) };
}

test('primary-09: 12 枚 + 共通部を読み込むと、SVG と Excel を「一括 ▾」から 1 つの zip に書き出せる', async ({ page }, testInfo) => {
  await bootPlain(page);
  await expect(page.locator('.tb-more:visible')).toHaveCount(0);              // 1 枚だけのときは出ない(書き出しは今までと同じ 1 クリック)
  await importSb(page, FILES);
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('.tb-more:visible')).toHaveCount(1);
  await page.locator('[data-term="export-all"]').click();                    // 形式は SVG / PNG / 透過PNG / Excel / Mermaid(PNGをコピーは対象外)
  await expect(page.locator('#export-menu [role="menuitem"]')).toHaveText(['SVG', 'PNG', '透過PNG', 'Excel', 'Mermaid']);
  await page.locator('[data-term="export-all"]').click();                    // もう一度押すと閉じる
  await expect(page.locator('#export-menu')).toBeHidden();
  const dir = saveDir(testInfo);

  // SVG: 13 枚。各図は include 先(共通部の RTE・OS・HAL)を解決して描く
  const svg = await exportAll(page, 'export-svg-all', dir);
  expect(svg.name).toBe('diagrams-svg.zip');
  const svgFiles = Object.keys(svg.zip.files).sort();
  expect(svgFiles).toEqual([...NAMES.map(n => `${n}.svg`), 'common.svg'].sort());
  const spi = await svg.zip.file('spi_swc.svg').async('string');
  expect(spi).toContain('data-id="SpiDrv"');
  expect(spi).toContain('data-id="rte"');
  expect(await svg.zip.file('adc_dataflow.svg').async('string')).toContain('data-id="adcdata"');
  const report = page.locator('#export-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('SVG: 13 枚を diagrams-svg.zip に書き出した');
  await expect(report).not.toContainText('書き出せなかったもの');
  await report.click();

  // Excel: 13 枚の .xlsx。表せないもの(lpos=)は図の名前付きで知らせる
  const xlsx = await exportAll(page, 'export-xlsx-all', dir);
  expect(xlsx.name).toBe('diagrams-xlsx.zip');
  expect(Object.keys(xlsx.zip.files).sort()).toEqual([...NAMES.map(n => `${n}.xlsx`), 'common.xlsx'].sort());
  const book = await JSZip.loadAsync(await xlsx.zip.file('timer_swc.xlsx').async('uint8array'));
  const drawing = await book.file('xl/drawings/drawing1.xml').async('string');
  expect(drawing).toContain('name="block:TimerDrv"');
  expect(drawing).toContain('name="block:rte"');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Excel: 13 枚を diagrams-xlsx.zip に書き出した');
  await expect(report).toContainText('Excel に書き出せなかったもの(1 件)');
  await expect(report).toContainText('uart_dataflow.sb: 接続 uartdata -> rte の lpos=top');

  // 選択は Esc と外側のクリックで閉じ、何も書き出さない
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#export-menu')).toBeHidden();
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.locator('#svg-wrap').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#export-menu')).toBeHidden();
});
