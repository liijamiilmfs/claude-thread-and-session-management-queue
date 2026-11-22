import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loading the scripts under Node must not touch the document or start anything.
test('importing main and the client touches no document', async () => {
  assert.equal(typeof document, 'undefined');
  await import('./client.ts');
  await import('./main.ts');
});
