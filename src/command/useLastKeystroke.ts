// When the investor last typed (#00067 §2 P2, #00042 §7.4). A minion arriving
// within 1.5 s of a keystroke skips its grip on the rail: nothing climbs over
// the line the investor is writing. Two sources feed it: the command bar, and
// the Mad Scientist's own terminal (keydown, never xterm's onData, which also
// carries pastes and the terminal's own replies). Milliseconds, on the same
// performance.now() base as the floor's receipt clock (which reads seconds).

let lastMs = Number.NEGATIVE_INFINITY;

export function useLastKeystroke(): {note: () => void; msSince: () => number} {
    return {
        note(): void {
            lastMs = performance.now();
        },
        msSince(): number {
            return performance.now() - lastMs;
        },
    };
}

/** Test-only: forget the last keystroke. */
export function _resetForTests(): void {
    lastMs = Number.NEGATIVE_INFINITY;
}
