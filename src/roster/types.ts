// The Mezzanine's roster type surface — mirrors `src-tauri/src/roster/*`
// serde shapes one for one. The Rust side serializes Scientist / Target
// as camelCase struct variants ({"kind":"experiment","codename":"crucible"}
// for Target, {id,target,mission,state,startedAt,lastStateChange} for
// Scientist). The frontend never constructs a Scientist — those come from
// dispatch / list_roster — but the discriminated Target is built here
// when the investor picks one from the Dispatch sheet.

export type ScientistId = string;

export type ExperimentCodename = 'gatekeeper' | 'war-table' | 'crucible' | 'parlour' | 'smokestacks' | 'horadrim';

export type GadgetCodename = 'observer' | 'holotable' | 'grind' | 'horadric-cube' | 'mezzanine';

export type PackageCodename = 'lab-nav';

export type Target =
    | {kind: 'experiment'; codename: ExperimentCodename}
    | {kind: 'gadget'; codename: GadgetCodename}
    | {kind: 'package'; codename: PackageCodename}
    | {kind: 'lab-root'};

export type MissionState = 'idle' | 'working' | 'awaiting' | 'done' | 'crashed';

export interface Scientist {
    id: ScientistId;
    target: Target;
    mission: string;
    state: MissionState;
    startedAt: string;
    lastStateChange: string;
}

export interface RecalledScientist {
    scientist: Scientist;
    recalledAt: string;
}

export interface TargetOption {
    target: Target;
    label: string;
    /** Display group on the target picker — Experiments / Gadgets / Packages / The Lab. */
    group: 'Experiments' | 'Gadgets' | 'Packages' | 'The Lab';
}

const EXPERIMENT_LABELS: Record<ExperimentCodename, string> = {
    gatekeeper: 'The Gatekeeper',
    'war-table': 'The War Table',
    crucible: 'The Crucible',
    parlour: 'The Parlour',
    smokestacks: 'The Smokestacks',
    horadrim: 'The Horadrim',
};

const GADGET_LABELS: Record<GadgetCodename, string> = {
    observer: 'The Observer',
    holotable: 'The Holotable',
    grind: 'The Grind',
    'horadric-cube': 'The Horadric Cube',
    mezzanine: 'The Mezzanine',
};

const PACKAGE_LABELS: Record<PackageCodename, string> = {'lab-nav': 'lab-nav'};

/** Display label for a Target — mirrors Rust `Target::label()`. */
export function targetLabel(target: Target): string {
    switch (target.kind) {
        case 'experiment':
            return EXPERIMENT_LABELS[target.codename];
        case 'gadget':
            return GADGET_LABELS[target.codename];
        case 'package':
            return PACKAGE_LABELS[target.codename];
        case 'lab-root':
            return 'The Lab';
    }
}

/** Stable identity string for a Target — used for keys and equality. */
export function targetKey(target: Target): string {
    if (target.kind === 'lab-root') {
        return 'lab-root';
    }
    return `${target.kind}:${target.codename}`;
}

/** The full Target catalogue rendered by the Dispatch sheet. */
export const TARGET_OPTIONS: readonly TargetOption[] = [
    {target: {kind: 'experiment', codename: 'gatekeeper'}, label: 'The Gatekeeper', group: 'Experiments'},
    {target: {kind: 'experiment', codename: 'war-table'}, label: 'The War Table', group: 'Experiments'},
    {target: {kind: 'experiment', codename: 'crucible'}, label: 'The Crucible', group: 'Experiments'},
    {target: {kind: 'experiment', codename: 'parlour'}, label: 'The Parlour', group: 'Experiments'},
    {target: {kind: 'experiment', codename: 'smokestacks'}, label: 'The Smokestacks', group: 'Experiments'},
    {target: {kind: 'experiment', codename: 'horadrim'}, label: 'The Horadrim', group: 'Experiments'},
    {target: {kind: 'gadget', codename: 'observer'}, label: 'The Observer', group: 'Gadgets'},
    {target: {kind: 'gadget', codename: 'holotable'}, label: 'The Holotable', group: 'Gadgets'},
    {target: {kind: 'gadget', codename: 'grind'}, label: 'The Grind', group: 'Gadgets'},
    {target: {kind: 'gadget', codename: 'horadric-cube'}, label: 'The Horadric Cube', group: 'Gadgets'},
    {target: {kind: 'gadget', codename: 'mezzanine'}, label: 'The Mezzanine', group: 'Gadgets'},
    {target: {kind: 'package', codename: 'lab-nav'}, label: 'lab-nav', group: 'Packages'},
    {target: {kind: 'lab-root'}, label: 'The Lab', group: 'The Lab'},
] as const;
