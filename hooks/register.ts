// Thread Queue approval, T7 test build. Loaded by Claude Code as the plugin's hooks module (a "mod").
// It settles one call, the board row write, so auto mode's safety check is never asked about it.
// It never refuses a call and never touches any other call.
import { approves, threadOf } from './approve.ts';

type Decision = { decision: 'allow' | 'ask' | 'deny'; reason?: string; rule?: string; hook?: string; setting?: string; plugin?: string };
type Call = { tool: string; input: unknown; tool_use_id?: string };
type Api = { env: { get(name: string): Promise<string | undefined> }; ui: { log(text: string): void } };
type Hook = ($: Api, e: Call, next: (e: Call) => Promise<Decision>) => Promise<Decision>;
type On = (event: string, match: { tool: string }, hook: Hook) => unknown;

export function register(on: On): void {
  on('tool.check', { tool: 'ArtifactData' }, async ($, e, next) => {
    const decided = await next(e); // Claude Code's own answer from rules, mode and hooks. Asks no safety check.
    const thread = threadOf((await $.env.get('CLAUDE_CODE_REMOTE_SESSION_ID')) ?? '');
    if (!approves(e.tool, e.input, thread)) return decided;
    // Lift only auto mode's own "ask". A refusal, or an ask that a rule, hook or setting made, stands.
    if (decided.decision !== 'ask' || decided.rule || decided.hook || decided.setting || decided.plugin) return decided;
    $.ui.log('board row approved by the plugin rule, call ' + e.tool_use_id);
    return { decision: 'allow', reason: 'Thread Queue board row' };
  });

  // Test evidence only. Fires when auto mode is about to ask its safety check about a call. Changes nothing.
  on('tool.judge', { tool: 'ArtifactData' }, async ($, e, next) => {
    $.ui.log('safety check asked about an ArtifactData call, ' + e.tool_use_id);
    return next(e);
  });
}
