import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortByZOrder } from '../emitter.js';

test('sortByZOrder: groups < connections < connection-labels < blocks < notes', () => {
  const items = [
    { kind: 'note', id: 'n1', srcIndex: 0 },
    { kind: 'block', id: 'b1', srcIndex: 0 },
    { kind: 'connection', id: 'c1', srcIndex: 0 },
    { kind: 'group', id: 'g1', srcIndex: 0 },
    { kind: 'connlabel', id: 'cl1', srcIndex: 0 },
  ];
  const sorted = sortByZOrder(items);
  assert.deepEqual(sorted.map(s => s.kind), [
    'group', 'connection', 'connlabel', 'block', 'note'
  ]);
});

test('sortByZOrder: stable on srcIndex within same kind', () => {
  const items = [
    { kind: 'block', id: 'b3', srcIndex: 2 },
    { kind: 'block', id: 'b1', srcIndex: 0 },
    { kind: 'block', id: 'b2', srcIndex: 1 },
  ];
  const sorted = sortByZOrder(items);
  assert.deepEqual(sorted.map(s => s.id), ['b1', 'b2', 'b3']);
});
