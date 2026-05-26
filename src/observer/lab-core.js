const __LabCoreExports = {};

// =============================================================================
// Pixel Lab Core — Pure functions and data structures
// Extracted for testability. Works in both browser (webview) and Node.js.
// =============================================================================

((exports) => {
    'use strict';

    // --- Layout Constants ---
    exports.TILE = 16;
    exports.COLS = 31;
    exports.ROWS = 16;
    exports.FPS = 10;
    exports.MAX_VISIBLE_MINIONS = 4;

    // --- Time Phase Boundaries ---
    // Maps hour-of-day ranges to named phases for the day/night cycle.
    // Each phase controls window sky color, star visibility, and light behavior.
    const TIME_PHASE_BOUNDARIES = [
        {start: 22, end: 5, phase: 'night'},
        {start: 5, end: 7, phase: 'dawn'},
        {start: 7, end: 10, phase: 'morning'},
        {start: 10, end: 15, phase: 'day'},
        {start: 15, end: 18, phase: 'afternoon'},
        {start: 18, end: 20, phase: 'dusk'},
        {start: 20, end: 22, phase: 'evening'},
    ];
    exports.TIME_PHASE_BOUNDARIES = TIME_PHASE_BOUNDARIES;

    /**
     * Determines the time-of-day phase from an hour (0-23).
     * In demo mode, cycles through phases based on frame count.
     */
    exports.getTimePhase = function getTimePhase(hour, demoMode, frame, fps) {
        if (demoMode) {
            const phases = ['night', 'dawn', 'morning', 'day', 'afternoon', 'dusk', 'evening'];
            return phases[Math.floor(frame / (fps * 8)) % phases.length];
        }
        if (hour >= 22 || hour < 5) return 'night';
        if (hour >= 5 && hour < 7) return 'dawn';
        if (hour >= 7 && hour < 10) return 'morning';
        if (hour >= 10 && hour < 15) return 'day';
        if (hour >= 15 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 20) return 'dusk';
        return 'evening';
    };

    /**
     * Creates a character object with sensible defaults.
     * Used for both the scientist (type="scientist") and minions (type="minion").
     */
    exports.createCharacter = function createCharacter(id, type, x, y, activity, detail, color) {
        return {
            id,
            type,
            x,
            y,
            targetX: x,
            targetY: y,
            facing: 1,
            walkFrame: 0,
            activity: activity ?? 'idle',
            detail: detail ?? '',
            idleTimer: 0,
            bubbleAlpha: 0,
            speechText: '',
            color: color ?? null,
            spawnPhase: type === 'minion' ? 0 : 5,
            despawning: false,
            _remove: false,
        };
    };

    /**
     * Clamps a value to [min, max].
     */
    exports.clamp = function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    };

    /**
     * Computes the distance between two points.
     */
    exports.distance = function distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    };

    /**
     * Moves a character toward its target position at the given speed.
     * Returns true if the character is still moving.
     */
    exports.moveToward = function moveToward(char, speed) {
        const dx = char.targetX - char.x;
        const dy = char.targetY - char.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1.5) {
            char.x += (dx / dist) * speed;
            char.y += (dy / dist) * speed;
            char.walkFrame += 0.3;
            char.facing = dx > 0 ? 1 : dx < 0 ? -1 : char.facing;
            return true;
        }
        char.walkFrame = 0;
        return false;
    };

    /**
     * Tests whether a point (px, py) falls within a rectangle.
     */
    exports.pointInRect = function pointInRect(px, py, x, y, w, h) {
        return px >= x && px < x + w && py >= y && py < y + h;
    };

    /**
     * Tests a point against an array of zones (each with x, y, w, h).
     * Returns the last (topmost) matching zone, or null.
     */
    exports.hitTestZones = function hitTestZones(px, py, zones) {
        for (let i = zones.length - 1; i >= 0; i--) {
            const z = zones[i];
            if (px >= z.x && px < z.x + z.w && py >= z.y && py < z.y + z.h) {
                return z;
            }
        }
        return null;
    };
})(__LabCoreExports);

export const TILE = __LabCoreExports.TILE;
export const COLS = __LabCoreExports.COLS;
export const ROWS = __LabCoreExports.ROWS;
export const FPS = __LabCoreExports.FPS;
export const MAX_VISIBLE_MINIONS = __LabCoreExports.MAX_VISIBLE_MINIONS;
export const TIME_PHASE_BOUNDARIES = __LabCoreExports.TIME_PHASE_BOUNDARIES;
export const getTimePhase = __LabCoreExports.getTimePhase;
export const createCharacter = __LabCoreExports.createCharacter;
export const pointInRect = __LabCoreExports.pointInRect;
export const hitTestZones = __LabCoreExports.hitTestZones;
export default __LabCoreExports;
