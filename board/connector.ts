// Connector: the only file that calls the page database. Depends on Model only. (ADR-0001 section 5)
import type { StoredDoc, StoredRow } from './model.ts';

type Db = {
  collection(name: string): { onSnapshot(ok: (snap: { docs: { id: string; data(): StoredRow | undefined }[] }) => void, fail: (e: { code?: string }) => void): void };
  doc(path: string): { update(data: object): Promise<unknown>; delete(): Promise<unknown> };
};

export type Board = {
  subscribe(onRows: (docs: StoredDoc[]) => void, onError: (code: string) => void): void;
  markSeen(docId: string): void;
  deleteRows(docIds: string[]): Promise<void>;
};

export async function openBoard(): Promise<Board | null> {
  const db: Db | null = (await (globalThis as any).claude?.use?.('db')) ?? null;
  if (!db) return null;
  const inFlight = new Set<string>(); // each deletion changes the list, so skip ids already being deleted
  return {
    subscribe: (onRows, onError) => db.collection('turns').onSnapshot(
      snap => onRows(snap.docs.map(d => ({ id: d.id, row: d.data() ?? {} }))),
      e => onError(e?.code ?? 'error')),
    markSeen: docId => { db.doc('turns/' + docId).update({ seen_at: new Date().toISOString() }).catch(() => {}); },
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
