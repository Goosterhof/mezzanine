// Wizard types — mirror the serde shapes in src-tauri/src/wizard/ and
// src-tauri/src/commands/wizard.rs.
//
// The wire is camelCase (the Rust side renames via `serde(rename_all =
// "camelCase")`). Three steps land in one atomic `complete_wizard`
// submission: lab root, claude binary (optional), and the disclosure ack
// (its own pre-existing command — the wizard sequences both calls).

export type WizardStepId = 'laboratory' | 'binary' | 'chronicle';

/** Tuple — encodes "always non-empty" at the type level so the consumer
 *  can read `[0]` and `at(-1)` without non-null assertions. */
export const WIZARD_STEP_ORDER = ['laboratory', 'binary', 'chronicle'] as const satisfies readonly [
    WizardStepId,
    ...WizardStepId[],
];

export interface WizardState {
    completedAt: string | null;
    labRoot: string | null;
    claudeBinary: string | null;
}

export const EMPTY_WIZARD_STATE: WizardState = {completedAt: null, labRoot: null, claudeBinary: null};

export type HostPlatform = 'windows' | 'macos' | 'unix';

export interface WizardDetected {
    labRoot: string;
    claudeBinary: string;
    hostPlatform: HostPlatform;
}

export const EMPTY_WIZARD_DETECTED: WizardDetected = {labRoot: '', claudeBinary: 'claude', hostPlatform: 'unix'};

export interface WizardSubmission {
    labRoot: string;
    claudeBinary: string | null;
}
