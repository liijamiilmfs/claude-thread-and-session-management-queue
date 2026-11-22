// Connector: the only file that calls the page database. Depends on Model only. (ADR-0001 section 5)
import type { ExpiredIds, StoredDoc, StoredRow } from './model.ts';

type Db = {
  collection(name: string): { onSnapshot(ok: (snap: { docs: { id: string; data(): StoredRow | undefined }[] }) => void, fail: (e: { code?: string }) => void): void };
  doc(path: string): { update(data: object): Promise<unknown>; delete(): Promise<unknown> };
};

// The page host puts `claude` on the global object. Declared here so no cast is needed to reach it.
declare global {
  var claude: { use?: (name: string) => Promise<unknown> } | undefined;
}

function isDb(x: unknown): x is Db {
  return typeof x === 'object' && x !== null && 'collection' in x && typeof x.collection === 'function' && 'doc' in x && typeof x.doc === 'function';
}

export type Board = {
  subscribe(onRows: (docs: StoredDoc[]) => void, onError: (code: string) => void): void;
  markSeen(docId: string): Promise<void>; // rejects when the database refuses the save
  deleteRows(docIds: ExpiredIds): Promise<void>;
};

export async function openBoard(): Promise<Board | null> {
  const db = await globalThis.claude?.use?.('db'); // null or missing when the page has no database
  if (!isDb(db)) return null; // a handle of any other shape is treated as no database
  const inFlight = new Set<string>(); // each deletion changes the list, so skip ids already being deleted
  return {
    subscribe: (onRows, onError) => db.collection('turns').onSnapshot(
      snap => onRows(snap.docs.map(d => ({ id: d.id, row: d.data() ?? {} }))),
      e => onError(e?.code ?? 'error')),
    markSeen: async docId => { await db.doc('turns/' + docId).update({ seen_at: new Date().toISOString() }); },
    // Board rows only: every path is in the turns collection of this page's own database.
    deleteRows: async docIds => {
      for (const id of docIds) {
        if (inFlight.has(id)) continue;
        inFlight.add(id);
        await db.doc('turns/' + id).delete().catch(() => inFlight.delete(id)); // a failed id may be tried again later
      }
    },
  };
}
