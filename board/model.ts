// Model: the shapes the board passes around. Imports nothing. (ADR-0001 section 5)

// A stored row. Every field but state and updated_at may be missing: older builds wrote fewer.
export type StoredRow = {
  thread?: string;
  title?: string;
  project?: string;
  state?: string;
  updated_at?: string;
  preview?: string;
  url?: string;
  build?: string;
  gate?: string;
  seen_at?: string;
};

// A stored row with its document id.
export type StoredDoc = { id: string; row: StoredRow };

export type DisplayRow = {
  docId: string;
  thread: string;
  title: string;
  project: string;
  state: string;
  stateLabel: string;
  tone: '' | 'needs' | 'ok' | 'bad';
  updatedAt: string;
  preview: string;
  link: string;
  build: string;
  unread: boolean;
};

export type Group = { label: string; rows: DisplayRow[] };

// Row ids the Service has checked and cleared for deletion. Only `expired()` makes one, and the delete functions accept nothing else.
export type ExpiredIds = readonly string[] & { readonly cleared: 'expired' };

// What the Client shows: the groups plus the counts, all worked out by the Service.
export type View = { groups: Group[]; threads: number; waiting: number; stored: number; limit: number };
