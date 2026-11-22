// Empty shell. RUL-3168 fills the sections below. No hook, no call, no import yet.

// Composition Root: the only place that reads the environment and wires the rest.
// Controller: turns a hook event into one decision.
// Manager: reaches storage for the Service.
// Connector: the only code that talks to the board.

export function register(on: (event: string, hook: (...a: unknown[]) => unknown) => void): void {
  on('turn.complete', async (_$: unknown, _e: unknown, next: unknown) => (next as () => unknown)());
}
