// Proves Node runs TypeScript tests natively, with no build step.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('TypeScript runs without a build step', () => {
  const answer: number = 1 + 1;
  assert.equal(answer, 2);
});
