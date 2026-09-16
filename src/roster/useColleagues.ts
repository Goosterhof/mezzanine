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
}

const opening = ref<Colleague[]>([]);
const errors = ref<Partial<Record<Colleague, string>>>({});
const connections = ref<TubeConnection[]>([]);
const tubeError = ref<string | null>(null);
const bootError = ref<string | null>(null);
let reading = false;

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
                connections.value = await invoke<TubeConnection[]>('read_tube_connections');
                tubeError.value = null;
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
            reading = false;
        },
    };
}
