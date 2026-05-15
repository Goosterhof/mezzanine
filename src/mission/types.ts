// Mission Control types — typed payloads the Rust commands return.
//
// The shapes mirror the serde structs in src-tauri/src/lab/*.rs. Keep them
// in lockstep — when a Rust struct gains or renames a field, the
// corresponding type here must move too. Tests assert on field names so
// drift surfaces fast.

export interface VitalSigns {
    experimentsActive: number | null;
    experimentsSummary: string;
    gadgetsCalibrated: number | null;
    gadgetsSummary: string;
    packagesPublished: number | null;
    packagesSummary: string;
    minionsOperational: number | null;
    minionsSummary: string;
    sentinelsWatching: number | null;
    sentinelsSummary: string;
    lastChaos: string;
    chaosFiled: string;
    enhanceFiled: string;
}

export interface MinionSignal {
    date: string;
    source: string;
    signalType: string;
    target: string;
    message: string;
    recommendedDispatch: string;
}

export interface WoundSummary {
    filename: string;
    modifiedAt: string;
    sizeBytes: number;
}

export const EMPTY_VITAL_SIGNS: VitalSigns = {
    experimentsActive: null,
    experimentsSummary: '',
    gadgetsCalibrated: null,
    gadgetsSummary: '',
    packagesPublished: null,
    packagesSummary: '',
    minionsOperational: null,
    minionsSummary: '',
    sentinelsWatching: null,
    sentinelsSummary: '',
    lastChaos: '',
    chaosFiled: '',
    enhanceFiled: '',
};
