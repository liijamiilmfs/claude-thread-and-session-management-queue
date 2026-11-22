// Thread Queue row, T8 test build. Which calls owe a row, and what the row holds.
// Pure: no imports, no file, network, clock or environment. Never throws.
export const BOARD = 'https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG';
export const STATES = ['needs_you', 'review', 'finished', 'failed'];

// The longest value each row field may hold.
export const LIMITS = { title: 200, project: 200, preview: 200 };

export const threadOf = (sessionId: string): string => sessionId.replace(/^cse_/, 'session_');

type Args = Record<string, unknown>;
export type Told = { state: string; preview: string };

const isRecord = (v: unknown): v is Args => typeof v === 'object' && v !== null && !Array.isArray(v);

// The first line of what was posted that has any text, cut to the preview limit.
const firstLine = (text: unknown): string =>
  (typeof text === 'string' ? text : '').split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, LIMITS.preview) ?? '';

// What the row says for one call that told the person something. Undefined: the call owes no row.
// The state comes from which tool was called (T4, section 1). Code can never say "failed".
export function rowFor(tool: string, args: Args): Told | undefined {
  switch (tool) {
    case 'mcp__hearthbot__post_message': return { state: 'review', preview: firstLine(args.text) };
    case 'PushNotification': return { state: 'review', preview: firstLine(args.message) };
    case 'mcp__hearthbot__request_decision': return { state: 'needs_you', preview: firstLine(args.question) };
    case 'mcp__hearthbot__post_widget': {
      // A draft or a card with a button waits on the person. A chart or a plain card does not.
      const waits = /^(message_compose|writing_draft)/.test(String(args.widget)) || JSON.stringify(args.input ?? '').includes('"type":"button"');
      return { state: waits ? 'needs_you' : 'review', preview: firstLine(args.text) };
    }
    // shortcut: these three say needs_you even when the tool answers "already connected"; read the tool's answer if that shows up on the board
    case 'mcp__hearthbot__suggest_connectors': return { state: 'needs_you', preview: 'Asked you to connect an app' };
    case 'mcp__hearthbot__connect_device': return { state: 'needs_you', preview: 'Asked you to connect your computer' };
    case 'mcp__hearthbot__start_remote_control': return { state: 'needs_you', preview: 'Asked to work on your computer' };
    // Reopening a thread tells the person nothing new.
    case 'mcp__hearthbot__set_thread_resolved': return args.resolved === true ? { state: 'finished', preview: 'Resolved' } : undefined;
    // The preview stays neutral: the board must not say why the card was shown.
    case 'mcp__hearthbot__show_helpline_card': return { state: 'review', preview: 'Replied' };
    default: return undefined;
  }
}

// The one call the plugin makes: this thread's row, written to the board. Undefined without a thread id.
// A row is never held back for a title: when the lookup failed, the thread id stands in for it.
// Only the preview comes from what the thread posted. Everything else is fixed here or found by code.
export function rowCall(thread: string, at: number, told: Told, title: string, project: string) {
  if (!/^session_[A-Za-z0-9]+$/.test(thread)) return undefined;
  return {
    tool: 'ArtifactData', action: 'set', url: BOARD, collection: 'turns', doc_id: thread + '.' + at,
    data: {
      thread, title: (title || thread).slice(0, LIMITS.title), ...(project && { project: project.slice(0, LIMITS.project) }),
      state: told.state, updated_at: new Date(at).toISOString(), preview: told.preview,
      url: 'https://claude.ai/code/' + thread, gate: 't8-plugin',
    },
  };
}

// True when the row is on the board: the write went through, or the board says a row with this id is already there.
export function landed(out: { deny?: unknown; isError?: unknown; text?: unknown }): boolean {
  if (out.deny !== undefined) return false;
  return !out.isError || String(out.text).includes('already exists');
}

// Reads the title and the parent's id out of what the built-in "get_session" lookup returns.
export function sessionOf(result: unknown): { title?: string; parent?: string } {
  try {
    const blocks = isRecord(result) && !result.isError && Array.isArray(result.content) ? result.content : [];
    const text = blocks.find((b) => isRecord(b) && typeof b.text === 'string')?.text;
    const ccr = JSON.parse(text).ccr;
    return {
      ...(typeof ccr.title === 'string' && { title: ccr.title }),
      ...(typeof ccr.parent_session_id === 'string' && { parent: ccr.parent_session_id }),
    };
  } catch {
    return {};
  }
}

// A thread's parent is its project's main chat, whose title holds the project's name. Empty when it does not.
export const projectOf = (parentTitle: string | undefined): string =>
  /^Project coordinator \("(.+)"\)$/.exec(parentTitle ?? '')?.[1] ?? '';
