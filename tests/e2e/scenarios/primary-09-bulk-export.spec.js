// primary 手順 9: 12 枚を設計書向けに一括で書き出す(SVG と Excel。1 枚ずつ Export を押さずに済む)。
// 「.sb 読込」で 12 枚 + 共通部を一緒に選ぶと、書き出しの並びの後ろに「一括 ▾」が出る。一括 ▾ →(読み込んだ全部の図(13 枚))の形式で、
// 1 枚ずつ @include を解決した図が 1 つの zip に入る。知らせは図の名前付きで画面右下に並ぶ(BLK-primary-20260926-1205)
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { test, expect, bootPlain, importSb, importFolder, saveDir, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-set');
const NAMES = ['spi', 'can', 'uart', 'adc', 'timer', 'gpio'].flatMap(p => [`${p}_swc`, `${p}_dataflow`]);
const FILES = [...NAMES.map(n => path.join(SET, `${n}.sb`)), path.join(SET, 'shared', 'common.sb')];

// 「一括 ▾」を押して形式を選び、zip を受け取って中身を返す(2 クリック)
async function exportAll(page, term, dir, count = 13) {
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu-head')).toHaveText(`読み込んだ全部の図(${count} 枚)`);
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
  // 「一括 ▾」が出ても、1366x768 の画面で検索中でも、ツールバーのボタン名は 2 行に折れない(BLK-owner-20260926-1227-prune)
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('#search-input').fill('Spi');
  const tall = await page.locator('#header .toolbar > button:visible').evaluateAll(bs => bs.filter(b => b.getBoundingClientRect().height > 32).map(b => b.textContent));
  expect(tall).toEqual([]);
  await page.locator('#search-input').fill('');
  await page.locator('[data-term="export-all"]').click();                    // 形式は SVG / PNG / 透過PNG / Excel / Mermaid(PNGをコピーは対象外)
  await expect(page.locator('#export-menu [role="menuitem"]')).toHaveText(['SVG', 'PNG', '透過PNG', 'Excel', 'Mermaid']);
  await page.locator('[data-term="export-all"]').click();                    // もう一度押すと閉じる
  await expect(page.locator('#export-menu')).toBeHidden();
  const dir = saveDir(testInfo);

  // SVG: 13 枚。各図は include 先(共通部の RTE・OS・HAL)を解決して描く。zip 名は図の名前から付く(主図 12 枚 + 共通部をファイルで選んだので
  // 先頭の図名と残りの枚数。共通部は数えない。BLK-junior-20260929-0605-wish)
  const svg = await exportAll(page, 'export-svg-all', dir);
  expect(svg.name).toBe('spi_swc_他11枚-svg.zip');
  const svgFiles = Object.keys(svg.zip.files).sort();
  expect(svgFiles).toEqual([...NAMES.map(n => `${n}.svg`), 'common.svg'].sort());
  const spi = await svg.zip.file('spi_swc.svg').async('string');
  expect(spi).toContain('data-id="SpiDrv"');
  expect(spi).toContain('data-id="rte"');
  expect(await svg.zip.file('adc_dataflow.svg').async('string')).toContain('data-id="adcdata"');
  const report = page.locator('#export-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('SVG: 13 枚を spi_swc_他11枚-svg.zip に書き出した');
  await expect(report).not.toContainText('書き出せなかったもの');
  await report.click();

  // Excel: 13 枚の .xlsx。接続ラベルの lpos= も画面と同じ所に載るので、書き出せなかったものは出ない(BLK-owner-20260929-0405-3)
  const xlsx = await exportAll(page, 'export-xlsx-all', dir);
  expect(xlsx.name).toBe('spi_swc_他11枚-xlsx.zip');
  expect(Object.keys(xlsx.zip.files).sort()).toEqual([...NAMES.map(n => `${n}.xlsx`), 'common.xlsx'].sort());
  const book = await JSZip.loadAsync(await xlsx.zip.file('timer_swc.xlsx').async('uint8array'));
  const drawing = await book.file('xl/drawings/drawing1.xml').async('string');
  expect(drawing).toContain('name="block:TimerDrv"');
  expect(drawing).toContain('name="block:rte"');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Excel: 13 枚を spi_swc_他11枚-xlsx.zip に書き出した');
  await expect(report).not.toContainText('書き出せなかったもの');
  const uart = await JSZip.loadAsync(await xlsx.zip.file('uart_dataflow.xlsx').async('uint8array'));
  expect(await uart.file('xl/drawings/drawing1.xml').async('string')).toMatch(/name="connlabel:\d+"/);

  // 次に開くと前回の形式(Excel)が印付きで先頭に出てフォーカスがあり、残りは元の順(BLK-junior-20260926-1705-wish)
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  const items = page.locator('#export-menu [role="menuitem"]');
  await expect(items.first()).toHaveAttribute('data-term', 'export-xlsx-all');
  await expect(items.first()).toBeFocused();
  await expect(items.first().locator('.em-mark')).toHaveText('前回');
  await expect(page.locator('#export-menu .em-mark')).toHaveCount(1);
  expect(await items.evaluateAll(bs => bs.map(b => b.dataset.fmt))).toEqual(['xlsx', 'svg', 'png', 'png-transparent', 'mermaid']);

  // 選択は Esc と外側のクリックで閉じ、何も書き出さない
  await page.keyboard.press('Escape');
  await expect(page.locator('#export-menu')).toBeHidden();
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.locator('#svg-wrap').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#export-menu')).toBeHidden();
});

// 別の図の組を続けて Excel 一括にしても、zip 名は図の名前から付くので前の zip を上書きしない(BLK-junior-20260929-0605-wish)。
// 主図が 1 枚なら「{図名}-{形式}.zip」、フォルダで読んだならフォルダ名。書き出し後の知らせの zip 名も同じ
test('primary-09: uart_swc と uart_dataflow を別々に(共通部と)読んで続けて Excel 一括にすると、図の名前の別の zip が 2 つ出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  const dir = saveDir(testInfo);
  const report = page.locator('#export-report');
  const COMMON = path.join(SET, 'shared', 'common.sb');

  await importSb(page, [path.join(SET, 'uart_swc.sb'), COMMON]);
  const swc = await exportAll(page, 'export-xlsx-all', dir, 2);
  expect(swc.name).toBe('uart_swc-xlsx.zip');
  expect(Object.keys(swc.zip.files).sort()).toEqual(['common.xlsx', 'uart_swc.xlsx']);
  await expect(report).toContainText('Excel: 2 枚を uart_swc-xlsx.zip に書き出した');
  await report.click();

  await importSb(page, [path.join(SET, 'uart_dataflow.sb'), COMMON]);
  const flow = await exportAll(page, 'export-xlsx-all', dir, 2);
  expect(flow.name).toBe('uart_dataflow-xlsx.zip');
  expect(Object.keys(flow.zip.files).sort()).toEqual(['common.xlsx', 'uart_dataflow.xlsx']);
  await expect(report).toContainText('Excel: 2 枚を uart_dataflow-xlsx.zip に書き出した');
  expect(fs.existsSync(path.join(dir, 'uart_swc-xlsx.zip'))).toBe(true);      // 1 つ目は残っている
  await report.click();

  // 「フォルダを選ぶ」で組を読んだなら、主図が 2 枚以上でもフォルダ名で区別できる
  await importFolder(page, SET, path.join(SET, 'adc_dataflow.sb'));
  const set = await exportAll(page, 'export-svg-all', dir);
  expect(set.name).toBe('primary-set-svg.zip');
  await expect(report).toContainText('SVG: 13 枚を primary-set-svg.zip に書き出した');
});
