import {invoke} from '@tauri-apps/api/core';
import {computed, ref} from 'vue';

import type {HealthState} from './types';

export interface HealthPing {
    slug: string;
    label: string;
    url: string;
    healthy: boolean;
    statusCode: number | null;
    responseTimeMs: number;
    error: string;
}
export interface ServiceSample extends HealthPing {
    checkedAt: number;
    failures: number;
    incidentSince: number | null;
    history: {at: number; healthy: boolean}[];
}
const services = ref<ServiceSample[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const now = ref(Date.now());
const checkedAt = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
let generation = 0;
let lastAttempt = 0;
const stale = computed(() => checkedAt.value === null || now.value - checkedAt.value > 150000);
const attention = computed(() =>
    stale.value ? services.value.length : services.value.filter((s) => !s.healthy).length,
);

function nextSample(ping: HealthPing, old: ServiceSample | undefined, stamp: number): ServiceSample {
    return {
        ...ping,
        checkedAt: stamp,
        failures: ping.healthy ? 0 : (old?.failures ?? 0) + 1,
        incidentSince: ping.healthy ? null : (old?.incidentSince ?? stamp),
        history: [...(old?.history ?? []), {at: stamp, healthy: ping.healthy}].slice(-20),
    };
}

async function refresh(): Promise<void> {
    if (loading.value) return;
    const current = generation;
    loading.value = true;
    lastAttempt = Date.now();
    try {
        const result = await invoke<{experiments: HealthPing[]}>('read_service_health');
        if (current !== generation) return;
        const stamp = Date.now();
        const events: string[] = [];
        const previous = new Map(services.value.map((s) => [s.slug, s]));
        services.value = result.experiments.map((ping) => {
            const sample = nextSample(ping, previous.get(ping.slug), stamp);
            if (sample.failures === 2) events.push(`${ping.label} needs attention`);
            if (ping.healthy && (previous.get(ping.slug)?.failures ?? 0) >= 2) events.push(`${ping.label} recovered`);
            return sample;
        });
        const unreachable =
            services.value.length > 0 && services.value.every((s) => !s.healthy && s.statusCode === null);
        if (events.length)
            notice.value = unreachable
                ? 'Checks cannot reach the laboratory apps. Check this computer’s connection as well as the services.'
                : events.join(' · ');
        checkedAt.value = stamp;
        now.value = stamp;
        error.value = null;
    } catch (e) {
        if (current === generation) error.value = String(e);
    } finally {
        if (current === generation) loading.value = false;
    }
}
function resume(): void {
    now.value = Date.now();
    if (now.value - lastAttempt >= 30000) void refresh();
}
function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    generation++;
    loading.value = false;
    if (typeof window !== 'undefined') window.removeEventListener('focus', resume);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume);
}
export function useServiceMonitor() {
    return {
        services,
        loading,
        error,
        notice,
        checkedAt,
        stale,
        attention,
        now,
        refresh,
        health(service: ServiceSample): HealthState {
            if (stale.value || error.value) return 'unknown';
            if (service.healthy) return 'green';
            return service.statusCode === null ? 'red' : 'amber';
        },
        start(): void {
            if (timer) return;
            void refresh();
            timer = setInterval(() => {
                now.value = Date.now();
                if (now.value - lastAttempt >= 60000) void refresh();
            }, 5000);
            window.addEventListener('focus', resume);
            document.addEventListener('visibilitychange', resume);
        },
        stop,
        reset(): void {
            stop();
            services.value = [];
            checkedAt.value = null;
            error.value = notice.value = null;
            lastAttempt = 0;
        },
    };
}
