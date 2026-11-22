// Composition Root: the only file that builds the layers and wires them together. It starts the page.
// Builds the Connector, hands it to the Manager, and hands Manager, Service and Transformer to the Client.
import { openBoard } from './connector.ts';
import { createManager } from './manager.ts';
import * as service from './service.ts';
import { toDisplay } from './transformer.ts';
import { hasDocument, startClient } from './client.ts';

async function main(): Promise<void> {
  const board = await openBoard();
  startClient({ manager: board && createManager(board), service, toDisplay, now: Date.now });
}

if (hasDocument()) void main();
