/**
 * Lab Monitor 3D — Pure helper functions (UMD)
 *
 * Shared between webview and Node for testing.
 * Zero DOM or Three.js dependencies.
 */

// Lifted to the Mezzanine on 2026-05-26 (experiment log #00051).
// UMD wrapper replaced with an ES module default export. Body unchanged
// — only the entry/exit shapes moved.

const LabCore3D = (function () {
    'use strict';

    // Structure type → visual config mapping
    var STRUCTURE_CONFIG = {
        tower: {
            label: 'Central Tower',
            color: 0x4488ff,
            emissive: 0x112244,
            height: 3.0,
            radius: 0.8,
            yOffset: 1.5,
            description: 'Zmuuzn parent repository — multi-tier command spire with antenna',
        },
        experiment: {
            label: 'Experiment Pod',
            color: 0x44ff88,
            emissive: 0x114422,
            height: 1.5,
            radius: 0.6,
            yOffset: 0.75,
            description: 'Deployed experiment — dome-topped containment pod',
        },
        gadget: {
            label: 'Gadget Workbench',
            color: 0xff8844,
            emissive: 0x442211,
            height: 0.8,
            radius: 0.4,
            yOffset: 0.4,
            description: 'VS Code extension — hexagonal workstation with base plate',
        },
        database: {
            label: 'Database Crystal',
            color: 0xaa44ff,
            emissive: 0x331144,
            height: 1.2,
            radius: 0.5,
            yOffset: 0.6,
            description: 'Shared PostgreSQL — hexagonal bipyramid data crystal',
        },
        pipeline: {
            label: 'Deploy Pipeline',
            color: 0xffaa44,
            emissive: 0x443311,
            height: 1.0,
            radius: 0.5,
            yOffset: 0.5,
            description: 'Railway deployment — launch vehicle with nose cone',
        },
    };

    // Health status → color mapping
    var HEALTH_COLORS = {green: 0x44ff88, amber: 0xffaa44, red: 0xff4444, unknown: 0x666688};

    // Layout: radial positions for structures around the tower
    var LAYOUT_RADIUS = 5;
    var GADGET_RADIUS = 7;
    var INFRA_RADIUS = 3.5;

    /**
     * Compute 3D positions for all structures.
     * Tower at center, experiments in inner ring, gadgets in outer ring,
     * infrastructure below.
     */
    function computeLayout(structures) {
        var positions = {};
        var experiments = [];
        var gadgets = [];
        var infra = [];

        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];
            if (s.type === 'tower') {
                positions[s.id] = {x: 0, y: 0, z: 0};
            } else if (s.type === 'experiment') {
                experiments.push(s);
            } else if (s.type === 'gadget') {
                gadgets.push(s);
            } else {
                infra.push(s);
            }
        }

        // Experiments: inner ring
        for (var ei = 0; ei < experiments.length; ei++) {
            var angle = (ei / Math.max(experiments.length, 1)) * Math.PI * 2 - Math.PI / 2;
            positions[experiments[ei].id] = {
                x: Math.cos(angle) * LAYOUT_RADIUS,
                y: 0,
                z: Math.sin(angle) * LAYOUT_RADIUS,
            };
        }

        // Gadgets: outer ring (offset by half step)
        for (var gi = 0; gi < gadgets.length; gi++) {
            var gAngle = (gi / Math.max(gadgets.length, 1)) * Math.PI * 2 + Math.PI / gadgets.length;
            positions[gadgets[gi].id] = {
                x: Math.cos(gAngle) * GADGET_RADIUS,
                y: -0.5,
                z: Math.sin(gAngle) * GADGET_RADIUS,
            };
        }

        // Infrastructure: below and behind
        for (var ii = 0; ii < infra.length; ii++) {
            var iAngle = Math.PI + (ii / Math.max(infra.length, 1)) * Math.PI;
            positions[infra[ii].id] = {x: Math.cos(iAngle) * INFRA_RADIUS, y: -1.5, z: Math.sin(iAngle) * INFRA_RADIUS};
        }

        return positions;
    }

    /**
     * Get health color as hex number.
     */
    function healthColor(health) {
        return HEALTH_COLORS[health] || HEALTH_COLORS.unknown;
    }

    /**
     * Translate health status into the Holotable's voice.
     * Clinical readouts are for Grafana. The Holotable speaks like mission control.
     */
    var HEALTH_VOICE = {
        green: 'Vital signs nominal',
        amber: 'Elevated readings \u2014 monitor closely',
        red: 'Critical containment failure',
        unknown: 'No signal \u2014 gone dark',
    };

    function healthVoice(health) {
        return HEALTH_VOICE[health] || HEALTH_VOICE.unknown;
    }

    /**
     * Get structure config for a type.
     */
    function structureConfig(type) {
        return STRUCTURE_CONFIG[type] || STRUCTURE_CONFIG.gadget;
    }

    /**
     * Lerp between two values.
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Clamp value between min and max.
     */
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    /**
     * Format a timestamp as relative time ("5s ago", "2m ago").
     */
    function formatRelativeTime(timestamp) {
        var diff = Date.now() - timestamp;
        if (diff < 1000) return 'just now';
        if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        return Math.floor(diff / 3600000) + 'h ago';
    }

    /**
     * Pulse value for glow effects (0..1).
     */
    function pulse(time, speed) {
        return (Math.sin(time * speed) + 1) * 0.5;
    }

    // =========================================================================
    // Particle Vocabulary — health-coded motion behaviors
    // =========================================================================
    // Particles are diagnostic instruments. An operator can read the particle
    // field without looking at health badges — the motion tells the story.

    /**
     * Particle behavior configurations per health state.
     *
     * Each behavior defines how particles are spawned (initial velocity) and
     * how they move each frame (motion type + parameters).
     *
     * Motion types:
     *   "rise"   — steady upward drift (green: healthy, ascending)
     *   "orbit"  — circular path around parent structure (amber: restless, watching)
     *   "fall"   — downward cascade with lateral scatter (red: critical, sparks falling)
     *   "spiral" — helical upward path (unknown/database: mysterious, crystalline)
     */
    var PARTICLE_VOCAB = {
        green: {
            motion: 'rise',
            count: 3,
            speed: 0.025, // upward velocity
            spread: 0.3, // lateral spawn spread
            size: [3, 3], // min, range
            life: [2, 2], // min, range
            alpha: 0.8,
        },
        amber: {
            motion: 'orbit',
            count: 4,
            speed: 1.8, // angular velocity (radians/sec)
            orbitRadius: 0.6, // distance from structure center
            spread: 0.2,
            size: [2.5, 2],
            life: [3, 2],
            alpha: 0.7,
        },
        red: {
            motion: 'fall',
            count: 5,
            speed: 0.04, // downward velocity
            spread: 0.8, // wider lateral scatter (sparks flying)
            size: [2, 4], // more size variation (embers)
            life: [1.2, 1.5], // shorter lives (burnout)
            alpha: 0.9,
        },
        unknown: {
            motion: 'spiral',
            count: 2,
            speed: 0.02, // upward drift
            spiralSpeed: 2.0, // angular velocity of helix
            spiralRadius: 0.4, // helix radius
            spread: 0.15,
            size: [2, 2],
            life: [2.5, 2],
            alpha: 0.5,
        },
    };

    /**
     * Get particle vocabulary for a health state.
     * Falls back to "unknown" for unrecognized health values.
     */
    function particleVocab(health) {
        return PARTICLE_VOCAB[health] || PARTICLE_VOCAB.unknown;
    }

    /**
     * Compute particle spawn parameters for a structure.
     * Returns an array of particle descriptors: { x, y, z, vx, vy, vz, ... }
     *
     * @param {Object} pos      — structure world position {x, y, z}
     * @param {number} height   — structure height (particles spawn at top)
     * @param {string} health   — health state key
     * @returns {Array} particle descriptors ready for spawnParticle()
     */
    function spawnParticleVocab(pos, height, health) {
        var vocab = particleVocab(health);
        var hc = healthColor(health);
        var r = ((hc >> 16) & 0xff) / 255;
        var g = ((hc >> 8) & 0xff) / 255;
        var b = (hc & 0xff) / 255;

        var result = [];
        for (var i = 0; i < vocab.count; i++) {
            var px = pos.x + (Math.random() - 0.5) * vocab.spread;
            var py = pos.y + height + Math.random() * 0.3;
            var pz = pos.z + (Math.random() - 0.5) * vocab.spread;
            var vx = 0;
            var vy = 0;
            var vz = 0;

            if (vocab.motion === 'rise') {
                // Gentle upward with tiny lateral drift
                vx = (Math.random() - 0.5) * 0.005;
                vy = vocab.speed * (0.8 + Math.random() * 0.4);
                vz = (Math.random() - 0.5) * 0.005;
            } else if (vocab.motion === 'fall') {
                // Downward cascade — sparks scatter outward
                vx = (Math.random() - 0.5) * vocab.speed * 0.8;
                vy = -vocab.speed * (0.6 + Math.random() * 0.8);
                vz = (Math.random() - 0.5) * vocab.speed * 0.8;
                py = pos.y + height * 0.7 + Math.random() * height * 0.3;
            } else if (vocab.motion === 'orbit') {
                // Orbital spawn: position on circle, velocity tangent to it
                var angle = Math.random() * Math.PI * 2;
                px = pos.x + Math.cos(angle) * vocab.orbitRadius;
                pz = pos.z + Math.sin(angle) * vocab.orbitRadius;
                py = pos.y + height * 0.5 + Math.random() * height * 0.5;
                // Store orbit data in velocity (orbit is computed in updateParticles,
                // but we give a tiny upward drift so they don't just circle in place)
                vx = 0;
                vy = 0.003;
                vz = 0;
            } else if (vocab.motion === 'spiral') {
                // Helix: upward drift with spiral computed per frame
                var sAngle = Math.random() * Math.PI * 2;
                px = pos.x + Math.cos(sAngle) * vocab.spiralRadius;
                pz = pos.z + Math.sin(sAngle) * vocab.spiralRadius;
                vx = 0;
                vy = vocab.speed * (0.8 + Math.random() * 0.4);
                vz = 0;
            }

            result.push({
                x: px,
                y: py,
                z: pz,
                vx: vx,
                vy: vy,
                vz: vz,
                r: r,
                g: g,
                b: b,
                a: vocab.alpha,
                size: vocab.size[0] + Math.random() * vocab.size[1],
                life: vocab.life[0] + Math.random() * vocab.life[1],
                motion: vocab.motion,
                // Orbit/spiral anchor — the structure's position for orbital math
                anchorX: pos.x,
                anchorZ: pos.z,
                orbitAngle: Math.random() * Math.PI * 2,
                orbitRadius: vocab.orbitRadius || 0,
                orbitSpeed: vocab.speed || 0,
                spiralRadius: vocab.spiralRadius || 0,
                spiralSpeed: vocab.spiralSpeed || 0,
            });
        }
        return result;
    }

    // =========================================================================
    // Summoning Animation — structures erupt from the grid floor
    // =========================================================================

    // Stagger delays by structure type (seconds).
    // Tower erupts first, experiments radiate outward, gadgets flicker in last.
    var SUMMON_WAVE = {tower: 0.0, experiment: 0.4, gadget: 0.8, database: 1.1, pipeline: 1.1};

    // Per-structure offset within its wave (seconds between siblings)
    var SUMMON_SIBLING_OFFSET = 0.15;

    // Total animation duration per structure once its delay has elapsed
    var SUMMON_DURATION = 0.9;

    /**
     * Spring easing with overshoot — the bounce that makes structures
     * feel like they're being projected upward and settling into place.
     *
     * t ∈ [0,1] → output overshoots to ~1.08 at t≈0.65, then settles to 1.0.
     * Based on damped harmonic oscillator: e^(-βt) * cos(ωt)
     */
    function summonEase(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        var beta = 4.0; // damping
        var omega = 2.5 * Math.PI; // oscillation frequency
        return 1 - Math.exp(-beta * t) * Math.cos(omega * t);
    }

    /**
     * Compute the summoning delay for a structure based on its type and
     * sibling index (position among structures of the same type).
     *
     * Returns delay in seconds before the structure begins its emergence.
     */
    function summonDelay(type, siblingIndex) {
        var wave = SUMMON_WAVE[type] !== undefined ? SUMMON_WAVE[type] : 1.2;
        return wave + (siblingIndex || 0) * SUMMON_SIBLING_OFFSET;
    }

    /**
     * Compute summon progress for a structure given elapsed time and its delay.
     * Returns 0 (not started) → 1 (fully materialized).
     */
    function summonProgress(elapsed, delay) {
        var local = (elapsed - delay) / SUMMON_DURATION;
        return clamp(local, 0, 1);
    }

    return {
        STRUCTURE_CONFIG: STRUCTURE_CONFIG,
        HEALTH_COLORS: HEALTH_COLORS,
        LAYOUT_RADIUS: LAYOUT_RADIUS,
        GADGET_RADIUS: GADGET_RADIUS,
        PARTICLE_VOCAB: PARTICLE_VOCAB,
        SUMMON_WAVE: SUMMON_WAVE,
        SUMMON_SIBLING_OFFSET: SUMMON_SIBLING_OFFSET,
        SUMMON_DURATION: SUMMON_DURATION,
        computeLayout: computeLayout,
        healthColor: healthColor,
        healthVoice: healthVoice,
        structureConfig: structureConfig,
        particleVocab: particleVocab,
        spawnParticleVocab: spawnParticleVocab,
        lerp: lerp,
        clamp: clamp,
        formatRelativeTime: formatRelativeTime,
        pulse: pulse,
        summonEase: summonEase,
        summonDelay: summonDelay,
        summonProgress: summonProgress,
    };
})();

export default LabCore3D;

