// Manager: the Client's only way to the stored rows. Depends on Connector and Model. (ADR-0001 section 5)
import type { StoredDoc } from './model.ts';
import { openBoard } from './connector.ts';

export type Manager = {
  watchRows(onRows: (docs: StoredDoc[]) => void, onError: (code: string) => void): void;
  markRowSeen(docId: string): void;
  removeRows(docIds: string[]): Promise<void>;
};

export async function openManager(): Promise<Manager | null> {
  const board = await openBoard();
  if (!board) return null;
  return { watchRows: board.subscribe, markRowSeen: board.markSeen, removeRows: board.deleteRows };
}
