import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loading the script under Node must not touch the document.
test('importing the client touches no document', async () => {
  assert.equal(typeof document, 'undefined');
  await import('./client.ts');
});
