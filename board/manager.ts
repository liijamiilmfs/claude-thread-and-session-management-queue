// Manager: the Service's only way to the stored rows. It is handed a Connector by main.ts. Depends on Connector (type) and Model. (ADR-0001 section 5)
import type { ExpiredIds, StoredDoc } from './model.ts';
import type { Board } from './connector.ts';

export type Manager = {
  watchRows(onRows: (docs: StoredDoc[]) => void, onError: (code: string) => void): void;
  markRowSeen(docId: string): void;
  removeRows(docIds: ExpiredIds): Promise<void>;
};

export function createManager(board: Board): Manager {
  return { watchRows: board.subscribe, markRowSeen: board.markSeen, removeRows: board.deleteRows };
}
