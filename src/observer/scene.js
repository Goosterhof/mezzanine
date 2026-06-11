// =============================================================================
// Pixel Lab — The Mad Scientist's Laboratory
// A minimal pixel art visualization of Claude Code agent activity
// =============================================================================

// =============================================================================
// The Observer — the Lab Floor scene, lifted from the Pixel Lab's
// `webview/lab.js` (#00050) and adapted into the Mezzanine's slice for
// Arc 2 (#00052).
//
// The lift is structural, not behavioural: the canvas drawing, character
// system, day/night cycle, idle sub-states, particle effects, and Konami
// code easter egg copy across without modification. What changes is the
// container: the VS Code webview message handler is replaced with a
// controller surface (`setRoster`, `setSelected`, `pauseRaf`, `resumeRaf`,
// `destroy`) the Vue side calls; `acquireVsCodeApi` is dropped; demo mode
// is disabled (the Mezzanine's empty-floor state is deliberate per
// RD-out-of-scope); the 4-minion-cap is replaced by a roster-driven
// character count.
//
// The function is an ES module export. The Vue host (`LabScene.vue`)
// dynamically imports this module on first panel open and holds the
// returned controller for the panel's lifetime.

import * as Core from './lab-core.js';

export function initScene(opts) {
    'use strict';

    const canvas = opts.canvas;
    const onInteraction = typeof opts.onInteraction === 'function' ? opts.onInteraction : () => {};

    // --- Layout Constants ---
    const TILE = Core.TILE ?? 16;
    const COLS = Core.COLS ?? 28;
    const ROWS = Core.ROWS ?? 16;
    const W = COLS * TILE;
    const H = ROWS * TILE;
    const FPS = Core.FPS ?? 10;
    const FRAME_INTERVAL = 1000 / FPS;
    // The bench-era 4-minion cap is retired. The floor now renders one
    // sprite per dispatched scientist — the cap becomes the roster size,
    // not a hard-coded ceiling.
    const MAX_VISIBLE_MINIONS = 99;

    // --- Lab Furniture Positions (in pixels) ---
    const LAB = {
        leftDesk: {x: 2 * TILE, y: 4 * TILE},
        centerDesk: {x: 6 * TILE, y: 4 * TILE},
        rightDesk: {x: 13 * TILE, y: 4 * TILE},
        shelf: {x: 2 * TILE, y: 3 * TILE + 6},
        beakerRack: {x: 16 * TILE, y: 7 * TILE},
        whiteboard: {x: 10 * TILE, y: TILE + 2},
        window: {x: 8 * TILE, y: TILE - 2},
        equipmentTable: {x: 2 * TILE, y: 9 * TILE},
        microscope: {x: 3 * TILE, y: 8 * TILE},
        door: {x: 9 * TILE, y: H - TILE * 2},
        oscilloscope: {x: 4 * TILE + 8, y: 8 * TILE + 4},
        teslaCoil: {x: 18 * TILE, y: 4 * TILE},
        // New wing — experiments, personnel, documents
        supportPillar: {x: 20 * TILE, y: TILE * 2},
        experimentGatekeeper: {x: 21 * TILE + 2, y: 3 * TILE},
        experimentWarTable: {x: 24 * TILE + 2, y: 3 * TILE},
        experimentCrucible: {x: 27 * TILE + 2, y: 3 * TILE},
        quartermasterStation: {x: 21 * TILE, y: 7 * TILE + 4},
        sentinelPost: {x: 24 * TILE + 4, y: 7 * TILE + 4},
        corkboard: {x: 21 * TILE + 4, y: 10 * TILE + 2},
        documentTable: {x: 21 * TILE, y: 12 * TILE},
        filingCabinet: {x: 25 * TILE + 4, y: 11 * TILE},
    };

    // --- Scientist Target Positions (where to walk per activity) ---
    const POSITIONS = {
        idle: {x: 9 * TILE, y: 7 * TILE},
        thinking: {x: 6 * TILE, y: 5 * TILE},
        writing: {x: 13 * TILE, y: 5 * TILE},
        reading: {x: 3 * TILE, y: 5 * TILE},
        running: {x: 10 * TILE, y: 8 * TILE},
        waiting: {x: 9 * TILE, y: 10 * TILE},
        error: {x: 15 * TILE, y: 8 * TILE},
    };

    // --- Minion Position Offsets (relative to scientist target) ---
    const MINION_OFFSETS = [
        {dx: -20, dy: 8},
        {dx: 20, dy: 8},
        {dx: -12, dy: 16},
        {dx: 12, dy: 16},
    ];

    // --- Minion Coat Colors ---
    const MINION_COLORS = [
        {coat: '#66ccbb', coatShadow: '#44aa99'},
        {coat: '#bb88dd', coatShadow: '#9966bb'},
        {coat: '#ffaa66', coatShadow: '#dd8844'},
        {coat: '#88dd66', coatShadow: '#66bb44'},
    ];

    // --- Speech Phrases Per Activity ---
    const SPEECH = {
        idle: ['...', 'Hmm...', 'zzZ'],
        thinking: ['Eureka?', 'Hypothesis!', 'Let me think...'],
        writing: ['*scribble*', 'Coding...', 'Experiment log!'],
        reading: ['Interesting...', 'Scanning...', 'Analyzing...'],
        running: ['Deploying!', 'Testing!', 'Execute!'],
        waiting: ['Investor?', 'Input needed', 'Awaiting orders'],
        error: ['BOOM!', 'Containment!', 'Recalibrating...'],
    };

    // --- Status Labels Per Activity ---
    const STATUS_LABELS = {
        idle: 'Laboratory Standby',
        thinking: 'Hypothesis Formation',
        writing: 'Experiment In Progress',
        reading: 'Data Analysis',
        running: 'Test Deployment',
        waiting: 'Awaiting Input',
        error: 'Containment Alert',
    };

    // --- Activity Indicator Colors ---
    const DOT_COLORS = {
        idle: '#666688',
        thinking: '#ffaa00',
        writing: '#00ff88',
        reading: '#4488ff',
        running: '#ff6644',
        waiting: '#ffee88',
        error: '#ff4444',
    };

    // --- Color Palette ---
    const PAL = {
        bg: '#1a1a2e',
        floor: '#2a2a4a',
        floorAlt: '#252545',
        wall: '#16213e',
        wallTop: '#0f3460',
        desk: '#3d2b1f',
        deskTop: '#5c4033',
        screen: '#0a0a1a',
        screenGlow: '#00ff88',
        screenBlue: '#4488ff',
        screenAmber: '#ffaa00',
        beaker: '#88ccff',
        beakerLiquid: '#00ff88',
        beakerLiquidAlt: '#ff6644',
        bubbles: '#aaffcc',
        pipe: '#556677',
        pipeHighlight: '#778899',
        shelf: '#4a3728',
        book1: '#cc4444',
        book2: '#4444cc',
        book3: '#44aa44',
        lightOn: '#ffee88',
        lightOff: '#333344',
        doorFrame: '#3d2b1f',
        door: '#2a4a2a',
        skin: '#ffcc99',
        coat: '#e8e8f0',
        coatShadow: '#c0c0d0',
        hair: '#553322',
        glassesFrame: '#334455',
        pants: '#334455',
        shoes: '#222233',
        goggles: '#ff8844',
        goggleGlass: '#aaddff',
        // Enhanced environment
        led: '#00ff44',
        ledOff: '#113311',
        ledRed: '#ff2222',
        ledRedOff: '#331111',
        oscilloscope: '#0a1a0a',
        waveform: '#00ff88',
        teslaBase: '#556677',
        teslaArc: '#aaccff',
        teslaGlow: '#4488ff',
        pipeFlow: '#88ddff',
        // Atmosphere
        dustMote: '#ffeecc',
        steamColor: '#ccddee',
        arcColor: '#88bbff',
        // Experiment chambers
        chamberGlass: '#88ccdd',
        chamberFrame: '#445566',
        gatekeeperGlow: '#44ff88',
        gatekeeperLiquid: '#113322',
        warTableGlow: '#ffaa44',
        warTableLiquid: '#332211',
        crucibleGlow: '#ff6644',
        crucibleLiquid: '#331108',
        // Personnel
        qmVest: '#b8860b',
        qmVestShadow: '#8b6914',
        qmCounter: '#5c4033',
        qmCrate: '#8b7355',
        qmCrateShadow: '#6b5335',
        sentinelBody: '#778899',
        sentinelBodyDark: '#556677',
        sentinelEye: '#ff4444',
        sentinelScan: '#44aaff',
        sentinelPedestal: '#445566',
        // Documents
        docWhite: '#eeeeff',
        docBlue: '#8899bb',
        docRed: '#bb6677',
        docGreen: '#66aa77',
        docYellow: '#bbaa66',
        docPurple: '#8877aa',
        docOrange: '#bb8855',
        docGold: '#ccaa44',
        docNavy: '#556688',
        corkboardColor: '#b8860b',
        corkboardDark: '#8b6508',
        pinRed: '#ff3333',
        pinBlue: '#3366ff',
        pinGreen: '#33cc66',
        pinYellow: '#ffcc33',
        cabinet: '#778899',
        cabinetDark: '#556677',
        cabinetPull: '#aabbcc',
    };

    // --- Minimal 3x5 Pixel Font (hoisted to module scope) ---
    const FONT = {
        A: 0x69f99,
        B: 0xf4e4f,
        C: 0x78887,
        D: 0xe9996e,
        E: 0xf8e8f,
        F: 0xf8e88,
        G: 0x789b7,
        H: 0x99f99,
        I: 0xe444e,
        J: 0x11196,
        K: 0x9aca9,
        L: 0x8888f,
        M: 0x9f999,
        N: 0x9db99,
        O: 0x69996,
        P: 0xe9e88,
        Q: 0x6996b,
        R: 0xe9ea9,
        S: 0x78167,
        T: 0xe4444,
        U: 0x99996,
        V: 0x99954,
        W: 0x999f9,
        X: 0x96699,
        Y: 0x99744,
        Z: 0xf1248f,
        0: 0x6bd96,
        1: 0x4c44e,
        2: 0x6124f,
        3: 0x61216,
        4: 0x99f11,
        5: 0xf8e1e,
        6: 0x68e96,
        7: 0xf1244,
        8: 0x69696,
        9: 0x697f1,
        ' ': 0x00000,
        '.': 0x00004,
        '!': 0x44404,
        '?': 0x61204,
        ':': 0x04040,
        '-': 0x00e00,
        '*': 0x09690,
        '/': 0x12480,
        '(': 0x24442,
        ')': 0x42224,
        '+': 0x04e40,
    };

    // --- Canvas Setup (adaptive, HiDPI-aware) ---
    // Compute the largest integer scale that fits the viewport, then multiply
    // by devicePixelRatio so the canvas backing store matches physical pixels.
    // This guarantees every logical pixel maps to an exact NxN block of device
    // pixels — no fractional scaling, no blur.
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    const maxCSSWidth = window.innerWidth - 20;
    const maxCSSHeight = window.innerHeight - 40;
    const SCALE = Math.max(1, Math.floor(Math.min(maxCSSWidth / W, maxCSSHeight / H)));
    canvas.width = W * SCALE * DPR;
    canvas.height = H * SCALE * DPR;
    canvas.style.width = `${W * SCALE}px`;
    canvas.style.height = `${H * SCALE}px`;
    ctx.imageSmoothingEnabled = false;

    const buf = document.createElement('canvas');
    buf.width = W;
    buf.height = H;
    const bx = buf.getContext('2d');

    // --- Host Messaging (Mezzanine controller surface) ---
    // The bench-era VS Code webview's postMessage channel is replaced
    // here with a direct callback the Vue host wires up. Zone clicks
    // (experiment chambers, monitors) are routed through `onInteraction`
    // so a future arc can dispatch a scientist into the clicked target
    // without re-opening the seam.
    function sendToExtension(msg) {
        onInteraction(msg);
    }

    // --- Character System ---
    const createCharacter =
        Core.createCharacter ??
        function createCharacter(id, type, x, y, activity, detail, color) {
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

    let colorIndex = 0;
    let characters = [
        createCharacter(
            'scientist',
            'scientist',
            POSITIONS.idle.x,
            POSITIONS.idle.y,
            'idle',
            'Waiting for experiments...',
        ),
    ];

    // Globals synced from characters[0] for backward compat with drawScientist/drawDesk/drawBeaker/drawLights
    let currentActivity = 'idle';
    let currentDetail = 'Waiting for experiments...';

    // --- Idle Sub-State System ---
    // When idle, the scientist cycles through behaviors instead of standing still
    const IDLE_SUBSTATES = ['standing', 'pacing', 'fidgeting', 'looking', 'standing'];
    const IDLE_SUBSTATE_DURATION = FPS * 4; // 4 seconds per sub-state

    // Pacing waypoints — nearby positions the scientist wanders to
    const IDLE_WAYPOINTS = [
        {x: 7 * TILE, y: 7 * TILE},
        {x: 11 * TILE, y: 7 * TILE},
        {x: 9 * TILE, y: 6 * TILE},
        {x: 9 * TILE, y: 8 * TILE},
        {x: 6 * TILE, y: 8 * TILE},
        {x: 12 * TILE, y: 6 * TILE},
        // New wing visits
        {x: 22 * TILE, y: 7 * TILE},
        {x: 23 * TILE, y: 11 * TILE},
    ];

    let idleSubstateIndex = 0;
    let idleSubstateTimer = 0;
    let idleWaypointIndex = 0;
    let fidgetFrame = 0;
    let lookDirection = 1;

    // --- Enhanced Visual State ---
    let breathFrame = 0;
    let stateFlashTimer = 0;
    let stateFlashColor = '#ffffff';
    let lightFlickerSeed = Math.random() * 1000;
    let errorShakeTimer = 0;
    let prevActivity = 'idle';
    let teslaArcFrame = 0;

    // --- Day/Night Cycle ---
    // Time phases based on real clock hours (or demo-accelerated)
    // Each phase defines window sky color, star visibility, and light tint
    const TIME_PHASES = {
        night: {sky: '#0a0e22', stars: true, lightTint: '#aabbdd', lightIntensity: 0.5},
        dawn: {sky: '#2a1a3e', stars: false, lightTint: '#ffccaa', lightIntensity: 0.7},
        morning: {sky: '#446699', stars: false, lightTint: '#ffeedd', lightIntensity: 0.9},
        day: {sky: '#5588bb', stars: false, lightTint: '#ffffff', lightIntensity: 1.0},
        afternoon: {sky: '#557799', stars: false, lightTint: '#ffeecc', lightIntensity: 0.95},
        dusk: {sky: '#442244', stars: false, lightTint: '#ffaa88', lightIntensity: 0.7},
        evening: {sky: '#1a1133', stars: true, lightTint: '#ccbbee', lightIntensity: 0.6},
    };

    function getTimePhase() {
        if (Core.getTimePhase) {
            return Core.getTimePhase(new Date().getHours(), demoMode, frame, FPS);
        }
        // Fallback if lab-core.js not loaded
        if (demoMode) {
            const phases = Object.keys(TIME_PHASES);
            return phases[Math.floor(frame / (FPS * 8)) % phases.length];
        }
        const hour = new Date().getHours();
        if (hour >= 22 || hour < 5) return 'night';
        if (hour >= 5 && hour < 7) return 'dawn';
        if (hour >= 7 && hour < 10) return 'morning';
        if (hour >= 10 && hour < 15) return 'day';
        if (hour >= 15 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 20) return 'dusk';
        return 'evening';
    }

    // --- State ---
    let frame = 0;
    let particleTimer = 0;
    let particles = [];
    let demoMode = false; // The Mezzanine's empty floor is deliberate (RD-out-of-scope).
    let demoIndex = 0;
    let demoTimer = 0;
    let lastFrameTime = 0;

    // --- Interactive State ---
    let mouseLabX = -1;
    let mouseLabY = -1;
    let hoveredZone = null;
    let clickReactions = {};
    let pokeCount = 0;
    let pokeResetTimer = 0;
    let konamiBuffer = [];
    let konamiActive = false;
    let konamiTimer = 0;
    const KONAMI_CODE = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    const POKE_PHRASES = [
        ['?', 'Hmm?', 'Yes?'],
        ['Hey!', 'Watch it!', 'Busy here!'],
        ['STOP!', 'ENOUGH!', "I'M WORKING!"],
        ["THAT'S IT!"],
    ];
    const RAINBOW = ['#ff4444', '#ffaa44', '#ffff44', '#44ff44', '#44ffff', '#4488ff', '#aa44ff'];

    // --- Drawing Helpers ---
    function px(x, y, color) {
        bx.fillStyle = color;
        bx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }

    function rect(x, y, w, h, color) {
        bx.fillStyle = color;
        bx.fillRect(Math.floor(x), Math.floor(y), w, h);
    }

    // --- Coordinate Translation (CSS → lab pixel space) ---
    function getLabCoords(event) {
        const r = canvas.getBoundingClientRect();
        return {x: (event.clientX - r.left) / SCALE, y: (event.clientY - r.top) / SCALE};
    }

    // --- Interactive Zones ---
    function getInteractiveZones() {
        const zones = [
            // Lab objects (static positions)
            {
                id: 'leftMonitor',
                x: LAB.leftDesk.x + 6,
                y: LAB.leftDesk.y,
                w: 10,
                h: 8,
                tip: 'DATA TERMINAL',
                action: 'openTerminal',
            },
            {id: 'centerMonitor', x: LAB.centerDesk.x + 6, y: LAB.centerDesk.y, w: 10, h: 8, tip: 'MAIN DISPLAY'},
            {
                id: 'rightMonitor',
                x: LAB.rightDesk.x + 6,
                y: LAB.rightDesk.y,
                w: 10,
                h: 8,
                tip: 'CODE TERMINAL',
                action: 'openTerminal',
            },
            {id: 'whiteboard', x: LAB.whiteboard.x, y: LAB.whiteboard.y, w: TILE * 3, h: TILE, tip: 'WHITEBOARD'},
            {id: 'beakers', x: LAB.beakerRack.x, y: LAB.beakerRack.y - 10, w: TILE * 2, h: 12, tip: 'BEAKER RACK'},
            {id: 'teslaCoil', x: LAB.teslaCoil.x, y: LAB.teslaCoil.y, w: 8, h: 16, tip: 'TESLA COIL'},
            {id: 'oscilloscope', x: LAB.oscilloscope.x, y: LAB.oscilloscope.y, w: 14, h: 12, tip: 'OSCILLOSCOPE'},
            {id: 'shelf', x: LAB.shelf.x, y: LAB.shelf.y - 10, w: TILE * 2, h: 12, tip: 'LIBRARY'},
            {id: 'door', x: LAB.door.x, y: LAB.door.y, w: TILE * 2, h: TILE * 2, tip: 'EXIT'},
            // New wing
            {
                id: 'gatekeeper',
                x: LAB.experimentGatekeeper.x,
                y: LAB.experimentGatekeeper.y,
                w: 40,
                h: 48,
                tip: 'THE GATEKEEPER',
                action: 'openExperiment:zmuuzn-auth',
            },
            {
                id: 'warTable',
                x: LAB.experimentWarTable.x,
                y: LAB.experimentWarTable.y,
                w: 40,
                h: 48,
                tip: 'THE WAR TABLE',
                action: 'openExperiment:zmuuzn-helldivers',
            },
            {
                id: 'crucible',
                x: LAB.experimentCrucible.x,
                y: LAB.experimentCrucible.y,
                w: 40,
                h: 48,
                tip: 'THE CRUCIBLE',
                action: 'openExperiment:zmuuzn-strava',
            },
            {
                id: 'quartermaster',
                x: LAB.quartermasterStation.x,
                y: LAB.quartermasterStation.y,
                w: TILE * 3,
                h: 28,
                tip: 'THE QUARTERMASTER',
            },
            {
                id: 'sentinels',
                x: LAB.sentinelPost.x - 2,
                y: LAB.sentinelPost.y - 4,
                w: TILE * 2 + 12,
                h: 48,
                tip: 'THE SENTINELS',
            },
            {id: 'corkboard', x: LAB.corkboard.x, y: LAB.corkboard.y, w: TILE * 5, h: TILE + 8, tip: 'CORKBOARD'},
            {
                id: 'documents',
                x: LAB.documentTable.x,
                y: LAB.documentTable.y,
                w: TILE * 4 + 8,
                h: 20,
                tip: 'DOCUMENT ARCHIVE',
                action: 'openFolder:docs',
            },
            {
                id: 'filingCabinet',
                x: LAB.filingCabinet.x,
                y: LAB.filingCabinet.y,
                w: 20,
                h: 36,
                tip: 'FILING CABINET',
                action: 'openFolder:docs',
            },
        ];

        // Dynamic zones (characters move, so bounds are computed each frame)
        const sci = characters[0];
        zones.push({id: 'scientist', x: sci.x - 4, y: sci.y - 7, w: 12, h: 22, tip: 'MAD SCIENTIST'});

        for (const c of characters) {
            if (c.type === 'minion' && !c.despawning && c.spawnPhase >= 5) {
                zones.push({
                    id: 'minion:' + c.id,
                    x: c.x - 2,
                    y: c.y - 3,
                    w: 8,
                    h: 13,
                    tip: c.detail.slice(0, 20).toUpperCase(),
                });
            }
        }

        return zones;
    }

    function hitTestZone(px, py) {
        const hitTest = Core.hitTestZones;
        if (hitTest) return hitTest(px, py, getInteractiveZones());
        const zones = getInteractiveZones();
        for (let i = zones.length - 1; i >= 0; i--) {
            const z = zones[i];
            if (px >= z.x && px < z.x + z.w && py >= z.y && py < z.y + z.h) return z;
        }
        return null;
    }

    // --- Lab Environment ---
    function drawFloor() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                rect(c * TILE, r * TILE, TILE, TILE, (r + c) % 2 === 0 ? PAL.floor : PAL.floorAlt);
                px(c * TILE, r * TILE, PAL.wall);
            }
        }
    }

    function drawWalls() {
        rect(0, 0, W, TILE * 3, PAL.wall);
        rect(0, TILE * 2, W, 4, PAL.wallTop);
        rect(0, 0, TILE, H, PAL.wall);
        rect(TILE - 2, 0, 2, H, PAL.wallTop);
        rect(W - TILE, 0, TILE, H, PAL.wall);
        rect(W - TILE, 0, 2, H, PAL.wallTop);

        // Door — shakes on click
        const doorShake = clickReactions.door > 0 ? Math.floor(Math.sin(frame * 3) * 1.5) : 0;
        const dx = LAB.door.x + doorShake;
        const dy = LAB.door.y;
        rect(dx, dy, TILE * 2, TILE * 2, PAL.doorFrame);
        rect(dx + 2, dy + 2, TILE * 2 - 4, TILE * 2 - 2, PAL.door);
        px(dx + TILE * 2 - 5, dy + TILE + 2, PAL.lightOn);

        // Window — sky changes with time of day
        const wx = LAB.window.x;
        const wy = LAB.window.y;
        const timePhase = getTimePhase();
        const timeConfig = TIME_PHASES[timePhase] ?? TIME_PHASES.night;

        rect(wx, wy, TILE * 4, TILE + 4, PAL.wallTop);
        rect(wx + 2, wy + 2, TILE * 4 - 4, TILE, timeConfig.sky);

        // Window cross-frame
        rect(wx + TILE * 2, wy + 2, 1, TILE, PAL.wallTop + '88');
        rect(wx + 2, wy + 2 + Math.floor(TILE / 2), TILE * 4 - 4, 1, PAL.wallTop + '88');

        if (timeConfig.stars) {
            // Stars (night / evening)
            const starPhase = frame * 0.05;
            for (let i = 0; i < 7; i++) {
                const sx = wx + 4 + ((i * 8 + Math.sin(starPhase + i) * 2) % (TILE * 4 - 8));
                const sy = wy + 3 + ((i * 5) % (TILE - 2));
                const twinkle = frame % (20 + i * 3) < 10 + i;
                px(sx, sy, twinkle ? '#ffffff' : '#6677aa');
            }
        } else if (timePhase === 'day' || timePhase === 'morning' || timePhase === 'afternoon') {
            // Clouds (daytime) — small drifting puffs
            const cloudX = wx + 4 + Math.floor((frame * 0.3) % (TILE * 4 - 12));
            const cloudY = wy + 4;
            rect(cloudX, cloudY, 4, 2, '#ffffff44');
            rect(cloudX + 1, cloudY - 1, 2, 1, '#ffffff33');
            // Second cloud
            const cloud2X = wx + 4 + Math.floor((frame * 0.3 + TILE * 2) % (TILE * 4 - 12));
            rect(cloud2X, cloudY + 4, 3, 2, '#ffffff33');
        } else if (timePhase === 'dawn' || timePhase === 'dusk') {
            // Horizon glow
            rect(wx + 2, wy + 2 + TILE - 3, TILE * 4 - 4, 3, timePhase === 'dawn' ? '#ff884422' : '#ff664422');
        }
    }

    function drawDesk(x, y, hasScreen, screenColor, screenRole) {
        rect(x, y + 8, TILE * 2, 6, PAL.deskTop);
        rect(x, y + 14, TILE * 2, 2, PAL.desk);
        rect(x + 1, y + 14, 2, TILE - 14, PAL.desk);
        rect(x + TILE * 2 - 3, y + 14, 2, TILE - 14, PAL.desk);

        // Monitor click flash
        const monitorId =
            screenRole === 'reading' ? 'leftMonitor' : screenRole === 'writing' ? 'rightMonitor' : 'centerMonitor';
        const monitorClicked = clickReactions[monitorId] > 0;

        if (hasScreen) {
            // Screen glow bleed — colored light halo around active monitors
            const isActiveScreen =
                (screenRole === 'reading' && currentActivity === 'reading') ||
                (screenRole === 'writing' && (currentActivity === 'writing' || currentActivity === 'running')) ||
                (screenRole === 'center' && currentActivity === 'thinking');

            if (isActiveScreen) {
                const glowColor = screenColor ?? PAL.screenGlow;
                const pulse = 0.12 + Math.sin(frame * 0.15) * 0.04;
                bx.globalAlpha = pulse;
                // Glow halo around monitor
                rect(x + 4, y - 2, 14, 12, glowColor);
                // Light cast onto desk surface
                rect(x + 4, y + 8, 14, 4, glowColor);
                bx.globalAlpha = 1;
            } else if (currentActivity === 'error') {
                // Red flicker glow on all screens during error
                if (frame % 6 < 3) {
                    bx.globalAlpha = 0.08;
                    rect(x + 4, y - 2, 14, 14, '#ff4444');
                    bx.globalAlpha = 1;
                }
            }

            rect(x + 6, y, 10, 8, PAL.screen);
            rect(x + 7, y + 1, 8, 6, screenColor ?? PAL.screenGlow);
            rect(x + 10, y + 8, 2, 2, PAL.pipe);

            // Click flash on monitor
            if (monitorClicked) {
                bx.globalAlpha = Math.min(clickReactions[monitorId] / 10, 0.6);
                rect(x + 7, y + 1, 8, 6, '#ffffff');
                bx.globalAlpha = 1;
            }

            // Dynamic screen content based on activity and screen role
            drawScreenContent(x + 7, y + 1, 8, 6, screenColor, screenRole);
        }
    }

    // --- Dynamic Screen Content ---
    function drawScreenContent(sx, sy, sw, sh, color, role) {
        // Dim color for text lines
        const dimColor = color + '88';

        if (role === 'reading' && currentActivity === 'reading') {
            // File tree: small indented lines
            const scroll = Math.floor(frame / 8) % 4;
            for (let i = 0; i < 3; i++) {
                const row = (i + scroll) % 5;
                const indent = row % 2 === 0 ? 0 : 2;
                const lineW = 3 + (row % 3);
                rect(sx + 1 + indent, sy + 1 + i * 2, lineW, 1, '#1a3366');
                // File icon dot
                if (indent === 0) px(sx + 1, sy + 1 + i * 2, '#6688cc');
            }
        } else if (role === 'writing' && currentActivity === 'writing') {
            // Scrolling code lines with syntax coloring
            const scroll = Math.floor(frame / 3) % 6;
            const lineColors = ['#004422', '#002244', '#442200', '#004422', '#220044', '#004422'];
            for (let i = 0; i < 3; i++) {
                const row = (i + scroll) % lineColors.length;
                const lineW = 2 + ((row + frame) % 5);
                rect(sx + 1, sy + 1 + i * 2, Math.min(lineW, sw - 2), 1, lineColors[row]);
            }
            // Blinking cursor
            if (frame % 10 < 6) {
                const cursorY = sy + 1 + 2 * 2;
                const cursorX = sx + 1 + (frame % 5);
                px(cursorX, cursorY, '#ffffff');
            }
        } else if (role === 'center' && currentActivity === 'thinking') {
            // Equations/formulas on the thinking screen
            const phase = Math.floor(frame / 12) % 3;
            if (phase === 0) {
                rect(sx + 1, sy + 1, 4, 1, '#003322');
                rect(sx + 2, sy + 3, 3, 1, '#003322');
                px(sx + 6, sy + 2, '#00ff88');
            } else if (phase === 1) {
                rect(sx + 1, sy + 2, 5, 1, '#003322');
                px(sx + 1, sy + 4, '#003322');
                rect(sx + 3, sy + 4, 3, 1, '#003322');
            } else {
                rect(sx + 2, sy + 1, 3, 1, '#003322');
                rect(sx + 1, sy + 3, 6, 1, '#003322');
                px(sx + 4, sy + 5, '#00ff88');
            }
        } else if (role === 'writing' && currentActivity === 'running') {
            // Command output: scrolling lines
            for (let i = 0; i < 3; i++) {
                const lw = 3 + ((i + frame) % 4);
                rect(sx + 1, sy + 1 + i * 2, lw, 1, '#003322');
            }
        } else if (currentActivity === 'idle') {
            // Screensaver: bouncing pixel dot
            const period = 60;
            const t = (frame % period) / period;
            const dotX = sx + 1 + Math.floor(Math.abs(Math.sin(t * Math.PI * 2)) * (sw - 3));
            const dotY = sy + 1 + Math.floor(Math.abs(Math.cos(t * Math.PI * 1.5)) * (sh - 3));
            px(dotX, dotY, color);
            // Trail
            if (frame % 4 < 2) px(dotX - 1, dotY, dimColor);
        } else if (currentActivity === 'error') {
            // Static/glitch effect
            if (frame % 3 === 0) {
                for (let i = 0; i < 4; i++) {
                    const gx = sx + 1 + Math.floor(Math.random() * (sw - 2));
                    const gy = sy + 1 + Math.floor(Math.random() * (sh - 2));
                    px(gx, gy, Math.random() > 0.5 ? '#ff4444' : '#441111');
                }
            }
            // Warning text placeholder — red line
            rect(sx + 2, sy + 3, 4, 1, '#ff2222');
        }
    }

    function drawBeaker(x, y, liquidColor, fillLevel) {
        rect(x + 2, y, 4, 10, PAL.beaker + '44');
        const lh = Math.floor(fillLevel * 8);
        rect(x + 2, y + 10 - lh, 4, lh, liquidColor);
        rect(x + 1, y, 6, 1, PAL.beaker);

        if (currentActivity === 'running' || currentActivity === 'thinking') {
            const by = y + 10 - lh + Math.sin(frame * 0.5) * 2;
            if (by > y) {
                px(x + 3, Math.floor(by), PAL.bubbles);
                px(x + 4, Math.floor(by - 1), PAL.bubbles);
            }
        }
    }

    function drawShelf(x, y) {
        rect(x, y, TILE * 2, 2, PAL.shelf);
        rect(x + 2, y - 8, 3, 8, PAL.book1);
        rect(x + 6, y - 10, 3, 10, PAL.book2);
        rect(x + 10, y - 7, 3, 7, PAL.book3);
        rect(x + 14, y - 9, 4, 9, PAL.book1);
        rect(x + 19, y - 6, 3, 6, PAL.book2);
    }

    function drawPipes() {
        // Horizontal pipe (extends across entire lab including new wing)
        rect(TILE, TILE * 2 + 6, W - TILE * 2, 2, PAL.pipe);
        rect(TILE, TILE * 2 + 6, W - TILE * 2, 1, PAL.pipeHighlight);
        // Vertical pipes — old wing
        rect(TILE * 5, TILE * 2 + 6, 2, TILE * 3, PAL.pipe);
        rect(TILE * 5, TILE * 2 + 6, 1, TILE * 3, PAL.pipeHighlight);
        rect(TILE * 15, TILE * 2 + 6, 2, TILE * 3, PAL.pipe);
        rect(TILE * 15, TILE * 2 + 6, 1, TILE * 3, PAL.pipeHighlight);
        // Vertical pipes — new wing
        rect(TILE * 23, TILE * 2 + 6, 2, TILE * 3, PAL.pipe);
        rect(TILE * 23, TILE * 2 + 6, 1, TILE * 3, PAL.pipeHighlight);
        rect(TILE * 27, TILE * 2 + 6, 2, TILE * 3, PAL.pipe);
        rect(TILE * 27, TILE * 2 + 6, 1, TILE * 3, PAL.pipeHighlight);

        // Animated flow pulses along horizontal pipe when active
        if (currentActivity !== 'idle') {
            const flowSpeed = currentActivity === 'running' ? 0.8 : 0.4;
            for (let i = 0; i < 7; i++) {
                const flowX = TILE + ((Math.floor(frame * flowSpeed * 3) + i * 56) % (W - TILE * 2));
                const flowAlpha = Math.sin((frame * flowSpeed + i * 2) * 0.5) * 0.3 + 0.3;
                bx.globalAlpha = flowAlpha;
                rect(flowX, TILE * 2 + 6, 4, 1, PAL.pipeFlow);
                bx.globalAlpha = 1;
            }
            // Vertical pipe flow (downward)
            for (let i = 0; i < 3; i++) {
                const flowY = TILE * 2 + 6 + ((Math.floor(frame * flowSpeed * 2) + i * 16) % (TILE * 3));
                const flowAlpha = Math.sin((frame * flowSpeed + i) * 0.6) * 0.3 + 0.3;
                bx.globalAlpha = flowAlpha;
                px(TILE * 5, flowY, PAL.pipeFlow);
                px(TILE * 15, flowY, PAL.pipeFlow);
                px(TILE * 23, flowY, PAL.pipeFlow);
                px(TILE * 27, flowY, PAL.pipeFlow);
                bx.globalAlpha = 1;
            }
        }
    }

    function drawLights() {
        const timeConfig = TIME_PHASES[getTimePhase()] ?? TIME_PHASES.night;
        const intensity = timeConfig.lightIntensity;
        lightFlickerSeed += 0.1;

        // 5 lights: 3 in old wing + 2 in new wing
        const lightPositions = [4, 10, 16, 23, 28];
        for (let i = 0; i < lightPositions.length; i++) {
            const lx = lightPositions[i] * TILE;
            const isOn = currentActivity !== 'idle' || frame % 60 < 50;

            // Subtle flicker — each light has independent noise
            const flicker = Math.sin(lightFlickerSeed * (1.3 + i * 0.7)) * 0.06;
            const flickerIntensity = intensity + (isOn ? flicker : 0);

            // Error state: lights flicker rapidly and erratically
            const errorFlicker = currentActivity === 'error' && frame % (3 + i) < 1 + i ? 0.5 : 0;

            if (isOn && errorFlicker < 0.4) {
                // Light color shifts with time of day
                rect(lx, TILE * 2, 8, 3, timeConfig.lightTint);
                // Glow cone — intensity varies by time + flicker
                const glowAlpha = Math.floor(Math.max(0, Math.min(1, flickerIntensity)) * 34)
                    .toString(16)
                    .padStart(2, '0');
                bx.fillStyle = timeConfig.lightTint + glowAlpha;
                bx.fillRect(lx - 4, TILE * 2 + 3, 16, 8);

                // Extended light cone — faint reach toward the floor
                bx.globalAlpha = Math.max(0, flickerIntensity * 0.06);
                bx.fillStyle = timeConfig.lightTint;
                bx.fillRect(lx - 8, TILE * 2 + 11, 24, 12);
                bx.globalAlpha = 1;
            } else {
                // Dimmed light with subtle time tint
                rect(lx, TILE * 2, 8, 3, PAL.lightOff);
                // Even off lights get a faint ambient glow at night
                if (intensity < 0.7) {
                    bx.fillStyle = timeConfig.lightTint + '08';
                    bx.fillRect(lx - 2, TILE * 2 + 3, 12, 4);
                }
            }
        }
    }

    function drawLab() {
        drawFloor();
        drawWalls();
        drawPipes();

        drawDesk(LAB.leftDesk.x, LAB.leftDesk.y, true, PAL.screenBlue, 'reading');
        drawShelf(LAB.shelf.x, LAB.shelf.y);
        drawDesk(LAB.centerDesk.x, LAB.centerDesk.y, true, PAL.screenGlow, 'center');
        drawDesk(LAB.rightDesk.x, LAB.rightDesk.y, true, PAL.screenAmber, 'writing');

        // Beaker rack
        const bk = LAB.beakerRack;
        rect(bk.x, bk.y, TILE * 2, 2, PAL.shelf);
        drawBeaker(bk.x + 1, bk.y - 10, PAL.beakerLiquid, 0.6);
        drawBeaker(bk.x + 9, bk.y - 10, PAL.beakerLiquidAlt, 0.4);
        drawBeaker(bk.x + 17, bk.y - 10, PAL.beaker, 0.8);

        // Whiteboard
        const wb = LAB.whiteboard;
        rect(wb.x, wb.y, TILE * 3, TILE, '#ddeeff');
        rect(wb.x + 1, wb.y + 1, TILE * 3 - 2, TILE - 2, '#ffffff');
        if (currentActivity === 'thinking') {
            bx.fillStyle = '#334455';
            bx.fillRect(wb.x + 3, wb.y + 3, 8, 1);
            bx.fillRect(wb.x + 3, wb.y + 6, 12, 1);
            bx.fillRect(wb.x + 3, wb.y + 9, 6, 1);
            bx.fillRect(wb.x + 20, wb.y + 3, 1, 6);
            bx.fillRect(wb.x + 21, wb.y + 5, 1, 2);
        }

        // Equipment table + microscope
        const eq = LAB.equipmentTable;
        rect(eq.x, eq.y, TILE * 3, 2, PAL.deskTop);
        rect(eq.x, eq.y + 2, TILE * 3, 1, PAL.desk);
        const mc = LAB.microscope;
        rect(mc.x, mc.y + 8, 2, 8, PAL.pipe);
        rect(mc.x - 1, mc.y + 6, 4, 2, PAL.pipe);
        rect(mc.x + 3, mc.y + 12, 4, 4, PAL.pipe);
        px(mc.x - 1, mc.y + 6, PAL.goggleGlass);

        drawOscilloscope();
        drawTeslaCoil();
        drawLEDs();
        drawLights();

        // New wing
        drawSupportPillar();
        drawExperimentChambers();
        drawQuartermaster();
        drawSentinels();
        drawDocumentArchive();
    }

    // --- Oscilloscope with waveform ---
    function drawOscilloscope() {
        const ox = LAB.oscilloscope.x;
        const oy = LAB.oscilloscope.y;

        // Oscilloscope body
        rect(ox, oy, 14, 12, PAL.oscilloscope);
        rect(ox + 1, oy + 1, 12, 8, '#0a1a0a');

        // Waveform — changes shape based on activity (+ click spike)
        const oscClicked = clickReactions.oscilloscope > 0;
        const waveColor = currentActivity === 'error' || oscClicked ? '#ff4444' : PAL.waveform;
        for (let i = 0; i < 10; i++) {
            let waveY;
            if (oscClicked) {
                // Wild spike on click
                waveY = oy + 5 + Math.floor(Math.sin(frame * 2 + i * 1.2) * 3 + (Math.random() - 0.5) * 2);
            } else if (currentActivity === 'error') {
                // Chaotic noise waveform
                waveY = oy + 5 + Math.floor(Math.sin(frame * 1.5 + i * 0.8) * 3 + (Math.random() - 0.5) * 2);
            } else if (currentActivity === 'running') {
                // Fast sawtooth-like pulse
                waveY = oy + 5 + Math.floor(Math.sin((frame * 0.6 + i * 0.9) * 1.2) * 3);
            } else if (currentActivity === 'idle') {
                // Flat line with gentle drift
                waveY = oy + 5 + Math.floor(Math.sin(frame * 0.05 + i * 0.2) * 1);
            } else {
                // Smooth sine wave
                waveY = oy + 5 + Math.floor(Math.sin(frame * 0.3 + i * 0.7) * 2.5);
            }
            waveY = Math.max(oy + 2, Math.min(oy + 8, waveY));
            px(ox + 2 + i, waveY, waveColor);
        }

        // Scope bezel highlights
        rect(ox, oy + 10, 14, 2, PAL.pipe);
        px(ox + 1, oy + 10, PAL.pipeHighlight);
    }

    // --- Tesla Coil ---
    function drawTeslaCoil() {
        const tx = LAB.teslaCoil.x;
        const ty = LAB.teslaCoil.y;

        // Base pedestal
        rect(tx + 1, ty + 10, 6, 4, PAL.teslaBase);
        rect(tx + 2, ty + 8, 4, 2, PAL.teslaBase);
        rect(tx, ty + 14, 8, 2, PAL.pipe);

        // Coil body (vertical cylinder)
        rect(tx + 3, ty + 2, 2, 6, PAL.pipeHighlight);
        rect(tx + 2, ty + 2, 1, 6, PAL.pipe);

        // Top sphere
        rect(tx + 2, ty, 4, 2, PAL.pipeHighlight);
        rect(tx + 1, ty + 1, 1, 1, PAL.pipe);
        rect(tx + 6, ty + 1, 1, 1, PAL.pipe);

        // Electrical arcs during error state or click reaction
        if (currentActivity === 'error' || clickReactions.teslaCoil > 0) {
            teslaArcFrame++;
            // Primary arc — jagged line shooting out
            const arcLen = 3 + Math.floor(Math.sin(teslaArcFrame * 0.7) * 2);
            for (let i = 0; i < arcLen; i++) {
                const ax = tx + 1 - i + Math.floor(Math.sin(teslaArcFrame * 1.3 + i) * 1.5);
                const ay = ty + i * (teslaArcFrame % 2 === 0 ? -1 : 1);
                if (ay >= 0 && ay < H) {
                    px(ax, ay, PAL.teslaArc);
                    if (i % 2 === 0) px(ax + 1, ay, PAL.teslaGlow + '88');
                }
            }
            // Secondary arc — opposite direction
            for (let i = 0; i < arcLen - 1; i++) {
                const ax = tx + 7 + i + Math.floor(Math.cos(teslaArcFrame * 0.9 + i) * 1.5);
                const ay = ty + 1 + i * (teslaArcFrame % 3 === 0 ? 1 : -1);
                if (ay >= 0 && ay < H) {
                    px(ax, ay, PAL.teslaArc);
                }
            }
            // Glow around top sphere
            bx.globalAlpha = 0.3 + Math.sin(teslaArcFrame * 0.5) * 0.2;
            rect(tx, ty - 1, 8, 4, PAL.teslaGlow + '44');
            bx.globalAlpha = 1;
        } else {
            teslaArcFrame = 0;
            // Dormant glow — faint charge indicator
            if (currentActivity === 'running' && frame % 20 < 10) {
                px(tx + 3, ty - 1, PAL.teslaArc + '44');
                px(tx + 4, ty - 1, PAL.teslaArc + '44');
            }
        }
    }

    // --- Blinking LED Indicators ---
    function drawLEDs() {
        // Desk LEDs — one per desk, blinks when active
        const deskConfigs = [
            {pos: LAB.leftDesk, active: currentActivity === 'reading'},
            {pos: LAB.centerDesk, active: currentActivity === 'thinking'},
            {pos: LAB.rightDesk, active: currentActivity === 'writing'},
        ];

        for (const cfg of deskConfigs) {
            const lx = cfg.pos.x + TILE * 2 - 2;
            const ly = cfg.pos.y + 9;
            if (cfg.active) {
                const blink = frame % 16 < 12;
                px(lx, ly, blink ? PAL.led : PAL.ledOff);
            } else {
                px(lx, ly, PAL.ledOff);
            }
        }

        // Beaker rack LED — red when error, green when running
        const blx = LAB.beakerRack.x + TILE * 2 - 1;
        const bly = LAB.beakerRack.y + 1;
        if (currentActivity === 'error') {
            px(blx, bly, frame % 8 < 4 ? PAL.ledRed : PAL.ledRedOff);
        } else if (currentActivity === 'running') {
            px(blx, bly, frame % 12 < 8 ? PAL.led : PAL.ledOff);
        } else {
            px(blx, bly, PAL.ledOff);
        }

        // Equipment table LED
        const elx = LAB.equipmentTable.x + TILE * 3 - 2;
        const ely = LAB.equipmentTable.y - 1;
        const eqActive = currentActivity !== 'idle' && currentActivity !== 'waiting';
        px(elx, ely, eqActive ? (frame % 20 < 14 ? PAL.led : PAL.ledOff) : PAL.ledOff);
    }

    // --- Support Pillar (divides old wing from new wing) ---
    function drawSupportPillar() {
        const px0 = LAB.supportPillar.x;
        const py0 = LAB.supportPillar.y;
        // Vertical pillar beam
        rect(px0 + 2, py0, 4, H - TILE * 3, PAL.pipe);
        rect(px0 + 2, py0, 1, H - TILE * 3, PAL.pipeHighlight);
        // Top bracket
        rect(px0, py0, 8, 3, PAL.wallTop);
        // Bottom bracket
        rect(px0, H - TILE * 3, 8, 3, PAL.wallTop);
        // Archway label
        drawPixelText(px0 - 2, py0 + 6, 'NEW', PAL.screenGlow + '66');
        drawPixelText(px0 - 4, py0 + 13, 'WING', PAL.screenGlow + '66');
    }

    // --- Experiment Chambers ---
    function drawExperimentChambers() {
        drawExperimentChamber(LAB.experimentGatekeeper.x, LAB.experimentGatekeeper.y, 'gatekeeper');
        drawExperimentChamber(LAB.experimentWarTable.x, LAB.experimentWarTable.y, 'wartable');
        drawExperimentChamber(LAB.experimentCrucible.x, LAB.experimentCrucible.y, 'crucible');
    }

    function drawExperimentChamber(x, y, type) {
        const glowColor =
            type === 'gatekeeper' ? PAL.gatekeeperGlow : type === 'crucible' ? PAL.crucibleGlow : PAL.warTableGlow;
        const liquidColor =
            type === 'gatekeeper'
                ? PAL.gatekeeperLiquid
                : type === 'crucible'
                  ? PAL.crucibleLiquid
                  : PAL.warTableLiquid;

        // Metal frame / housing
        rect(x, y, 40, 48, PAL.chamberFrame);
        rect(x + 1, y + 1, 38, 46, PAL.wall);

        // Glass chamber interior
        rect(x + 4, y + 4, 32, 32, '#0a0a1a');

        // Liquid fill (animated level)
        const phaseOffset = type === 'gatekeeper' ? 0 : type === 'crucible' ? 4 : 2;
        const fillWave = Math.sin(frame * 0.08 + phaseOffset) * 2;
        const fillH = 22 + Math.floor(fillWave);
        rect(x + 4, y + 4 + (32 - fillH), 32, fillH, liquidColor);

        // Liquid surface highlight
        rect(x + 4, y + 4 + (32 - fillH), 32, 1, glowColor + '44');

        // Bubbles rising inside
        for (let i = 0; i < 3; i++) {
            const bx0 = x + 8 + ((frame + i * 11) % 24);
            const by0 = y + 32 - ((frame * 0.4 + i * 9) % 26);
            if (by0 > y + 6 && by0 < y + 34) {
                px(bx0, Math.floor(by0), glowColor + '88');
            }
        }

        // Experiment icon
        if (type === 'gatekeeper') {
            drawShieldIcon(x + 14, y + 10, glowColor);
        } else if (type === 'crucible') {
            drawFlameIcon(x + 14, y + 10, glowColor);
        } else {
            drawRadarIcon(x + 14, y + 10, glowColor);
        }

        // Glass reflection lines
        bx.globalAlpha = 0.15;
        rect(x + 6, y + 6, 2, 24, '#ffffff');
        rect(x + 32, y + 8, 1, 20, '#ffffff');
        bx.globalAlpha = 1;

        // Chamber glow pulse — intensifies on click
        const clickBoost = clickReactions[type] > 0 ? 0.2 : 0;
        const pulse =
            0.06 +
            clickBoost +
            Math.sin(frame * 0.1 + (type === 'gatekeeper' ? 0 : type === 'crucible' ? 5 : 3)) * 0.03;
        bx.globalAlpha = pulse;
        rect(x + 2, y + 2, 36, 36, glowColor);
        bx.globalAlpha = 1;

        // Base pedestal
        rect(x, y + 36, 40, 4, PAL.teslaBase);
        rect(x + 1, y + 36, 38, 1, PAL.pipeHighlight);

        // Status LED
        const ledOn = frame % 24 < 18;
        px(x + 18, y + 38, ledOn ? PAL.led : PAL.ledOff);
        px(x + 20, y + 38, ledOn ? PAL.led : PAL.ledOff);

        // Nameplate
        rect(x + 2, y + 41, 36, 7, PAL.wall + 'cc');
        const name = type === 'gatekeeper' ? 'GATEKEEPER' : type === 'crucible' ? 'CRUCIBLE' : 'WAR TABLE';
        const nameX = x + 4 + Math.floor((32 - name.length * 4) / 2);
        drawPixelText(nameX, y + 42, name, glowColor);
    }

    function drawShieldIcon(x, y, color) {
        // Shield shape (12×14 pixels)
        //   ████████
        //  ██████████
        //  ██████████
        //  ██████████
        //  ██ ████ ██
        //   ████████
        //    ██████
        //     ████
        //      ██
        rect(x + 1, y, 10, 1, color);
        rect(x, y + 1, 12, 3, color);
        // Keyhole cutout
        rect(x + 5, y + 3, 2, 2, '#0a0a1a');
        rect(x, y + 4, 12, 2, color);
        rect(x + 5, y + 5, 2, 3, '#0a0a1a');
        rect(x + 1, y + 6, 10, 2, color);
        rect(x + 2, y + 8, 8, 2, color);
        rect(x + 3, y + 10, 6, 1, color);
        rect(x + 4, y + 11, 4, 1, color);
        rect(x + 5, y + 12, 2, 1, color);
        // Inner lock detail
        px(x + 5, y + 3, color + '88');
        px(x + 6, y + 3, color + '88');
    }

    function drawRadarIcon(x, y, color) {
        // Radar / tactical display (12×14 pixels)
        // Circular sweep with center dot and markers
        rect(x + 3, y, 6, 1, color + '88');
        rect(x + 1, y + 1, 10, 1, color + '66');
        rect(x, y + 2, 12, 10, color + '33');
        rect(x + 1, y + 12, 10, 1, color + '66');
        rect(x + 3, y + 13, 6, 1, color + '88');

        // Crosshair
        rect(x + 5, y + 2, 2, 10, color + '44');
        rect(x, y + 6, 12, 2, color + '44');

        // Center dot
        rect(x + 5, y + 6, 2, 2, color);

        // Radar sweep arm (rotating)
        const angle = (frame * 0.15) % (Math.PI * 2);
        const len = 5;
        for (let i = 0; i < len; i++) {
            const sx = x + 6 + Math.floor(Math.cos(angle) * i);
            const sy = y + 7 + Math.floor(Math.sin(angle) * i);
            if (sx >= x && sx < x + 12 && sy >= y + 2 && sy < y + 12) {
                px(sx, sy, color);
            }
        }

        // Blips (enemy markers)
        const blip1X = x + 3 + Math.floor(Math.sin(frame * 0.03) * 2);
        const blip2X = x + 8 + Math.floor(Math.cos(frame * 0.04) * 1);
        px(blip1X, y + 4, color);
        px(blip2X, y + 9, color);
        if (frame % 16 < 10) px(x + 9, y + 5, color + '88');
    }

    function drawFlameIcon(x, y, color) {
        // Flame / crucible fire (12×14 pixels)
        // Animated flicker for a living fire effect
        const flicker = Math.floor(Math.sin(frame * 0.2) * 1);

        //      ██
        //     ████
        //    ██████
        //   ████████
        //   ████████
        //  ██████████
        //  ██████████
        //  ██ ████ ██
        //   ████████
        //    ██████
        //     ████
        //      ██
        // Inner flame (bright core)
        px(x + 5, y + flicker, color);
        px(x + 6, y + flicker, color);
        rect(x + 4, y + 1 + flicker, 4, 1, color);
        rect(x + 3, y + 2, 6, 2, color);
        rect(x + 2, y + 4, 8, 2, color);
        rect(x + 1, y + 6, 10, 2, color);
        rect(x, y + 8, 12, 2, color);
        // Outer taper
        rect(x + 1, y + 10, 10, 1, color + 'cc');
        rect(x + 2, y + 11, 8, 1, color + '99');
        rect(x + 3, y + 12, 6, 1, color + '66');
        rect(x + 4, y + 13, 4, 1, color + '44');
        // Inner heat shimmer
        const shimmer = frame % 12 < 6;
        if (shimmer) {
            px(x + 5, y + 5, '#ffee88');
            px(x + 6, y + 5, '#ffee88');
            px(x + 5, y + 6, '#ffee88');
            px(x + 6, y + 6, '#ffee88');
        }
    }

    // --- Personnel: The Quartermaster ---
    function drawQuartermaster() {
        const qx = LAB.quartermasterStation.x;
        const qy = LAB.quartermasterStation.y;

        // Supply counter (wooden desk)
        rect(qx, qy + 20, TILE * 3, 2, PAL.deskTop);
        rect(qx, qy + 22, TILE * 3, 6, PAL.qmCounter);
        rect(qx, qy + 22, TILE * 3, 1, PAL.deskTop);

        // Counter items (clipboard, manifest)
        rect(qx + 4, qy + 18, 4, 4, PAL.docWhite);
        rect(qx + 5, qy + 19, 2, 2, '#334455');
        // Small bottle
        rect(qx + 36, qy + 17, 3, 5, PAL.beaker + '88');
        rect(qx + 36, qy + 17, 3, 1, PAL.pipeHighlight);

        // Supply crates (stacked behind counter)
        drawCrate(qx + 2, qy + 8, 12, 12);
        drawCrate(qx + 16, qy + 10, 10, 10);
        // Small crate on top
        drawCrate(qx + 4, qy, 8, 8);

        // Wall hooks with tools
        px(qx + 32, qy + 2, PAL.pipe);
        rect(qx + 31, qy + 3, 3, 6, PAL.pipeHighlight);
        px(qx + 38, qy + 4, PAL.pipe);
        rect(qx + 37, qy + 5, 3, 4, '#aa6633');

        // The Quartermaster character (stationary, behind counter)
        drawQMCharacter(qx + 20, qy + 6);

        // LED on counter
        const qmLed = currentActivity !== 'idle' ? PAL.led : PAL.ledOff;
        px(qx + TILE * 3 - 2, qy + 21, frame % 30 < 22 ? qmLed : PAL.ledOff);

        // Nameplate on counter front
        drawPixelText(qx + 8, qy + 24, 'QUARTERMASTER', PAL.qmVest);
    }

    function drawCrate(x, y, w, h) {
        rect(x, y, w, h, PAL.qmCrate);
        rect(x, y, w, 1, PAL.qmCrateShadow);
        rect(x, y, 1, h, PAL.qmCrateShadow);
        // Cross straps
        rect(x + Math.floor(w / 2), y, 1, h, PAL.qmCrateShadow + '88');
        rect(x, y + Math.floor(h / 2), w, 1, PAL.qmCrateShadow + '88');
    }

    function drawQMCharacter(x, y) {
        // The Quartermaster — similar build to scientist but with vest instead of lab coat
        const bob = Math.sin(frame * 0.06) * 0.3;
        const cy = y + Math.floor(bob);

        // Legs
        rect(x, cy + 10, 2, 3, PAL.pants);
        rect(x + 2, cy + 10, 2, 3, PAL.pants);
        rect(x, cy + 13, 2, 1, PAL.shoes);
        rect(x + 2, cy + 13, 2, 1, PAL.shoes);

        // Vest / body
        rect(x - 2, cy + 3, 8, 7, PAL.qmVest);
        rect(x - 2, cy + 3, 1, 7, PAL.qmVestShadow);
        // Shirt underneath
        rect(x, cy + 4, 4, 5, '#ddd8cc');

        // Arms — occasionally checking clipboard
        const checkClip = Math.floor(frame / 40) % 6 === 0;
        const armOff = checkClip ? -2 : 0;
        rect(x - 3, cy + 4, 1, 4 + armOff, PAL.qmVest);
        px(x - 3, cy + 7 + armOff, PAL.skin);
        rect(x + 6, cy + 4, 1, 5, PAL.qmVest);
        px(x + 6, cy + 8, PAL.skin);

        // Head
        rect(x, cy - 2, 4, 4, PAL.skin);
        // Hat / cap
        rect(x - 1, cy - 3, 6, 2, PAL.qmVestShadow);
        rect(x - 1, cy - 4, 6, 1, PAL.qmVest);
        // Brim
        rect(x - 2, cy - 2, 8, 1, PAL.qmVestShadow);

        // Eyes (blink offset from scientist)
        if ((frame + 10) % 35 !== 0) {
            px(x + 1, cy, '#334455');
            px(x + 2, cy, '#334455');
        }

        // Mouth
        px(x + 1, cy + 1, '#aa8877');
    }

    // --- Personnel: The Sentinels ---
    function drawSentinels() {
        const sx = LAB.sentinelPost.x;
        const sy = LAB.sentinelPost.y;

        // Status board (on wall behind sentinels)
        rect(sx - 2, sy - 4, TILE * 2 + 8, 12, PAL.screen);
        rect(sx - 1, sy - 3, TILE * 2 + 6, 10, '#0a1a0a');

        // Status check marks (green = pass, red = fail based on activity)
        const isError = currentActivity === 'error';
        const checks = [
            {label: 'P', pass: !isError},
            {label: 'S', pass: !isError},
            {label: 'D', pass: !isError},
            {label: 'F', pass: true},
        ];
        for (let i = 0; i < checks.length; i++) {
            const cx0 = sx + 2 + i * 9;
            const cy0 = sy - 2;
            const checkColor = checks[i].pass ? PAL.led : PAL.ledRed;
            const blink = checks[i].pass || frame % 12 < 8;
            px(cx0, cy0, blink ? checkColor : PAL.ledOff);
            px(cx0 + 1, cy0 + 1, blink ? checkColor : PAL.ledOff);
            px(cx0 + 2, cy0, blink ? checkColor : PAL.ledOff);
            // Label below
            drawPixelText(cx0 - 1, cy0 + 4, checks[i].label, PAL.pipeHighlight + '88');
        }

        // Three sentinel robots
        for (let i = 0; i < 3; i++) {
            drawSentinelRobot(sx + i * 14, sy + 14, i);
        }

        // Scanning beam (sweeps across floor)
        const scanPhase = (frame * 0.1) % (Math.PI * 2);
        const beamX = sx + 16 + Math.floor(Math.sin(scanPhase) * 18);
        bx.globalAlpha = 0.15 + Math.sin(frame * 0.3) * 0.05;
        // Cone from center sentinel down
        const beamTop = sy + 20;
        const beamBot = sy + 36;
        for (let row = beamTop; row < beamBot; row++) {
            const spread = (row - beamTop) * 0.5;
            rect(beamX - Math.floor(spread), row, Math.floor(spread * 2) + 1, 1, PAL.sentinelScan);
        }
        bx.globalAlpha = 1;

        // Nameplate
        drawPixelText(sx + 4, sy + 40, 'SENTINELS', PAL.sentinelScan);
    }

    function drawSentinelRobot(x, y, index) {
        // Pedestal
        rect(x, y + 16, 10, 4, PAL.sentinelPedestal);
        rect(x + 1, y + 16, 8, 1, PAL.pipeHighlight);

        // Body (angular, metallic)
        rect(x + 2, y + 8, 6, 8, PAL.sentinelBody);
        rect(x + 2, y + 8, 1, 8, PAL.sentinelBodyDark);
        rect(x + 7, y + 8, 1, 8, PAL.sentinelBodyDark);

        // Chest plate detail
        rect(x + 3, y + 10, 4, 3, PAL.sentinelBodyDark);
        px(x + 4, y + 11, PAL.pipeHighlight);
        px(x + 5, y + 11, PAL.pipeHighlight);

        // Arms (stubby, angular)
        rect(x, y + 9, 2, 5, PAL.sentinelBody);
        rect(x + 8, y + 9, 2, 5, PAL.sentinelBody);

        // Head (with single scanning eye)
        rect(x + 3, y + 4, 4, 4, PAL.sentinelBody);
        rect(x + 2, y + 4, 6, 1, PAL.sentinelBodyDark);

        // Antenna
        px(x + 5, y + 2, PAL.pipe);
        px(x + 5, y + 3, PAL.pipeHighlight);

        // Scanning eye — locks on during click, shifts normally otherwise
        const sentinelAlert = clickReactions.sentinels > 0;
        const eyeShift = sentinelAlert ? 0 : Math.floor(Math.sin(frame * 0.2 + index * 2) * 1);
        const eyeColor = sentinelAlert
            ? frame % 4 < 3
                ? PAL.sentinelEye
                : PAL.sentinelScan
            : currentActivity === 'error'
              ? frame % 6 < 3
                  ? PAL.sentinelEye
                  : PAL.ledRedOff
              : frame % 20 < 16
                ? PAL.sentinelScan
                : PAL.sentinelScan + '66';
        px(x + 4 + eyeShift, y + 6, eyeColor);
        px(x + 5 + eyeShift, y + 6, eyeColor);

        // Legs
        rect(x + 3, y + 16, 2, 2, PAL.sentinelBodyDark);
        rect(x + 5, y + 16, 2, 2, PAL.sentinelBodyDark);
    }

    // --- Document Archive ---
    function drawDocumentArchive() {
        drawCorkboard();
        drawFilingCabinet();
        drawDocumentStacks();
    }

    function drawCorkboard() {
        const cx0 = LAB.corkboard.x;
        const cy0 = LAB.corkboard.y;

        // Cork board frame
        rect(cx0, cy0, TILE * 5, TILE + 8, PAL.corkboardDark);
        rect(cx0 + 2, cy0 + 2, TILE * 5 - 4, TILE + 4, PAL.corkboardColor);

        // Pinned documents (5 small sheets)
        const docs = [
            {dx: 4, dy: 4, w: 10, h: 8, color: PAL.docWhite, pin: PAL.pinRed},
            {dx: 18, dy: 3, w: 8, h: 10, color: PAL.docBlue, pin: PAL.pinBlue},
            {dx: 30, dy: 5, w: 10, h: 7, color: PAL.docGreen, pin: PAL.pinGreen},
            {dx: 44, dy: 3, w: 9, h: 9, color: PAL.docRed, pin: PAL.pinRed},
            {dx: 58, dy: 4, w: 8, h: 8, color: PAL.docYellow, pin: PAL.pinYellow},
        ];

        for (const d of docs) {
            const dx = cx0 + d.dx;
            const dy = cy0 + d.dy;
            // Sheet
            rect(dx, dy, d.w, d.h, d.color);
            // Text lines on sheet
            rect(dx + 1, dy + 2, d.w - 2, 1, '#00000022');
            rect(dx + 1, dy + 4, Math.floor(d.w * 0.6), 1, '#00000022');
            if (d.h > 7) rect(dx + 1, dy + 6, d.w - 3, 1, '#00000022');
            // Pin
            rect(dx + Math.floor(d.w / 2) - 1, dy - 1, 2, 2, d.pin);
            // Pin shine
            px(dx + Math.floor(d.w / 2) - 1, dy - 1, '#ffffff88');
        }
    }

    function drawFilingCabinet() {
        const fx = LAB.filingCabinet.x;
        const fy = LAB.filingCabinet.y;

        // Cabinet body
        rect(fx, fy, 20, 36, PAL.cabinet);
        rect(fx, fy, 20, 1, PAL.cabinetPull);
        rect(fx, fy, 1, 36, PAL.cabinetDark);
        rect(fx + 19, fy, 1, 36, PAL.cabinetDark);

        // Three drawers
        for (let i = 0; i < 3; i++) {
            const dy = fy + 2 + i * 11;
            rect(fx + 2, dy, 16, 10, PAL.cabinetDark);
            rect(fx + 3, dy + 1, 14, 8, PAL.cabinet);
            // Pull handle
            rect(fx + 8, dy + 4, 4, 2, PAL.cabinetPull);
            px(fx + 9, dy + 4, '#ffffff44');
            // Drawer label (colored stripe indicating doc type)
            const labelColors = [PAL.docBlue, PAL.docGreen, PAL.docRed];
            rect(fx + 4, dy + 2, 2, 6, labelColors[i]);
        }

        // Top of cabinet — a few loose papers
        rect(fx + 2, fy - 3, 8, 3, PAL.docWhite);
        rect(fx + 3, fy - 2, 6, 1, '#33445522');
        // Paper slightly angled
        const flutter = Math.sin(frame * 0.05) > 0.7 ? 1 : 0;
        rect(fx + 10 + flutter, fy - 4, 7, 4, PAL.docYellow);
        rect(fx + 11 + flutter, fy - 3, 4, 1, '#33445522');
    }

    function drawDocumentStacks() {
        const tx = LAB.documentTable.x;
        const ty = LAB.documentTable.y;

        // Document table surface
        rect(tx, ty + 8, TILE * 4 + 8, 2, PAL.deskTop);
        rect(tx, ty + 10, TILE * 4 + 8, 4, PAL.desk);
        // Table legs
        rect(tx + 2, ty + 10, 2, 8, PAL.desk);
        rect(tx + TILE * 4 + 4, ty + 10, 2, 8, PAL.desk);

        // Document stacks — each type has a distinct color and height
        const stacks = [
            {color: PAL.docGreen, h: 8, label: 'EXP'},
            {color: PAL.docBlue, h: 12, label: 'ADR'},
            {color: PAL.docWhite, h: 6, label: 'LAB'},
            {color: PAL.docRed, h: 10, label: 'INC'},
            {color: PAL.docPurple, h: 7, label: 'REL'},
            {color: PAL.docNavy, h: 11, label: 'SPEC'},
            {color: PAL.docOrange, h: 5, label: 'DEP'},
            {color: PAL.docGold, h: 9, label: 'ENH'},
        ];

        for (let i = 0; i < stacks.length; i++) {
            const sx0 = tx + 4 + i * 8;
            const stackH = stacks[i].h;
            const sy0 = ty + 8 - stackH;

            // Draw individual sheets in the stack
            for (let s = 0; s < Math.floor(stackH / 2); s++) {
                const sheetY = sy0 + s * 2;
                const sheetColor = s === Math.floor(stackH / 2) - 1 ? stacks[i].color : stacks[i].color + 'cc';
                rect(sx0, sheetY, 6, 2, sheetColor);
                // Sheet edge shadow
                px(sx0 + 5, sheetY + 1, '#00000022');
            }

            // Top sheet — slightly offset with flutter animation
            const topFlutter = Math.sin(frame * 0.04 + i * 0.8) > 0.8 ? 1 : 0;
            rect(sx0 - topFlutter, sy0 - 1, 6, 2, stacks[i].color);
            // Tiny text lines on top sheet
            rect(sx0 + 1 - topFlutter, sy0, 3, 1, '#00000033');

            // Label below table
            drawPixelText(sx0 - 2, ty + 15, stacks[i].label, stacks[i].color + 'aa');
        }
    }

    // --- Scientist Character ---
    function drawScientist(x, y, walkPhase, dir, tX, tY) {
        const f = Math.floor(walkPhase) % 4;
        const isWalking = Math.abs(x - tX) > 1 || Math.abs(y - tY) > 1;
        const bob = isWalking ? (f % 2 === 0 ? -1 : 0) : 0;

        // Breathing: subtle chest rise/fall when standing still
        breathFrame++;
        const breathBob = !isWalking ? Math.sin(breathFrame * 0.08) * 0.4 : 0;

        // Idle fidget: subtle weight-shift bob when standing still and fidgeting
        const idleSub = IDLE_SUBSTATES[idleSubstateIndex % IDLE_SUBSTATES.length];
        const isFidgeting = currentActivity === 'idle' && idleSub === 'fidgeting' && !isWalking;
        const fidgetBob = isFidgeting ? (Math.floor(fidgetFrame / 6) % 2 === 0 ? -1 : 0) : 0;

        // Error startle: brief jump reaction
        const startleBob = errorShakeTimer > 0 ? -2 : 0;

        // Shadow — stretches slightly during startle
        bx.fillStyle = '#00000033';
        const shadowW = errorShakeTimer > 0 ? 10 : 8;
        bx.fillRect(x - 3 - (shadowW - 8) / 2, y + 13, shadowW, 2);

        const cx = x;
        const cy = y + bob + fidgetBob + startleBob + Math.floor(breathBob);

        // Legs — enhanced with arm-swing counter-motion during walk
        if (isWalking) {
            const legOff = f < 2 ? 1 : 0;
            rect(cx - 1, cy + 9, 2, 4, PAL.pants);
            rect(cx + 1, cy + 9, 2, 4, PAL.pants);
            rect(cx - 1, cy + 12 + legOff, 2, 1, PAL.shoes);
            rect(cx + 1, cy + 12 + (1 - legOff), 2, 1, PAL.shoes);
        } else if (isFidgeting) {
            // Foot tap: one foot shifts
            const tapOff = Math.floor(fidgetFrame / 4) % 2;
            rect(cx - 1, cy + 9, 2, 4, PAL.pants);
            rect(cx + 1, cy + 9, 2, 4, PAL.pants);
            rect(cx - 1, cy + 13, 2, 1, PAL.shoes);
            rect(cx + 1 + tapOff, cy + 13, 2, 1, PAL.shoes);
        } else {
            rect(cx - 1, cy + 9, 2, 4, PAL.pants);
            rect(cx + 1, cy + 9, 2, 4, PAL.pants);
            rect(cx - 1, cy + 13, 2, 1, PAL.shoes);
            rect(cx + 1, cy + 13, 2, 1, PAL.shoes);
        }

        // Lab coat — breathing expands slightly
        const coatExpand = Math.floor(breathBob) > 0 ? 1 : 0;
        rect(cx - 3 - coatExpand, cy + 2, 8 + coatExpand * 2, 7, PAL.coat);
        rect(cx - 3 - coatExpand, cy + 2, 1, 7, PAL.coatShadow);
        px(cx + 1, cy + 4, PAL.glassesFrame);
        px(cx + 1, cy + 6, PAL.glassesFrame);

        // Coat flap during walking
        if (isWalking) {
            const flapOff = f % 2 === 0 ? 1 : 0;
            px(cx - 3 - flapOff, cy + 8, PAL.coatShadow);
            px(cx + 4 + (1 - flapOff), cy + 8, PAL.coat);
        }

        // Arms — activity-driven animation + idle fidget + walk arm-swing
        let armAnim = 0;
        let scratchArm = false;
        if (isWalking) {
            // Arm swing while walking — counter to leg motion
            armAnim = Math.sin(walkPhase * 1.2) * 1.5;
        } else if (currentActivity === 'writing') {
            armAnim = Math.sin(frame * 0.8) * 2;
        } else if (currentActivity === 'thinking') {
            armAnim = Math.sin(frame * 0.3);
        } else if (isFidgeting) {
            // Head-scratch: one arm reaches up periodically
            scratchArm = Math.floor(fidgetFrame / 10) % 3 === 0;
            armAnim = scratchArm ? -2 : Math.sin(fidgetFrame * 0.2) * 0.5;
        }
        const leftArmExtra = dir < 0 ? Math.floor(armAnim) : isWalking ? Math.floor(-armAnim) : 0;
        const rightArmExtra = dir > 0 ? Math.floor(armAnim) : isWalking ? Math.floor(armAnim) : 0;

        if (scratchArm) {
            // Raised arm reaching toward head
            rect(cx + 5, cy + 1, 1, 3, PAL.coat);
            px(cx + 5, cy, PAL.skin);
            // Normal left arm
            rect(cx - 4, cy + 3, 1, 5, PAL.coat);
            px(cx - 4, cy + 7, PAL.skin);
        } else {
            rect(cx - 4, cy + 3, 1, 5 + leftArmExtra, PAL.coat);
            px(cx - 4, cy + 7 + leftArmExtra, PAL.skin);
            rect(cx + 5, cy + 3, 1, 5 + rightArmExtra, PAL.coat);
            px(cx + 5, cy + 7 + rightArmExtra, PAL.skin);
        }

        // Head — tracks toward active equipment
        let headOffX = 0;
        if (!isWalking && !isFidgeting) {
            if (currentActivity === 'reading') headOffX = -1;
            else if (currentActivity === 'writing') headOffX = 1;
            else if (currentActivity === 'running') headOffX = 1;
        }

        rect(cx - 1 + headOffX, cy - 4, 5, 6, PAL.skin);

        // Hair (wild scientist) — extra spiky during error
        const hairSpike = errorShakeTimer > 0 ? 1 : 0;
        rect(cx - 2 + headOffX, cy - 5 - hairSpike, 7, 2, PAL.hair);
        rect(cx - 2 + headOffX, cy - 4, 1, 3, PAL.hair);
        px(cx - 1 + headOffX, cy - 6 - hairSpike, PAL.hair);
        px(cx + 2 + headOffX, cy - 7 - hairSpike, PAL.hair);
        px(cx + 4 + headOffX, cy - 6 - hairSpike, PAL.hair);
        // Extra error spikes
        if (hairSpike > 0) {
            px(cx + headOffX, cy - 7, PAL.hair);
            px(cx + 3 + headOffX, cy - 8, PAL.hair);
        }

        // Goggles
        rect(cx - 1 + headOffX, cy - 3, 5, 2, PAL.goggles);
        rect(cx + headOffX, cy - 3, 1, 2, PAL.goggleGlass);
        rect(cx + 3 + headOffX, cy - 3, 1, 2, PAL.goggleGlass);

        // Eyes (blink every ~3s) — idle "looking" sub-state shifts pupil direction
        // Head tracking: pupils look toward active equipment
        const isLooking = currentActivity === 'idle' && idleSub === 'looking' && !isWalking;
        let effectiveDir;
        if (isLooking) {
            effectiveDir = lookDirection;
        } else if (currentActivity === 'error') {
            // Panicked rapid eye movement during error
            effectiveDir = frame % 6 < 3 ? -1 : 1;
        } else {
            effectiveDir = dir;
        }

        if (frame % 30 !== 0) {
            px(cx + headOffX, cy - 1, '#334455');
            px(cx + 3 + headOffX, cy - 1, '#334455');
            if (effectiveDir > 0) {
                px(cx + 1 + headOffX, cy - 1, '#112233');
                px(cx + 4 + headOffX, cy - 1, '#112233');
            }
        } else {
            px(cx + headOffX, cy - 1, PAL.skin);
            px(cx + 3 + headOffX, cy - 1, PAL.skin);
        }

        // Mouth — enhanced expressions
        if (currentActivity === 'error') {
            // Open mouth — shocked
            px(cx + 1 + headOffX, cy + 1, '#cc4444');
            px(cx + 2 + headOffX, cy + 1, '#cc4444');
            if (errorShakeTimer > 3) px(cx + 1 + headOffX, cy + 2, '#cc4444'); // extra open
        } else if (currentActivity === 'thinking') {
            px(cx + 2 + headOffX, cy + 1, '#aa8877');
        } else if (isFidgeting) {
            px(cx + 1 + headOffX, cy + 1, '#998877');
        } else if (currentActivity === 'writing') {
            // Concentrated — slight tongue out
            px(cx + 1 + headOffX, cy + 1, '#aa8877');
            if (frame % 40 < 20) px(cx + 2 + headOffX, cy + 1, '#cc9988');
        } else {
            px(cx + 1 + headOffX, cy + 1, '#aa8877');
        }

        // Activity props
        if (currentActivity === 'reading' && !isWalking) {
            const propX = cx + (dir > 0 ? 5 : -4);
            rect(propX, cy + 4, 3, 4, '#ddeeff');
            rect(propX + 1, cy + 5, 1, 2, '#334455');
        }
        if (currentActivity === 'writing' && !isWalking) {
            rect(cx + (dir > 0 ? 6 : -3), cy + 5 + Math.floor(armAnim), 1, 3, '#2244cc');
        }
    }

    // --- Minion Character ---
    function drawMinion(char) {
        const x = Math.floor(char.x);
        const y = Math.floor(char.y);
        const pal = char.color ?? MINION_COLORS[0];

        // Spawn/despawn scaling
        const scale = char.spawnPhase / 5;
        if (scale <= 0) return;

        if (scale < 1) {
            const sz = Math.max(1, Math.floor(scale * 4));
            rect(x + 1, y + 4 - Math.floor(sz / 2), sz, sz, pal.coat);
            return;
        }

        const isWalking = Math.abs(char.x - char.targetX) > 1 || Math.abs(char.y - char.targetY) > 1;
        const f = Math.floor(char.walkFrame) % 4;
        const bob = isWalking ? (f % 2 === 0 ? -1 : 0) : 0;
        const cy = y + bob;

        // Shadow
        bx.fillStyle = '#00000022';
        bx.fillRect(x - 1, y + 9, 6, 1);

        // Legs
        if (isWalking) {
            const legOff = f < 2 ? 1 : 0;
            rect(x, cy + 6, 2, 2, PAL.pants);
            rect(x + 2, cy + 6, 2, 2, PAL.pants);
            px(x, cy + 8 + legOff, PAL.shoes);
            px(x + 2, cy + 8 + (1 - legOff), PAL.shoes);
        } else {
            rect(x, cy + 6, 2, 2, PAL.pants);
            rect(x + 2, cy + 6, 2, 2, PAL.pants);
            px(x, cy + 8, PAL.shoes);
            px(x + 2, cy + 8, PAL.shoes);
        }

        // Lab coat (colored)
        rect(x - 1, cy + 1, 6, 5, pal.coat);
        rect(x - 1, cy + 1, 1, 5, pal.coatShadow);

        // Arms
        const armAnim =
            char.activity === 'writing'
                ? Math.sin(frame * 0.8)
                : char.activity === 'thinking'
                  ? Math.sin(frame * 0.3) * 0.5
                  : 0;
        const armExtra = Math.max(0, Math.floor(armAnim));
        px(x - 2, cy + 2, pal.coat);
        px(x - 2, cy + 3 + armExtra, PAL.skin);
        px(x + 5, cy + 2, pal.coat);
        px(x + 5, cy + 3 + armExtra, PAL.skin);

        // Coat dot (identifier)
        px(x + 2, cy + 3, '#ffffff');

        // Head (4px wide, 3px tall)
        rect(x, cy - 2, 4, 3, PAL.skin);

        // Simple hair
        rect(x, cy - 3, 4, 1, '#443322');

        // Eyes (blink offset from scientist to avoid sync)
        if ((frame + 15) % 30 !== 0) {
            px(x + 1, cy - 1, '#334455');
            px(x + 2, cy - 1, '#334455');
        }

        // Mouth
        px(x + 1, cy, '#aa8877');

        // Activity prop (clipboard for reading)
        if (char.activity === 'reading' && !isWalking) {
            const propX = char.facing > 0 ? x + 5 : x - 3;
            rect(propX, cy + 2, 2, 3, '#ddeeff');
        }
    }

    // --- Minion Spawn/Despawn ---
    function spawnMinionCharacter(id, activity, detail) {
        // Don't spawn duplicates
        if (characters.find((c) => c.id === id)) return;

        const color = MINION_COLORS[colorIndex % MINION_COLORS.length];
        colorIndex++;

        const pos = POSITIONS[activity] ?? POSITIONS.idle;
        const minionIndex = characters.filter((c) => c.type === 'minion').length;
        const offset = MINION_OFFSETS[minionIndex % MINION_OFFSETS.length];

        const x = Math.max(TILE + 4, Math.min(W - TILE - 10, pos.x + offset.dx));
        const y = Math.max(TILE * 3 + 4, Math.min(H - TILE * 2 - 14, pos.y + offset.dy));

        const char = createCharacter(id, 'minion', x, y, activity, detail, color);
        characters.push(char);

        // Spawn poof
        for (let i = 0; i < 4; i++) {
            spawnParticle(x + 2, y + 2, 'poof');
        }
    }

    function despawnMinionCharacter(id) {
        const char = characters.find((c) => c.id === id && c.type === 'minion');
        if (!char || char.despawning) return;

        char.despawning = true;

        // Despawn poof
        for (let i = 0; i < 4; i++) {
            spawnParticle(char.x + 2, char.y + 2, 'poof');
        }
    }

    // --- Speech Bubble ---
    function drawSpeechBubble(x, y, text, alpha) {
        if (alpha <= 0) return;

        const textWidth = text.length * 4 + 4;
        const bx2 = x - textWidth / 2;
        const by = y - 20;

        bx.globalAlpha = Math.min(alpha, 1);
        rect(bx2 - 1, by - 1, textWidth + 2, 9, '#00000044');
        rect(bx2, by, textWidth, 7, '#ffffff');
        rect(bx2, by + 6, textWidth, 1, '#dddddd');
        rect(x, by + 7, 2, 2, '#ffffff');
        drawPixelText(bx2 + 2, by + 1, text, '#334455');
        bx.globalAlpha = 1;
    }

    function drawPixelText(x, y, text, color) {
        bx.fillStyle = color;
        let cx = Math.floor(x);
        const fy = Math.floor(y);
        for (const ch of text.toUpperCase()) {
            const bits = FONT[ch];
            if (bits !== undefined) {
                for (let row = 0; row < 5; row++) {
                    for (let col = 0; col < 4; col++) {
                        if ((bits >> (19 - row * 4 - col)) & 1) {
                            bx.fillRect(cx + col, fy + row, 1, 1);
                        }
                    }
                }
            }
            cx += 4;
        }
    }

    // --- Hover Highlight ---
    function drawHoverHighlight(zone) {
        if (!zone) return;
        const pulse = 0.2 + Math.sin(frame * 0.3) * 0.1;
        bx.globalAlpha = pulse;
        // Glow border
        rect(zone.x - 1, zone.y - 1, zone.w + 2, 1, '#88ccff');
        rect(zone.x - 1, zone.y + zone.h, zone.w + 2, 1, '#88ccff');
        rect(zone.x - 1, zone.y, 1, zone.h, '#88ccff');
        rect(zone.x + zone.w, zone.y, 1, zone.h, '#88ccff');
        // Inner glow
        bx.globalAlpha = pulse * 0.3;
        rect(zone.x, zone.y, zone.w, zone.h, '#88ccff');
        bx.globalAlpha = 1;
    }

    // --- Tooltip ---
    function drawTooltip(mx, my, text) {
        if (!text) return;
        const tw = text.length * 4 + 6;
        const tx = Math.max(2, Math.min(Math.floor(mx) + 8, W - tw - 2));
        const ty = Math.max(2, Math.min(Math.floor(my) - 12, H - 10));

        rect(tx - 1, ty - 1, tw + 2, 9, '#000000');
        rect(tx, ty, tw, 7, '#1a2a4a');
        drawPixelText(tx + 3, ty + 1, text, '#88ccff');
    }

    // --- Click Handling ---
    function handleZoneClick(zone) {
        // Set visual click reaction timer
        clickReactions[zone.id] = 20;

        // Zone center for particle spawning
        const cx = zone.x + zone.w / 2;
        const cy = zone.y + zone.h / 2;

        if (zone.id === 'scientist') {
            handleScientistPoke();
            // The Overlook (#00057): a sprite click is a selection. The
            // seam parked since Arc 2 finally has its consumer — the Vue
            // host routes this into roster.select(id) for bidirectional
            // railing/floor selection.
            const sci = characters[0];
            if (sci && sci.scientistId) {
                sendToExtension({type: 'interaction', action: `selectScientist:${sci.scientistId}`});
            }
        } else if (zone.id.startsWith('minion:')) {
            // Force show speech bubble
            const mId = zone.id.slice(7);
            const minion = characters.find((c) => c.id === mId);
            if (minion) {
                minion.idleTimer = 31;
                minion.bubbleAlpha = 1;
                // Same selection seam as the scientist sprite above.
                if (minion.scientistId) {
                    sendToExtension({type: 'interaction', action: `selectScientist:${minion.scientistId}`});
                }
            }
        } else if (zone.id === 'teslaCoil') {
            for (let i = 0; i < 8; i++) spawnParticle(cx + (Math.random() - 0.5) * 10, cy - 2, 'arc');
            for (let i = 0; i < 3; i++) spawnParticle(cx + (Math.random() - 0.5) * 6, cy, 'spark');
            clickReactions[zone.id] = 25;
        } else if (zone.id === 'beakers') {
            for (let i = 0; i < 10; i++) spawnParticle(cx + (Math.random() - 0.5) * 20, cy, 'bubble');
            for (let i = 0; i < 3; i++) spawnParticle(cx + (Math.random() - 0.5) * 10, cy - 2, 'steam');
        } else if (zone.id === 'gatekeeper' || zone.id === 'warTable' || zone.id === 'crucible') {
            for (let i = 0; i < 6; i++) {
                spawnParticle(cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 20, 'bubble');
            }
            clickReactions[zone.id] = 30;
        } else if (zone.id === 'oscilloscope') {
            for (let i = 0; i < 3; i++) spawnParticle(cx, cy - 4, 'spark');
        } else if (zone.id === 'door') {
            for (let i = 0; i < 3; i++) spawnParticle(cx, cy, 'poof');
        } else if (zone.id === 'sentinels') {
            for (let i = 0; i < 4; i++) spawnParticle(cx + (Math.random() - 0.5) * 20, cy, 'spark');
            clickReactions[zone.id] = 30;
        } else if (zone.id === 'quartermaster') {
            for (let i = 0; i < 3; i++) spawnParticle(cx, cy - 5, 'poof');
        } else if (zone.id === 'documents' || zone.id === 'filingCabinet' || zone.id === 'corkboard') {
            for (let i = 0; i < 5; i++) spawnParticle(cx + (Math.random() - 0.5) * 15, cy - 3, 'poof');
        } else if (zone.id === 'shelf') {
            for (let i = 0; i < 3; i++) spawnParticle(cx + (Math.random() - 0.5) * 10, cy, 'dust');
        } else if (zone.id.includes('Monitor')) {
            for (let i = 0; i < 2; i++) spawnParticle(cx, cy - 2, 'spark');
        } else if (zone.id === 'whiteboard') {
            for (let i = 0; i < 3; i++) spawnParticle(cx + (Math.random() - 0.5) * 15, cy, 'poof');
        }

        // Functional actions (VS Code integration)
        if (zone.action) {
            sendToExtension({type: 'interaction', action: zone.action});
        }
    }

    function handleScientistPoke() {
        pokeResetTimer = FPS * 5;
        pokeCount++;

        const scientist = characters[0];

        // Jump reaction — escalates with poke count
        errorShakeTimer = Math.min(3 + pokeCount, 8);

        // Escalating speech
        const tier = Math.min(Math.floor((pokeCount - 1) / 3), 3);
        const phrases = POKE_PHRASES[tier];
        scientist.speechText = phrases[Math.floor(Math.random() * phrases.length)];
        scientist.bubbleAlpha = 1;
        scientist.idleTimer = 31;

        // Sparks at high poke counts
        if (pokeCount >= 7) {
            for (let i = 0; i < 5; i++) {
                spawnParticle(scientist.x + (Math.random() - 0.5) * 10, scientist.y - 5, 'spark');
            }
        }

        // Grand finale at 10 pokes — explosion
        if (pokeCount >= 10) {
            for (let i = 0; i < 15; i++) {
                spawnParticle(
                    scientist.x + (Math.random() - 0.5) * 20,
                    scientist.y + (Math.random() - 0.5) * 10,
                    'spark',
                );
            }
            for (let i = 0; i < 10; i++) {
                spawnParticle(scientist.x + (Math.random() - 0.5) * 30, scientist.y - 10, 'smoke');
            }
            for (let i = 0; i < 5; i++) {
                spawnParticle(scientist.x + (Math.random() - 0.5) * 15, scientist.y, 'arc');
            }
            stateFlashTimer = 8;
            stateFlashColor = '#ff4444';
            pokeCount = 0;
        }
    }

    function activateKonami() {
        konamiActive = true;
        konamiTimer = FPS * 6;
        stateFlashTimer = 10;
        stateFlashColor = '#ffaa00';
    }

    // --- Particles ---
    function spawnParticle(x, y, type) {
        particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -Math.random() * 2 - 0.5,
            life: 20 + Math.random() * 20,
            type,
        });
    }

    function updateParticles() {
        particles = particles.filter((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.type === 'bubble') p.vy -= 0.02;
            if (p.type === 'spark') p.vy += 0.1;
            if (p.type === 'steam') {
                p.vy -= 0.01; // Rises slowly
                p.vx += (Math.random() - 0.5) * 0.1; // Gentle drift
            }
            if (p.type === 'dust') {
                // Gentle floating with sinusoidal drift
                p.vx = Math.sin(p.life * 0.1 + p.y * 0.05) * 0.15;
                p.vy = -0.05 + Math.sin(p.life * 0.05) * 0.03;
            }
            if (p.type === 'arc') {
                p.life -= 0.5; // Arcs fade fast
            }
            return p.life > 0;
        });
    }

    function drawParticles() {
        for (const p of particles) {
            bx.globalAlpha = Math.min(p.life / 10, 1);
            const fx = Math.floor(p.x);
            const fy = Math.floor(p.y);
            if (p.type === 'bubble') {
                px(fx, fy, PAL.bubbles);
                // Bubble shimmer
                if (p.life > 15 && p.life % 4 < 2) px(fx + 1, fy, PAL.bubbles + '66');
            } else if (p.type === 'spark') {
                px(fx, fy, PAL.lightOn);
                // Spark trail
                if (p.life > 10) px(fx - Math.sign(p.vx), fy - 1, PAL.lightOn + '44');
            } else if (p.type === 'smoke') {
                px(fx, fy, '#aaaaaa');
                px(fx + 1, fy, '#888888');
                // Smoke spreads as it ages
                if (p.life < 12) px(fx - 1, fy, '#66666644');
            } else if (p.type === 'poof') {
                px(fx, fy, '#ffffff');
                px(fx + 1, fy - 1, '#eeeeff');
            } else if (p.type === 'steam') {
                // Wispy steam — fades through gray tones
                const brightness = Math.floor((p.life / 30) * 3);
                const steamColors = [PAL.steamColor + '33', PAL.steamColor + '66', PAL.steamColor + '99'];
                const col = steamColors[Math.min(brightness, 2)];
                px(fx, fy, col);
                if (p.life > 8) px(fx + 1, fy, col);
            } else if (p.type === 'dust') {
                // Dust motes — tiny twinkling dots
                const twinkle = Math.sin(p.life * 0.3) > 0;
                if (twinkle) {
                    px(fx, fy, PAL.dustMote);
                } else {
                    px(fx, fy, PAL.dustMote + '66');
                }
            } else if (p.type === 'arc') {
                // Electrical arc — bright blue-white
                px(fx, fy, PAL.arcColor);
                px(fx + (Math.random() > 0.5 ? 1 : -1), fy, PAL.teslaGlow + '88');
            }
            bx.globalAlpha = 1;
        }
    }

    // --- Character Update ---
    function updateCharacter(char) {
        const pos = POSITIONS[char.activity] ?? POSITIONS.idle;

        // Minions offset from activity position
        if (char.type === 'minion') {
            const minionIndex = characters.indexOf(char) - 1;
            const offset = MINION_OFFSETS[minionIndex % MINION_OFFSETS.length];
            char.targetX = Math.max(TILE + 4, Math.min(W - TILE - 10, pos.x + offset.dx));
            char.targetY = Math.max(TILE * 3 + 4, Math.min(H - TILE * 2 - 14, pos.y + offset.dy));
        } else if (char.activity === 'idle') {
            // Idle sub-state system: cycle through behaviors
            idleSubstateTimer++;
            if (idleSubstateTimer >= IDLE_SUBSTATE_DURATION) {
                idleSubstateTimer = 0;
                idleSubstateIndex = (idleSubstateIndex + 1) % IDLE_SUBSTATES.length;
                fidgetFrame = 0;
            }

            const idleSub = IDLE_SUBSTATES[idleSubstateIndex % IDLE_SUBSTATES.length];
            if (idleSub === 'pacing') {
                // Walk to a waypoint
                const wp = IDLE_WAYPOINTS[idleWaypointIndex % IDLE_WAYPOINTS.length];
                char.targetX = wp.x;
                char.targetY = wp.y;
                // Advance waypoint when close
                const dx = wp.x - char.x;
                const dy = wp.y - char.y;
                if (Math.sqrt(dx * dx + dy * dy) < 3) {
                    idleWaypointIndex = (idleWaypointIndex + 1) % IDLE_WAYPOINTS.length;
                }
            } else if (idleSub === 'fidgeting') {
                char.targetX = pos.x;
                char.targetY = pos.y;
                fidgetFrame++;
            } else if (idleSub === 'looking') {
                char.targetX = pos.x;
                char.targetY = pos.y;
                // Shift gaze direction every ~1.5 seconds
                if (frame % (FPS + 5) === 0) {
                    lookDirection = lookDirection > 0 ? -1 : 1;
                }
            } else {
                char.targetX = pos.x;
                char.targetY = pos.y;
            }
        } else {
            // Reset idle sub-state when not idle
            idleSubstateIndex = 0;
            idleSubstateTimer = 0;
            fidgetFrame = 0;
            char.targetX = pos.x;
            char.targetY = pos.y;
        }

        // Move towards target
        const dx = char.targetX - char.x;
        const dy = char.targetY - char.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const speed = char.type === 'minion' ? 1.0 : 1.2;
        if (dist > 1.5) {
            char.x += (dx / dist) * speed;
            char.y += (dy / dist) * speed;
            char.walkFrame += 0.3;
            char.facing = dx > 0 ? 1 : dx < 0 ? -1 : char.facing;
        } else {
            char.walkFrame = 0;
        }

        // Speech bubble timing
        char.idleTimer++;
        if (char.idleTimer > 30) {
            if (char.type === 'minion') {
                char.speechText = char.detail.slice(0, 16);
            } else {
                const phrases = SPEECH[char.activity] ?? SPEECH.idle;
                char.speechText = phrases[Math.floor(frame / 60) % phrases.length];
            }
            char.bubbleAlpha = Math.min(char.bubbleAlpha + 0.1, 1);
        } else {
            char.bubbleAlpha = Math.max(char.bubbleAlpha - 0.05, 0);
        }

        // Spawn/despawn animation
        if (char.despawning) {
            char.spawnPhase = Math.max(0, char.spawnPhase - 1);
            if (char.spawnPhase <= 0) {
                char._remove = true;
            }
        } else if (char.spawnPhase < 5) {
            char.spawnPhase++;
        }
    }

    // --- Unified Update ---
    function update() {
        const scientist = characters[0];

        // Update all characters
        for (const char of characters) {
            updateCharacter(char);
        }

        // Remove characters that have finished despawning
        characters = characters.filter((c) => !c._remove);

        // Sync globals from scientist for backward compat (drawScientist, drawDesk, drawBeaker, drawLights)
        currentActivity = scientist.activity;
        currentDetail = scientist.detail;

        // State transition flash
        if (currentActivity !== prevActivity) {
            stateFlashTimer = 6;
            stateFlashColor = DOT_COLORS[currentActivity] ?? '#ffffff';
            // Error startle — triggers jump reaction
            if (currentActivity === 'error') {
                errorShakeTimer = 8;
            }
            prevActivity = currentActivity;
        }
        if (stateFlashTimer > 0) stateFlashTimer--;
        if (errorShakeTimer > 0) errorShakeTimer--;

        // Activity particles (scientist only)
        particleTimer++;
        if (particleTimer > 8) {
            particleTimer = 0;
            const bk = LAB.beakerRack;
            if (scientist.activity === 'running') {
                spawnParticle(bk.x + 5 + Math.random() * 20, bk.y - 8, 'bubble');
                // Steam rising from active beakers
                spawnParticle(bk.x + 3 + Math.random() * 4, bk.y - 12, 'steam');
            }
            if (scientist.activity === 'error') {
                spawnParticle(scientist.x + Math.random() * 6, scientist.y - 5, 'spark');
                // Electrical arcs from Tesla coil area
                if (frame % 3 === 0) {
                    const tc = LAB.teslaCoil;
                    spawnParticle(tc.x + 4 + (Math.random() - 0.5) * 6, tc.y - 2, 'arc');
                }
            }
            if (scientist.activity === 'thinking') {
                spawnParticle(scientist.x + 8, scientist.y - 8, 'smoke');
                // Light steam from beakers during thinking too
                if (frame % 2 === 0) {
                    spawnParticle(bk.x + 11 + Math.random() * 4, bk.y - 12, 'steam');
                }
            }
        }

        // Dust motes in light cones — always active, denser when lights are on
        if (frame % 12 === 0) {
            const dustChance = currentActivity !== 'idle' ? 0.6 : 0.2;
            if (Math.random() < dustChance) {
                const dustLightPositions = [4, 10, 16, 23];
                const lightIdx = Math.floor(Math.random() * dustLightPositions.length);
                const lx = dustLightPositions[lightIdx] * TILE;
                const dustX = lx - 4 + Math.random() * 16;
                const dustY = TILE * 3 + Math.random() * 8;
                const p = {x: dustX, y: dustY, vx: 0, vy: -0.05, life: 40 + Math.random() * 30, type: 'dust'};
                particles.push(p);
            }
        }

        // Spawn poof particles for minions materializing/dematerializing
        for (const char of characters) {
            if (char.type === 'minion' && char.spawnPhase > 0 && char.spawnPhase < 5 && !char.despawning) {
                if (particleTimer === 0) {
                    spawnParticle(char.x + 2, char.y, 'poof');
                }
            }
        }

        updateParticles();

        // Click reaction decay
        for (const key of Object.keys(clickReactions)) {
            clickReactions[key]--;
            if (clickReactions[key] <= 0) delete clickReactions[key];
        }

        // Poke counter reset
        if (pokeResetTimer > 0) {
            pokeResetTimer--;
            if (pokeResetTimer <= 0) pokeCount = 0;
        }

        // Konami mode — rainbow particles everywhere
        if (konamiActive) {
            konamiTimer--;
            if (konamiTimer <= 0) konamiActive = false;
            if (frame % 2 === 0) {
                const rx = TILE + Math.random() * (W - TILE * 2);
                const ry = TILE * 3 + Math.random() * (H - TILE * 5);
                const types = ['bubble', 'spark', 'smoke', 'poof', 'steam', 'dust'];
                spawnParticle(rx, ry, types[Math.floor(Math.random() * types.length)]);
            }
        }

        // Status element handled by the Vue panel chrome — no
        // DOM lookup from inside the canvas module.

        // Demo mode (driven by main loop, not separate timer)
        if (demoMode) {
            demoTimer++;
            const demoStates = ['idle', 'thinking', 'reading', 'writing', 'running', 'waiting', 'error'];
            if (demoTimer >= FPS * 5) {
                demoTimer = 0;
                demoIndex = (demoIndex + 1) % demoStates.length;
                scientist.activity = demoStates[demoIndex];
                scientist.detail = SPEECH[scientist.activity][0];
                scientist.idleTimer = 0;
                scientist.bubbleAlpha = 0;

                // Demo minion lifecycle
                if (demoIndex === 2) {
                    spawnMinionCharacter('demo-1', 'reading', 'Scanning files...');
                }
                if (demoIndex === 4) {
                    spawnMinionCharacter('demo-2', 'running', 'Running tests...');
                }
                if (demoIndex === 6) {
                    for (const c of characters) {
                        if (c.type === 'minion') c.despawning = true;
                    }
                }
            }
        }
    }

    // --- Strip Projection (the Overlook #00057) ---
    // On short windows the floor surrenders height to the terminal but
    // never disappears: a 64px strip showing the scientists, and only
    // the scientists — no furniture, no pools, no perspective. The
    // walk/activity game loop is untouched; only the projection changes.
    const STRIP_H = 32; // logical px — blitted at exactly 64 CSS px
    let stripMode = false;

    // The selected scientist (roster.selected mirrored down by the Vue
    // host via setSelected). Declared here — before render() first runs
    // on the reduced-motion boot path — so the halo draw never reads it
    // in the temporal dead zone.
    let selectedId = null;

    function activeStripCharacters() {
        return characters.filter((c) => c.scientistId && !c.despawning);
    }

    function renderStrip() {
        bx.fillStyle = PAL.bg;
        bx.fillRect(0, 0, W, STRIP_H);
        const active = activeStripCharacters();
        const gap = W / (active.length + 1);
        active.forEach((c, i) => {
            const sx = Math.round(gap * (i + 1));
            const sy = 12;
            if (c.type === 'scientist') {
                drawScientist(sx, sy, 0, 1, sx, sy);
            } else {
                drawMinion({...c, x: sx, y: sy, bubbleAlpha: 0, spawnPhase: 5, despawning: false});
            }
            if (selectedId && c.scientistId === selectedId) {
                bx.globalAlpha = 0.5;
                rect(sx - 5, sy + (c.type === 'minion' ? 11 : 17), 18, 2, '#D4A24C');
                bx.globalAlpha = 1;
            }
        });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(buf, 0, 0, W, STRIP_H, 0, 0, canvas.width, canvas.height);
    }

    // --- Render ---
    function render() {
        if (stripMode) {
            renderStrip();
            return;
        }
        bx.fillStyle = PAL.bg;
        bx.fillRect(0, 0, W, H);

        drawLab();
        drawParticles();

        const scientist = characters[0];
        const minions = characters.filter((c) => c.type === 'minion');
        const visible = minions.slice(0, MAX_VISIBLE_MINIONS);

        // Draw minions behind scientist (rendered first for z-order)
        for (const m of visible) {
            drawMinion(m);
        }

        // Draw scientist
        drawScientist(
            scientist.x,
            scientist.y,
            scientist.walkFrame,
            scientist.facing,
            scientist.targetX,
            scientist.targetY,
        );
        drawSpeechBubble(scientist.x + 2, scientist.y, scientist.speechText, scientist.bubbleAlpha);

        // Draw minion speech bubbles (after scientist so they render on top)
        for (const m of visible) {
            if (m.bubbleAlpha > 0) {
                drawSpeechBubble(m.x + 2, m.y, m.speechText, m.bubbleAlpha);
            }
        }

        // The Overlook (#00057): the selected sprite is the brightest
        // thing on the floor — a soft brass halo at its feet marks where
        // the plumb-line lands. setSelected() was wired in Arc 2; this
        // is its first light.
        if (selectedId) {
            const sel = characters.find((c) => c.scientistId === selectedId);
            if (sel) {
                bx.globalAlpha = 0.35 + (frame % 20 < 10 ? 0.15 : 0);
                rect(sel.x - 5, sel.y + (sel.type === 'minion' ? 11 : 17), 18, 2, '#D4A24C');
                bx.globalAlpha = 1;
            }
        }

        // Overflow indicator
        const overflowCount = minions.length - visible.length;
        if (overflowCount > 0) {
            drawPixelText(W - 28, H - TILE * 2 - 4, `+${overflowCount}`, PAL.lightOn);
        }

        // Hover highlight + tooltip
        if (hoveredZone) {
            drawHoverHighlight(hoveredZone);
            drawTooltip(mouseLabX, mouseLabY, hoveredZone.tip);
        }

        // Konami rainbow border
        if (konamiActive) {
            const ri = Math.floor(frame * 0.3) % RAINBOW.length;
            const rc = RAINBOW[ri];
            bx.globalAlpha = 0.4 + Math.sin(frame * 0.5) * 0.15;
            rect(0, 0, W, 2, rc);
            rect(0, H - 2, W, 2, rc);
            rect(0, 0, 2, H, rc);
            rect(W - 2, 0, 2, H, rc);
            bx.globalAlpha = 1;
            // Flash text
            if (frame % 20 < 14) {
                drawPixelText(W / 2 - 14, 4, 'KONAMI!', RAINBOW[(ri + 3) % RAINBOW.length]);
            }
        }

        // Bottom status bar
        rect(0, H - TILE, W, TILE, PAL.wall + 'cc');
        drawPixelText(4, H - TILE + 5, currentDetail.toUpperCase().slice(0, 50), PAL.screenGlow);

        // Activity dot — enhanced with glow ring
        const dotColor = DOT_COLORS[currentActivity] ?? '#666688';
        rect(W - 8, H - TILE + 4, 4, 4, dotColor);
        if (frame % 20 < 10 && currentActivity !== 'idle') {
            bx.globalAlpha = 0.5;
            rect(W - 9, H - TILE + 3, 6, 6, dotColor);
            bx.globalAlpha = 1;
        }

        // State transition flash — brief colored overlay
        if (stateFlashTimer > 0) {
            bx.globalAlpha = stateFlashTimer / 20;
            bx.fillStyle = stateFlashColor;
            bx.fillRect(0, 0, W, H);
            bx.globalAlpha = 1;
        }

        // Error lightning flash — bright full-screen flash on error onset
        if (errorShakeTimer > 5) {
            bx.globalAlpha = 0.25;
            bx.fillStyle = '#ffffff';
            bx.fillRect(0, 0, W, H);
            bx.globalAlpha = 1;
        }

        // Blit to display
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);

        frame++;
    }

    // --- Reduced-Motion Gate (WCAG 2.3.3 AAA) ---
    // Honor OS-level prefers-reduced-motion: draw one static frame on entry,
    // then skip RAF re-schedules. CSS @media block in the panel inline <style>
    // handles CSS-driven motion; this gate covers the canvas RAF cadence.
    const prefersReducedMotion =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
    let reducedMotion = prefersReducedMotion ? prefersReducedMotion.matches : false;
    if (prefersReducedMotion) {
        prefersReducedMotion.addEventListener('change', (e) => {
            const wasReduced = reducedMotion;
            reducedMotion = e.matches;
            if (wasReduced && !reducedMotion) {
                // Motion re-enabled: restart the loop.
                requestAnimationFrame(gameLoop);
            } else if (!wasReduced && reducedMotion) {
                // Motion disabled mid-flight: draw one final static frame.
                update();
                render();
            }
        });
    }

    // --- Game Loop (requestAnimationFrame with frame throttle) ---
    function gameLoop(timestamp) {
        if (reducedMotion) return; // Freeze: no further RAF re-schedule.
        requestAnimationFrame(gameLoop);

        const elapsed = timestamp - lastFrameTime;
        if (elapsed < FRAME_INTERVAL) return;
        lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

        update();
        render();
    }

    // Kick off the loop. Under reduced motion, draw one static frame and leave
    // the loop frozen; otherwise schedule normally.
    if (reducedMotion) {
        update();
        render();
    } else {
        requestAnimationFrame(gameLoop);
    }

    // --- Mouse Event Handlers ---
    canvas.addEventListener('mousemove', (e) => {
        const coords = getLabCoords(e);
        mouseLabX = coords.x;
        mouseLabY = coords.y;
        hoveredZone = hitTestZone(coords.x, coords.y);
        canvas.style.cursor = hoveredZone ? 'pointer' : 'default';
    });

    canvas.addEventListener('mouseleave', () => {
        mouseLabX = -1;
        mouseLabY = -1;
        hoveredZone = null;
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('click', (e) => {
        const coords = getLabCoords(e);
        const zone = hitTestZone(coords.x, coords.y);
        if (zone) handleZoneClick(zone);
    });

    // --- Konami Code ---
    window.addEventListener('keydown', (e) => {
        konamiBuffer.push(e.keyCode);
        if (konamiBuffer.length > KONAMI_CODE.length) konamiBuffer.shift();
        if (konamiBuffer.length === KONAMI_CODE.length && konamiBuffer.every((k, i) => k === KONAMI_CODE[i])) {
            activateKonami();
            konamiBuffer = [];
        }
    });

    // --- Controller Surface (Mezzanine roster bridge) ---
    // The Vue host pushes the dispatched-scientist roster down here. One
    // entry per Roster scientist becomes one character on the floor: the
    // first scientist re-uses the scientist sprite at index 0; additional
    // scientists become minion-style sprites with positions assigned via
    // a grid generator. Recalls remove characters; new dispatches add
    // them. The activity field is the inferred ActivityState
    // (`thinking` / `writing` / etc.) the Observer composable computes.
    function setRoster(rosterEntries) {
        const list = Array.isArray(rosterEntries) ? rosterEntries : [];
        // Despawn characters whose scientist is no longer on the roster.
        const survivingIds = new Set(list.map((entry) => entry.id));
        for (const c of characters) {
            if ((c.type === 'minion' || c.type === 'scientist') && c.scientistId && !survivingIds.has(c.scientistId)) {
                if (c.type === 'minion') {
                    c.despawning = true;
                } else {
                    // The scientist sprite at index 0 cannot be despawned —
                    // we instead clear its activity so the floor reads as
                    // quiet. The next setRoster call with entries will
                    // re-bind index 0.
                    c.scientistId = null;
                    c.activity = 'idle';
                    c.detail = '...';
                }
            }
        }
        // Bind / create one character per Roster scientist.
        list.forEach((entry, index) => {
            if (index === 0) {
                // First scientist drives the existing scientist sprite at
                // characters[0].
                const sci = characters[0];
                sci.scientistId = entry.id;
                if (sci.activity !== entry.activity) {
                    sci.idleTimer = 0;
                    sci.bubbleAlpha = 0;
                }
                sci.activity = entry.activity;
                sci.detail = entry.detail;
                return;
            }
            // Subsequent scientists become minion-style sprites.
            const minionId = `mz-${entry.id}`;
            const existing = characters.find((c) => c.id === minionId);
            if (existing) {
                if (existing.activity !== entry.activity) {
                    existing.idleTimer = 0;
                    existing.bubbleAlpha = 0;
                }
                existing.activity = entry.activity;
                existing.detail = entry.detail;
                existing.despawning = false;
                existing.scientistId = entry.id;
            } else {
                // spawnMinionCharacter is the existing helper above; it
                // applies the MINION_OFFSETS/POSITIONS layout. With the
                // cap lifted (MAX_VISIBLE_MINIONS = 99), additional
                // sprites place on the grid through the modular wrap of
                // the offset table — acceptable for Arc 2's typical
                // roster size (<= 8); larger rosters compress visually.
                spawnMinionCharacter(minionId, entry.activity, entry.detail);
                const created = characters.find((c) => c.id === minionId);
                if (created) {
                    created.scientistId = entry.id;
                }
            }
        });
    }
    function setSelected(scientistId) {
        selectedId = scientistId;
    }

    // --- Station Position Seam (the Overlook #00057) ---
    // The plumb-line consumes the x; the light-pool radial centers
    // consume the y. Coordinates are logical floor pixels — the Vue
    // host applies the CSS scale factor via the canvas's
    // getBoundingClientRect() (see experiment log §11).
    function getStationPos(scientistId) {
        const active = activeStripCharacters();
        const char = active.find((c) => c.scientistId === scientistId);
        if (stripMode) {
            const idx = char ? active.indexOf(char) : 0;
            const gap = W / (active.length + 1);
            return {x: Math.round(gap * (idx + 1)), y: 12};
        }
        if (!char) {
            return {x: POSITIONS.idle.x, y: POSITIONS.idle.y};
        }
        // targetX/targetY hold the character's current station (including
        // minion offsets and idle waypoints) — the plumb-line re-targets
        // when the scientist walks; it is never pinned to selection-time x.
        return {x: char.targetX, y: char.targetY};
    }

    /** Logical floor dimensions for the active projection — consumers
     *  divide a getBoundingClientRect() by these to get the CSS scale. */
    function getFloorSize() {
        return {w: W, h: stripMode ? STRIP_H : H};
    }

    // --- Strip Mode (the Overlook #00057, O-4) ---
    // Engages the 64px strip projection. Resizing the canvas resets the
    // 2D context state, so pixelation is re-asserted and one frame is
    // drawn immediately — a paused or reduced-motion loop must not leave
    // a blank floor behind the resize.
    function setStrip(on) {
        const next = Boolean(on);
        if (next === stripMode) {
            return;
        }
        stripMode = next;
        if (stripMode) {
            canvas.height = STRIP_H * 2 * DPR;
            canvas.style.height = '64px';
        } else {
            canvas.height = H * SCALE * DPR;
            canvas.style.height = `${H * SCALE}px`;
        }
        ctx.imageSmoothingEnabled = false;
        render();
    }

    // --- Lifecycle (pause / resume / destroy) ---
    // The Vue host calls these from the panel's open/close transitions
    // and from `onBeforeUnmount`. Pausing keeps the canvas state intact
    // (no character despawn) so the resumed loop continues from the
    // correct positions.
    let rafPaused = false;
    function pauseRaf() {
        rafPaused = true;
    }
    function resumeRaf() {
        if (rafPaused) {
            rafPaused = false;
            requestAnimationFrame(gameLoop);
        }
    }
    function destroy() {
        rafPaused = true;
        characters.length = 0;
    }

    // Patch the game loop to respect the pause flag — re-schedule only
    // while running. The original `gameLoop` calls `requestAnimationFrame`
    // before its work; we wrap so the pause check fires first.
    const __originalGameLoop = gameLoop;
    gameLoop = function gameLoopPaused(timestamp) {
        if (rafPaused) return;
        __originalGameLoop(timestamp);
    };

    return {setRoster, setSelected, setStrip, getStationPos, getFloorSize, pauseRaf, resumeRaf, destroy};
}
