// Composition Root: the only file that builds the layers and wires them together. It starts the page.
// Builds Connector, Manager and Service, and hands only the Service to the Client.
import { openBoard } from './connector.ts';
import { createManager } from './manager.ts';
import { createService } from './service.ts';
import { toDisplay } from './transformer.ts';
import { hasDocument, startClient } from './client.ts';

async function main(): Promise<void> {
  const board = await openBoard();
  const manager = board && createManager(board);
  startClient({ service: manager && createService({ manager, toDisplay, now: Date.now }) });
}

if (hasDocument()) void main();
