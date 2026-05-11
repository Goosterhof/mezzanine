// Drydock types — mirror the serde structs in src-tauri/src/{commands/github,
// commands/artifacts, drydock/*}.rs. Keep these in lockstep with the Rust
// side; tests assert on field names so drift surfaces fast.

export interface GhAuthStatus {
    authenticated: boolean;
    message: string;
}

export interface DrydockPullRequest {
    repoFullName: string;
    repoLabel: string;
    repoLocalPath: string;
    experimentScope: string | null;
    number: number;
    title: string;
    author: string;
    headRef: string;
    isDraft: boolean;
    additions: number;
    deletions: number;
    changedFiles: number;
    url: string;
}

export interface DrydockPrFile {
    path: string;
    additions: number;
    deletions: number;
}

export interface MinionTouch {
    minion: string;
    commitHash: string;
    author: string;
    date: string;
    subject: string;
}

export interface ChaosDetonation {
    reportNumber: string;
    reportFilename: string;
    title: string;
    madnessScore: number | null;
    madnessLabel: string | null;
}

export interface ActiveExperimentLog {
    number: string;
    filename: string;
    title: string;
    status: string;
    scope: string;
}

export interface FileEnrichment {
    minionTouch: MinionTouch | null;
    chaosDetonations: ChaosDetonation[];
    activeLog: ActiveExperimentLog | null;
    loading: boolean;
    error: string | null;
}

export const EMPTY_FILE_ENRICHMENT: FileEnrichment = {
    minionTouch: null,
    chaosDetonations: [],
    activeLog: null,
    loading: false,
    error: null,
};

export type ReviewVerdict = 'approve' | 'comment' | 'request-changes';
