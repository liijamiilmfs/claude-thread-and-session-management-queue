// Transformer: reads outside text. The model's raw reply and the get_session lookup's raw reply stop here.
// Pure: no `$`, no file, network, clock or environment. It never throws. Only the Gateway section of register.ts calls it.
import type { LookAnswer, Session } from './row.ts';

// The raw replies, as the Connector hands them over. Named and wrapped, so neither can pass as plain text.
export type RawLook = { readonly look: unknown };
export type RawSession = { readonly session: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const WORDS = ['fine', 'hide-title', 'hide-preview', 'hide-both'] as const;

// The model's answer: the exact word after trimming, or unreadable. No reply at all: none, with the cause.
export function readLook(raw: RawLook): LookAnswer {
  try {
    const reply = raw.look;
    if (!isRecord(reply)) return { verdict: 'none', cause: 'failed' };
    if (reply.isAnswered !== true) {
      if (reply.reason === 'empty-reply') return { verdict: 'unreadable', cause: 'empty reply' };
      return { verdict: 'none', cause: reply.reason === 'aborted' ? 'too slow' : 'failed' };
    }
    const word = typeof reply.text === 'string' ? reply.text.trim() : '';
    const known = WORDS.find((w) => w === word);
    return known ? { verdict: known, cause: '' } : { verdict: 'unreadable', cause: word ? 'odd answer' : 'empty reply' };
  } catch {
    return { verdict: 'none', cause: 'failed' };
  }
}

// One session's record: its title, its parent's id, and the project name if its title is a project's main chat.
export function readSession(raw: RawSession): Session {
  try {
    const result = raw.session;
    if (!isRecord(result) || result.isError || !Array.isArray(result.content)) return 'not-found';
    const text: unknown = result.content.find((b) => isRecord(b) && typeof b.text === 'string')?.text;
    if (typeof text !== 'string') return 'not-found';
    // The record of another session (the parent) comes wrapped in a notice, so take the JSON from brace to brace.
    const ccr: unknown = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).ccr;
    if (!isRecord(ccr)) return 'not-found';
    const title = typeof ccr.title === 'string' ? ccr.title : '';
    const parent = ccr.parent_session_id;
    return {
      title,
      // Only an id in Claude's own shape is ever asked for.
      parent: typeof parent === 'string' && /^(?:session|cse)_[A-Za-z0-9]{1,56}$/.test(parent) ? parent : '',
      project: /^Project coordinator \("(.+)"\)$/.exec(title)?.[1] ?? '',
    };
  } catch {
    return 'not-found';
  }
}
