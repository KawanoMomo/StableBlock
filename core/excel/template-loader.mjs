import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKELETON_DIR = join(__dirname, 'template-skeleton');

const FILES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/_rels/sheet1.xml.rels',
  'xl/drawings/_rels/drawing1.xml.rels'
];

export function loadTemplateFiles() {
  const map = {};
  for (const f of FILES) {
    map[f] = readFileSync(join(SKELETON_DIR, f), 'utf8');
  }
  return map;
}
