export type ExperimentId = 'gatekeeper' | 'war-table' | 'crucible' | 'parlour' | 'smokestacks' | 'horadrim';

export type SessionState = 'idle' | 'awaiting' | 'working' | 'completed-unseen' | 'crashed';

export interface ExperimentMeta {
    id: ExperimentId;
    label: string;
    codename: string;
    wslRelativePath: string;
}

export const EXPERIMENTS: readonly ExperimentMeta[] = [
    {id: 'gatekeeper', label: 'The Gatekeeper', codename: 'gatekeeper', wslRelativePath: 'experiments/zmuuzn-auth'},
    {id: 'war-table', label: 'The War Table', codename: 'war-table', wslRelativePath: 'experiments/zmuuzn-helldivers'},
    {id: 'crucible', label: 'The Crucible', codename: 'crucible', wslRelativePath: 'experiments/zmuuzn-strava'},
    {id: 'parlour', label: 'The Parlour', codename: 'parlour', wslRelativePath: 'experiments/zmuuzn-parlour'},
    {
        id: 'smokestacks',
        label: 'The Smokestacks',
        codename: 'smokestacks',
        wslRelativePath: 'experiments/zmuuzn-smokestacks',
    },
    {id: 'horadrim', label: 'The Horadrim', codename: 'horadrim', wslRelativePath: 'experiments/zmuuzn-horadrim'},
] as const;
