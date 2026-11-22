// Empty shell. RUL-3168 fills the sections below. No hook, no call, no import yet.

// Composition Root: the only place that reads the environment and wires the rest.
// Controller: turns a hook event into one decision.
// Manager: reaches storage for the Service.
// Connector: the only code that talks to the board.

export function register(_on: unknown): void {}
