// porter 手順 5: 何も変えずに Export → .sb で保存し、元のファイルとバイト単位で一致する(改行・インデント・コメント・空行・文字コード)。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, exportSb, saveDir, FIXTURES } = require('./_scenario');

const SRC = path.join(FIXTURES, 'porter-roundtrip.sb');

test('porter-05: Import → 無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const original = fs.readFileSync(SRC);
  expect(original.includes('\r\n')).toBe(true);   // 往復で CRLF が落ちないことも見る

  await bootPlain(page);
  await importSb(page, SRC);
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(4);

  const { file, bytes } = await exportSb(page, saveDir(testInfo));
  expect(path.extname(file)).toBe('.sb');
  expect(bytes.equals(original), `保存した ${file} が元と違う`).toBe(true);
});
