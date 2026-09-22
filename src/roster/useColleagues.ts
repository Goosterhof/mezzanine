import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

import type {Colleague} from './types';

import {COLLEAGUES} from './types';
import {useRoster} from './useRoster';
import {useRosterBackend} from './useRosterBackend';

interface TubeConnection {
    id: string;
    identity: Colleague;
    delivery: 'connecting' | 'channel' | 'queue' | 'closed' | 'disconnected' | 'error';
    error: string | null;
    /** The newest tube message id addressed to this row's identity, or null
     *  when there is none. Absent on an older tube, which is harmless. */
    last_received_id?: unknown;
}

/** What the arrival watch last saw at one colleague's bench. */
interface ArrivalMark {
    /** The connection the baseline was seeded from. A new id for the same
     *  identity is a replaced connection, and it re-seeds. */
    connection: string;
    newest: number | null;
}

const opening = ref<Colleague[]>([]);
const errors = ref<Partial<Record<Colleague, string>>>({});
const connections = ref<TubeConnection[]>([]);
const tubeError = ref<string | null>(null);
const bootError = ref<string | null>(null);
// Mail ARRIVING at a colleague's bench (#00041 §5.4, the Long Bench's
// crossing). Each count is the number of RISES the watch has seen in that
// identity's `last_received_id` — never a count of letters: one poll can
// coalesce several (guard d). It says the mail reached the bench's durable
// mailbox; it never says the live session was handed the letter or acted
// on it, and it is kept apart from `delivery` status and acknowledgement
// on purpose (guard a).
const tubeArrivals = ref<Record<Colleague, number>>({'mad-scientist': 0, heretic: 0});
const arrivalMarks = new Map<Colleague, ArrivalMark>();
let reading = false;

/** `last_received_id` narrowed: a number, a real null (no mail yet), or
 *  undefined for a field an older tube never sends (guard c). */
function newestId(row: TubeConnection): number | null | undefined {
    const value = row.last_received_id;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return value === null ? null : undefined;
}

/** Compare one successful snapshot against the baseline and count a rise.
 *  The baseline is seeded — never counted — on the first snapshot and on a
 *  replaced connection (guard b), so old mail never replays as a crossing. */
function watchArrivals(rows: TubeConnection[], liveBench: (identity: Colleague) => string | undefined): void {
    for (const identity of COLLEAGUES) {
        const mine = rows.filter((row) => row.identity === identity);
        const row = mine.find((r) => r.id === liveBench(identity)) ?? mine[0];
        if (!row) continue;
        const newest = newestId(row);
        const mark = arrivalMarks.get(identity);
        if (newest === undefined) {
            arrivalMarks.delete(identity);
            continue;
        }
        if (mark?.connection === row.id && newest !== null && (mark.newest === null || newest > mark.newest)) {
            tubeArrivals.value = {...tubeArrivals.value, [identity]: tubeArrivals.value[identity] + 1};
        }
        arrivalMarks.set(identity, {connection: row.id, newest});
    }
}

export function useColleagues() {
    const roster = useRoster();
    const backend = useRosterBackend();
    const bench = (identity: Colleague) => roster.scientists.value.find((s) => s.colleague === identity);
    return {
        opening,
        errors,
        connections,
        tubeError,
        bootError,
        tubeArrivals,
        bench,
        async open(identity: Colleague, select = true): Promise<void> {
            if (opening.value.includes(identity)) return;
            opening.value = [...opening.value, identity];
            delete errors.value[identity];
            try {
                const scientist = await backend.openColleague(identity);
                if (select) roster.select(scientist.id);
            } catch (error) {
                errors.value[identity] = String(error);
            } finally {
                opening.value = opening.value.filter((id) => id !== identity);
            }
        },
        async openOnEntry(): Promise<void> {
            bootError.value = null;
            // Partial failure must leave the other colleague usable.
            for (const identity of COLLEAGUES) await this.open(identity, false);
            await this.refreshTube();
        },
        async refreshTube(): Promise<void> {
            if (reading) return;
            reading = true;
            try {
                const rows = await invoke<TubeConnection[]>('read_tube_connections');
                connections.value = rows;
                tubeError.value = null;
                if (Array.isArray(rows)) watchArrivals(rows, (identity) => bench(identity)?.id);
            } catch (error) {
                connections.value = [];
                tubeError.value = String(error);
            } finally {
                reading = false;
            }
        },
        tubeLabel(identity: Colleague): string {
            if (tubeError.value) return 'Tube unavailable';
            const scientist = bench(identity);
            if (!scientist || scientist.state === 'done' || scientist.state === 'crashed') return 'Tube offline';
            const connection = connections.value.find((c) => c.id === scientist.id);
            const labels: Record<TubeConnection['delivery'], string> = {
                channel: 'Tube listening',
                queue: 'Tube listening · between turns',
                error: 'Tube delivery needs attention',
                closed: 'Tube offline',
                disconnected: 'Tube offline',
                connecting: 'Tube connecting…',
            };
            if (!connection && Date.now() - Date.parse(scientist.startedAt) > 30000) return 'Tube offline';
            return labels[connection?.delivery ?? 'connecting'];
        },
        reset(): void {
            opening.value = [];
            errors.value = {};
            connections.value = [];
            tubeError.value = null;
            bootError.value = null;
            tubeArrivals.value = {'mad-scientist': 0, heretic: 0};
            arrivalMarks.clear();
            reading = false;
        },
    };
}
