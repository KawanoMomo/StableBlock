import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDSL } from '../../dsl/dsl-core.mjs';
import { toMermaid, mermaidLabel, mermaidIds } from '../mermaid-core.mjs';

// owner の批評の図(group 1 / block 8 / note 1 / 接続 3、うち 1 本ラベル付き・1 本色付き)
const CRITIQUE = `@canvas width=960 height=520 grid=20
group spi_driver "SPI Driver" at 5,5 size 20x18 color=#F1F5F9 border=#94A3B8
block spiapi "Spi_Api" at 6,7 size 8x3 color=#3B82F6 text=#FFFFFF round=4
block spicfg "Spi_Cfg" at 15,7 size 8x3 color=#3B82F6 text=#FFFFFF round=4
block spijob "Spi_Job" at 6,11 size 8x3 color=#3B82F6 text=#FFFFFF round=4
block spiseq "Spi_Seq" at 15,11 size 8x3 color=#3B82F6 text=#FFFFFF round=4
block spihw "Spi_Hw" at 6,15 size 8x3 color=#3B82F6 text=#FFFFFF round=4
block spiirq "Spi_Irq" at 15,15 size 8x3 color=#3B82F6 text=#FFFFFF round=4
block spidma "Spi_Dma" at 6,19 size 8x3 color=#EF4444 text=#FFFFFF round=4
block spidet "Spi_Det" at 15,19 size 8x3 color=#3B82F6 text=#FFFFFF round=4
spiseq -> spihw "frame"
spiapi -> spidet
spicfg -> spihw color=#1E293B
note memo "SPI は DMA 転送を既定にする" at 30,5 size 8x2 color=#FEF3C7 text=#92400E
memo -> spidma
`;

const lines = t => t.split('\n');

test('toMermaid: block・group・note・接続・ラベルが全部残る', () => {
  const { text } = toMermaid(parseDSL(CRITIQUE));
  const L = lines(text);
  assert.equal(L[0], 'flowchart TD');
  assert.ok(L.includes('  subgraph spi_driver["SPI Driver"]'));
  for (const id of ['spiapi', 'spicfg', 'spijob', 'spiseq', 'spihw', 'spiirq', 'spidma', 'spidet']) {
    assert.ok(L.some(l => new RegExp(`^    ${id}\\("Spi_`).test(l)), `block ${id} が subgraph の中に無い`);
  }
  assert.ok(L.includes('  memo>"SPI は DMA 転送を既定にする"]'), 'note が旗形のノードで残る');
  assert.ok(L.includes('  spiseq -->|"frame"| spihw'));
  assert.ok(L.includes('  spiapi --> spidet'));
  assert.ok(L.includes('  memo -.-> spidma'), 'note との接続は点線');
});

test('toMermaid: 色は style / linkStyle で残る', () => {
  const { text } = toMermaid(parseDSL(CRITIQUE));
  assert.match(text, /^  style spidma fill:#EF4444,stroke:#EF4444,color:#FFFFFF$/m);
  assert.match(text, /^  style spi_driver fill:#F1F5F9,stroke:#94A3B8$/m);
  assert.match(text, /^  style memo fill:#FEF3C7,stroke:#D97706,color:#92400E,stroke-dasharray:5 3$/m);
  assert.match(text, /^  linkStyle 2 stroke:#1E293B,stroke-width:1.5px$/m);   // spicfg -> spihw は 3 本目
});

test('toMermaid: 表せないものは dropped に出る(座標、存在しない ID への接続)', () => {
  const { text, dropped } = toMermaid(parseDSL(CRITIQUE + 'spiapi -> zz\n'));
  assert.ok(!/zz/.test(text), '存在しない ID のノードを勝手に作らない');
  assert.ok(dropped.some(d => d.includes('spiapi -> zz') && d.includes('zz が図に無い')));
  assert.ok(dropped.some(d => d.startsWith('座標・大きさ')));
});

test('toMermaid: route= と lpos= は落ちたことを数えて知らせる', () => {
  const { dropped } = toMermaid(parseDSL('block a "A" at 1,1 size 4x2\nblock b "B" at 8,1 size 4x2\na -> b "x" route=ortho lpos=top\n'));
  assert.ok(dropped.some(d => d.includes('route=') && d.includes('1 本')));
});

test('toMermaid: 双方向・破線・入れ子の group・空の group', () => {
  const src = `group outer "Outer" at 0,0 size 30x20
group inner "Inner" at 1,2 size 12x8
group empty "Empty" at 20,2 size 6x4
block a "A" at 2,4 size 4x2 round=0
block b "B" at 14,4 size 4x2 style=dashed
a --> b
a -> b style=dashed
`;
  const { text } = toMermaid(parseDSL(src));
  const L = lines(text);
  const i = s => L.indexOf(s);
  assert.ok(i('  subgraph outer["Outer"]') < i('    subgraph inner["Inner"]'));
  assert.ok(i('    subgraph inner["Inner"]') < i('      a["A"]'), 'round=0 は四角');
  assert.ok(i('    subgraph empty["Empty"]') > 0, '空の group も残す');
  assert.ok(L.includes('  a <--> b'));
  assert.ok(L.includes('  a -.-> b'));
  assert.match(text, /^  style b .*stroke-dasharray:5 3/m);
});

test('mermaidLabel: 改行と記号', () => {
  assert.equal(mermaidLabel('Spi\\nDriver'), 'Spi<br/>Driver');
  assert.equal(mermaidLabel('a<b>#1'), 'a#lt;b#gt;#35;1');
});

test('mermaidIds: Mermaid の予約語・記号入りの ID は置き換えて知らせる', () => {
  const { map, renamed } = mermaidIds(['end', 'spi-drv', 'ok_1', 'sb_end']);
  assert.equal(map.ok_1, 'ok_1');
  assert.equal(map.sb_end, 'sb_end');
  assert.equal(map.end, 'sb_end_2');
  assert.equal(map['spi-drv'], 'sb_spi_drv');
  assert.equal(renamed.length, 2);
  const { text, dropped } = toMermaid(parseDSL('block end "End" at 1,1 size 4x2\nblock s "S" at 8,1 size 4x2\ns -> end\n'));
  assert.ok(text.includes('s --> sb_end'));
  assert.ok(dropped.some(d => d.includes('ID end')));
});
