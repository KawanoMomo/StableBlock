import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pxToEmu, gridToEmu } from '../emitter.js';

test('pxToEmu: 1 px = 9525 EMU', () => {
  assert.equal(pxToEmu(1), 9525);
});

test('pxToEmu: handles zero and negative', () => {
  assert.equal(pxToEmu(0), 0);
  assert.equal(pxToEmu(-1), -9525);
});

test('pxToEmu: rounds fractional pixels', () => {
  assert.equal(pxToEmu(0.5), 4762);
});

test('gridToEmu: 1 grid at grid=20 = 20 px = 190500 EMU', () => {
  assert.equal(gridToEmu(1, 20), 190500);
});

test('gridToEmu: 5 grids at grid=20 = 100 px = 952500 EMU', () => {
  assert.equal(gridToEmu(5, 20), 952500);
});
