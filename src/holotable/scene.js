/**
 * The Holotable Scene — lifted from `gadgets/lab-monitor-3d/webview/scene.js`
 * into the Mezzanine on 2026-05-26 (experiment log #00051, Arc 1 of 3).
 *
 * The lift kept the 1835-line hand-built WebGL engine intact. What changed:
 *
 *   1. The IIFE wrapper became `export function initScene(opts)` — the host
 *      Vue component (`HolotableScene.vue`) constructs the DOM elements
 *      (canvas, container, tooltip, info panel, header chrome) and passes
 *      them in by reference. No more `document.getElementById` globals.
 *
 *   2. The VS Code postMessage listener is gone. The host calls
 *      `controller.setState(dashboardState)` directly when the Vue prop
 *      changes. No event bus, no JSON serialization across a webview.
 *
 *   3. The render loop now checks a `paused` flag before issuing the next
 *      `requestAnimationFrame` — the host pauses the RAF when the panel
 *      closes so the canvas does not burn CPU when nobody is watching it.
 *      `controller.pauseRaf()` / `controller.resumeRaf()` flip the flag.
 *
 *   4. The `acquireVsCodeApi` interaction surface is gone. The host can
 *      receive structure-click events through `opts.onInteraction` (a Vue
 *      emit) but Arc 1 does not wire any consumer.
 *
 * Dependencies: `LabCore3D` is imported from `./lab-core.js`. No Three.js,
 * no CDN, no `unsafe-eval` requirement — the shaders are static strings
 * compiled once at scene initialization.
 */

import LabCore3D from './lab-core.js';

export function initScene(opts) {
    'use strict';

    var Core = LabCore3D;

    // =========================================================================
    // Minimal Three.js-like 3D engine (WebGL)
    // =========================================================================
    // Instead of importing Three.js (600KB+), we build a minimal WebGL renderer
    // that handles exactly what we need: lit geometry, orbit camera, raycasting.
    // This keeps the gadget lightweight and avoids the 'unsafe-eval' CSP issue.
    // =========================================================================

    var PI = Math.PI;
    var TAU = PI * 2;
    var canvas = opts.canvas;
    var container = opts.container;
    var tooltip = opts.tooltip;
    var infoPanel = opts.infoPanel;
    var branchDisplay = opts.branchDisplay;
    var statusDisplay = opts.statusDisplay;
    var fpsDisplay = opts.fpsDisplay;
    var lastUpdateDisplay = opts.lastUpdateDisplay;
    var onInteraction = typeof opts.onInteraction === 'function' ? opts.onInteraction : function () {};

    // RAF lifecycle — the host can pause us when the panel closes.
    var paused = false;
    var rafHandle = null;

    // Track the listeners we install on `window` so `destroy()` can detach
    // them. The original IIFE never needed this — the gadget's lifetime
    // matched the webview's. Inside the Mezzanine, panel open/close cycles
    // through this code repeatedly, so leaking listeners would compound.
    var windowListeners = [];
    function addWindowListener(type, handler, options) {
        window.addEventListener(type, handler, options);
        windowListeners.push({type: type, handler: handler, options: options});
    }

    // =========================================================================
    // WebGL Setup
    // =========================================================================

    var gl = canvas.getContext('webgl', {antialias: true, alpha: false});
    if (!gl) {
        if (statusDisplay) statusDisplay.textContent = 'WebGL unavailable on this host';
        // Return a no-op controller that honours the SceneController contract
        // ({setState, pauseRaf, resumeRaf, destroy}). Returning `undefined`
        // here once wedged the host: HolotableScene.vue calls
        // `controller.setState(...)` unconditionally on mount, so an absent
        // controller threw `Cannot read properties of undefined (reading
        // 'setState')` — an unhandled rejection inside onMounted that froze
        // the floor on every WebGL-less host (VMs, RDP sessions, WebView2 with
        // GPU acceleration disabled). The stub keeps the panel alive and the
        // header honest instead of hanging it.
        return {
            setState: function () {},
            pauseRaf: function () {},
            resumeRaf: function () {},
            destroy: function () {},
        };
    }

    var dpr = window.devicePixelRatio || 1;
    var width, height;

    function resize() {
        var rect = container.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    resize();
    addWindowListener('resize', resize);

    // =========================================================================
    // Shader Programs
    // =========================================================================

    var VS_MAIN = [
        'attribute vec3 aPos;',
        'attribute vec3 aNorm;',
        'attribute vec3 aColor;',
        'uniform mat4 uMVP;',
        'uniform mat4 uModel;',
        'varying vec3 vNorm;',
        'varying vec3 vColor;',
        'varying vec3 vWorldPos;',
        'void main() {',
        '  vNorm = mat3(uModel) * aNorm;',
        '  vColor = aColor;',
        '  vWorldPos = (uModel * vec4(aPos, 1.0)).xyz;',
        '  gl_Position = uMVP * vec4(aPos, 1.0);',
        '}',
    ].join('\n');

    var FS_MAIN = [
        'precision mediump float;',
        'varying vec3 vNorm;',
        'varying vec3 vColor;',
        'varying vec3 vWorldPos;',
        'uniform vec3 uLightDir;',
        'uniform vec3 uAmbient;',
        'uniform float uGlow;',
        'void main() {',
        '  vec3 n = normalize(vNorm);',
        '  float diff = max(dot(n, uLightDir), 0.0);',
        '  vec3 lit = vColor * (uAmbient + vec3(diff * 0.7));',
        '  lit += vColor * uGlow * 0.3;',
        '  gl_FragColor = vec4(lit, 1.0);',
        '}',
    ].join('\n');

    // Particle shader
    var VS_PARTICLE = [
        'attribute vec3 aPos;',
        'attribute vec4 aColor;',
        'attribute float aSize;',
        'uniform mat4 uMVP;',
        'varying vec4 vColor;',
        'void main() {',
        '  vColor = aColor;',
        '  gl_Position = uMVP * vec4(aPos, 1.0);',
        '  gl_PointSize = aSize;',
        '}',
    ].join('\n');

    var FS_PARTICLE = [
        'precision mediump float;',
        'varying vec4 vColor;',
        'void main() {',
        '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
        '  float d = dot(p, p);',
        '  if (d > 1.0) discard;',
        '  float alpha = vColor.a * (1.0 - d * 0.5);',
        '  gl_FragColor = vec4(vColor.rgb, alpha);',
        '}',
    ].join('\n');

    // Grid/platform shader
    var VS_GRID = [
        'attribute vec3 aPos;',
        'uniform mat4 uMVP;',
        'varying vec3 vWorldPos;',
        'void main() {',
        '  vWorldPos = aPos;',
        '  gl_Position = uMVP * vec4(aPos, 1.0);',
        '}',
    ].join('\n');

    var FS_GRID = [
        'precision mediump float;',
        'varying vec3 vWorldPos;',
        'uniform float uTime;',
        'uniform float uSummonPulse;', // 0..1 expanding ring progress (-1 = inactive)
        'void main() {',
        '  vec2 p = vWorldPos.xz;',
        '  float gx = abs(fract(p.x) - 0.5);',
        '  float gz = abs(fract(p.y) - 0.5);',
        '  float grid = min(gx, gz);',
        '  float line = smoothstep(0.0, 0.04, grid);',
        '  float dist = length(p) / 12.0;',
        '  float fade = 1.0 - clamp(dist, 0.0, 1.0);',
        '  vec3 color = mix(vec3(0.08, 0.15, 0.3), vec3(0.04, 0.06, 0.12), line);',
        '  float pulse = sin(uTime * 0.5 + length(p) * 0.3) * 0.03 + 0.03;',
        '  color += vec3(0.1, 0.2, 0.4) * pulse * (1.0 - line);',
        // Summoning ignition ring — concentric wave expanding from center
        '  if (uSummonPulse >= 0.0) {',
        '    float ringRadius = uSummonPulse * 14.0;', // expands to 14 units
        '    float d = length(p);',
        '    float ring = smoothstep(ringRadius - 1.5, ringRadius - 0.5, d)',
        '             * (1.0 - smoothstep(ringRadius + 0.5, ringRadius + 1.5, d));',
        '    float gridBoost = (1.0 - line) * 2.0;', // gridlines glow brighter
        '    vec3 ringColor = vec3(0.2, 0.5, 1.0) * (ring * (1.0 + gridBoost));',
        '    color += ringColor * (1.0 - uSummonPulse * 0.6);', // fades as it expands
        '  }',
        '  gl_FragColor = vec4(color * fade, fade * 0.8);',
        '}',
    ].join('\n');

    // Beam/connection shader
    var VS_BEAM = [
        'attribute vec3 aPos;',
        'attribute float aAlpha;',
        'uniform mat4 uMVP;',
        'varying float vAlpha;',
        'void main() {',
        '  vAlpha = aAlpha;',
        '  gl_Position = uMVP * vec4(aPos, 1.0);',
        '}',
    ].join('\n');

    var FS_BEAM = [
        'precision mediump float;',
        'varying float vAlpha;',
        'uniform vec3 uBeamColor;',
        'uniform float uTime;',
        'void main() {',
        '  float pulse = sin(uTime * 3.0 + vAlpha * 10.0) * 0.2 + 0.8;',
        '  gl_FragColor = vec4(uBeamColor * pulse, vAlpha * 0.6);',
        '}',
    ].join('\n');

    function compileShader(src, type) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(s));
        }
        return s;
    }

    function createProgram(vs, fs) {
        var p = gl.createProgram();
        gl.attachShader(p, compileShader(vs, gl.VERTEX_SHADER));
        gl.attachShader(p, compileShader(fs, gl.FRAGMENT_SHADER));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('Program error:', gl.getProgramInfoLog(p));
        }
        return p;
    }

    var progMain = createProgram(VS_MAIN, FS_MAIN);
    var progParticle = createProgram(VS_PARTICLE, FS_PARTICLE);
    var progGrid = createProgram(VS_GRID, FS_GRID);
    var progBeam = createProgram(VS_BEAM, FS_BEAM);

    // =========================================================================
    // Matrix Math
    // =========================================================================

    function mat4Create() {
        var m = new Float32Array(16);
        m[0] = m[5] = m[10] = m[15] = 1;
        return m;
    }

    function mat4Perspective(fov, aspect, near, far) {
        var f = 1 / Math.tan(fov / 2);
        var nf = 1 / (near - far);
        var m = new Float32Array(16);
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) * nf;
        m[11] = -1;
        m[14] = 2 * far * near * nf;
        return m;
    }

    function mat4LookAt(eye, center, up) {
        var zx = eye[0] - center[0],
            zy = eye[1] - center[1],
            zz = eye[2] - center[2];
        var zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
        zx /= zl;
        zy /= zl;
        zz /= zl;
        var xx = up[1] * zz - up[2] * zy,
            xy = up[2] * zx - up[0] * zz,
            xz = up[0] * zy - up[1] * zx;
        var xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
        xx /= xl;
        xy /= xl;
        xz /= xl;
        var yx = zy * xz - zz * xy,
            yy = zz * xx - zx * xz,
            yz = zx * xy - zy * xx;
        var m = new Float32Array(16);
        m[0] = xx;
        m[1] = yx;
        m[2] = zx;
        m[4] = xy;
        m[5] = yy;
        m[6] = zy;
        m[8] = xz;
        m[9] = yz;
        m[10] = zz;
        m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
        m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
        m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
        m[15] = 1;
        return m;
    }

    function mat4Multiply(a, b) {
        var r = new Float32Array(16);
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                r[i * 4 + j] =
                    a[j] * b[i * 4] + a[j + 4] * b[i * 4 + 1] + a[j + 8] * b[i * 4 + 2] + a[j + 12] * b[i * 4 + 3];
            }
        }
        return r;
    }

    function mat4Translate(m, x, y, z) {
        var t = mat4Create();
        t[12] = x;
        t[13] = y;
        t[14] = z;
        return mat4Multiply(m, t);
    }

    function mat4RotateY(m, angle) {
        var c = Math.cos(angle),
            s = Math.sin(angle);
        var r = mat4Create();
        r[0] = c;
        r[2] = -s;
        r[8] = s;
        r[10] = c;
        return mat4Multiply(m, r);
    }

    function mat4Scale(m, sx, sy, sz) {
        var s = mat4Create();
        s[0] = sx;
        s[5] = sy;
        s[10] = sz;
        return mat4Multiply(m, s);
    }

    // =========================================================================
    // Geometry Builders
    // =========================================================================

    function buildRing(innerR, outerR, height, segments, color) {
        var positions = [];
        var normals = [];
        var colors = [];
        var cr = ((color >> 16) & 0xff) / 255;
        var cg = ((color >> 8) & 0xff) / 255;
        var cb = (color & 0xff) / 255;

        for (var i = 0; i < segments; i++) {
            var a1 = (i / segments) * TAU;
            var a2 = ((i + 1) / segments) * TAU;
            var c1 = Math.cos(a1),
                s1 = Math.sin(a1);
            var c2 = Math.cos(a2),
                s2 = Math.sin(a2);

            var ox1 = c1 * outerR,
                oz1 = s1 * outerR;
            var ox2 = c2 * outerR,
                oz2 = s2 * outerR;
            var ix1 = c1 * innerR,
                iz1 = s1 * innerR;
            var ix2 = c2 * innerR,
                iz2 = s2 * innerR;

            // Top face
            positions.push(ix1, height, iz1, ox1, height, oz1, ox2, height, oz2);
            positions.push(ix1, height, iz1, ox2, height, oz2, ix2, height, iz2);
            for (var n = 0; n < 6; n++) {
                normals.push(0, 1, 0);
                colors.push(cr, cg, cb);
            }
        }

        return createMesh(positions, normals, colors);
    }

    function buildGridPlane(size, yPos) {
        var hs = size / 2;
        var positions = new Float32Array([
            -hs,
            yPos,
            -hs,
            hs,
            yPos,
            -hs,
            hs,
            yPos,
            hs,
            -hs,
            yPos,
            -hs,
            hs,
            yPos,
            hs,
            -hs,
            yPos,
            hs,
        ]);

        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        return {buffer: buf, count: 6};
    }

    function createMesh(positions, normals, colors) {
        var posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        var normBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        var colBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

        return {posBuf: posBuf, normBuf: normBuf, colBuf: colBuf, count: positions.length / 3};
    }

    // =========================================================================
    // Internal Geometry Helpers (return raw arrays, no GPU upload)
    // =========================================================================

    function _colorComponents(color) {
        return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
    }

    function _faceNormal(v0, v1, v2) {
        var ax = v1[0] - v0[0],
            ay = v1[1] - v0[1],
            az = v1[2] - v0[2];
        var bx = v2[0] - v0[0],
            by = v2[1] - v0[1],
            bz = v2[2] - v0[2];
        var nx = ay * bz - az * by;
        var ny = az * bx - ax * bz;
        var nz = ax * by - ay * bx;
        var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl > 0) {
            nx /= nl;
            ny /= nl;
            nz /= nl;
        }
        return [nx, ny, nz];
    }

    function _cylinderGeo(radius, height, segments, cr, cg, cb, yBase) {
        var positions = [];
        var normals = [];
        var colors = [];

        for (var i = 0; i < segments; i++) {
            var a1 = (i / segments) * TAU;
            var a2 = ((i + 1) / segments) * TAU;
            var c1 = Math.cos(a1),
                s1 = Math.sin(a1);
            var c2 = Math.cos(a2),
                s2 = Math.sin(a2);
            var x1 = c1 * radius,
                z1 = s1 * radius;
            var x2 = c2 * radius,
                z2 = s2 * radius;
            var y0 = yBase,
                y1t = yBase + height;
            var nx = (c1 + c2) / 2,
                nz = (s1 + s2) / 2;

            // Side quad
            positions.push(x1, y0, z1, x2, y0, z2, x2, y1t, z2);
            positions.push(x1, y0, z1, x2, y1t, z2, x1, y1t, z1);
            for (var n = 0; n < 6; n++) {
                normals.push(nx, 0, nz);
                colors.push(cr, cg, cb);
            }

            // Top cap
            positions.push(0, y1t, 0, x1, y1t, z1, x2, y1t, z2);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
            colors.push(cr * 1.1, cg * 1.1, cb * 1.1);
            colors.push(cr * 1.1, cg * 1.1, cb * 1.1);
            colors.push(cr * 1.1, cg * 1.1, cb * 1.1);

            // Bottom cap
            positions.push(0, y0, 0, x2, y0, z2, x1, y0, z1);
            normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
            colors.push(cr * 0.6, cg * 0.6, cb * 0.6);
            colors.push(cr * 0.6, cg * 0.6, cb * 0.6);
            colors.push(cr * 0.6, cg * 0.6, cb * 0.6);
        }

        return {positions: positions, normals: normals, colors: colors};
    }

    function _coneGeo(radius, height, segments, cr, cg, cb, yBase) {
        var positions = [];
        var normals = [];
        var colors = [];
        var slope = height / Math.sqrt(radius * radius + height * height);
        var rise = radius / Math.sqrt(radius * radius + height * height);

        for (var i = 0; i < segments; i++) {
            var a1 = (i / segments) * TAU;
            var a2 = ((i + 1) / segments) * TAU;
            var c1 = Math.cos(a1),
                s1 = Math.sin(a1);
            var c2 = Math.cos(a2),
                s2 = Math.sin(a2);
            var x1 = c1 * radius,
                z1 = s1 * radius;
            var x2 = c2 * radius,
                z2 = s2 * radius;

            // Side triangle
            positions.push(x1, yBase, z1, x2, yBase, z2, 0, yBase + height, 0);
            var nx = ((c1 + c2) / 2) * slope;
            var nz = ((s1 + s2) / 2) * slope;
            normals.push(nx, rise, nz, nx, rise, nz, nx, rise, nz);
            var shade = 0.9 + (i % 2) * 0.1;
            colors.push(cr * shade, cg * shade, cb * shade);
            colors.push(cr * shade, cg * shade, cb * shade);
            colors.push(cr * shade, cg * shade, cb * shade);

            // Bottom cap
            positions.push(0, yBase, 0, x2, yBase, z2, x1, yBase, z1);
            normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
            colors.push(cr * 0.6, cg * 0.6, cb * 0.6);
            colors.push(cr * 0.6, cg * 0.6, cb * 0.6);
            colors.push(cr * 0.6, cg * 0.6, cb * 0.6);
        }

        return {positions: positions, normals: normals, colors: colors};
    }

    function _domeGeo(radius, rings, segments, cr, cg, cb, yBase) {
        var positions = [];
        var normals = [];
        var colors = [];

        for (var ri = 0; ri < rings; ri++) {
            var phi1 = (ri / rings) * PI * 0.5;
            var phi2 = ((ri + 1) / rings) * PI * 0.5;
            var r1 = radius * Math.cos(phi1);
            var y1 = yBase + radius * Math.sin(phi1);
            var r2 = radius * Math.cos(phi2);
            var y2 = yBase + radius * Math.sin(phi2);
            var cp1 = Math.cos(phi1),
                sp1 = Math.sin(phi1);
            var cp2 = Math.cos(phi2),
                sp2 = Math.sin(phi2);

            for (var si = 0; si < segments; si++) {
                var a1 = (si / segments) * TAU;
                var a2 = ((si + 1) / segments) * TAU;
                var ca1 = Math.cos(a1),
                    sa1 = Math.sin(a1);
                var ca2 = Math.cos(a2),
                    sa2 = Math.sin(a2);

                // Quad corners
                var x1a = ca1 * r1,
                    z1a = sa1 * r1;
                var x2a = ca2 * r1,
                    z2a = sa2 * r1;
                var x1b = ca1 * r2,
                    z1b = sa1 * r2;
                var x2b = ca2 * r2,
                    z2b = sa2 * r2;

                // Two triangles per quad
                positions.push(x1a, y1, z1a, x2a, y1, z2a, x2b, y2, z2b);
                positions.push(x1a, y1, z1a, x2b, y2, z2b, x1b, y2, z1b);

                // Spherical normals
                normals.push(ca1 * cp1, sp1, sa1 * cp1);
                normals.push(ca2 * cp1, sp1, sa2 * cp1);
                normals.push(ca2 * cp2, sp2, sa2 * cp2);
                normals.push(ca1 * cp1, sp1, sa1 * cp1);
                normals.push(ca2 * cp2, sp2, sa2 * cp2);
                normals.push(ca1 * cp2, sp2, sa1 * cp2);

                var shade = 0.95 + ri * 0.02;
                for (var v = 0; v < 6; v++) {
                    colors.push(cr * shade, cg * shade, cb * shade);
                }
            }
        }

        return {positions: positions, normals: normals, colors: colors};
    }

    function _mergeGeo(parts) {
        var positions = [];
        var normals = [];
        var colors = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            for (var j = 0; j < p.positions.length; j++) positions.push(p.positions[j]);
            for (var k = 0; k < p.normals.length; k++) normals.push(p.normals[k]);
            for (var l = 0; l < p.colors.length; l++) colors.push(p.colors[l]);
        }
        return createMesh(positions, normals, colors);
    }

    // =========================================================================
    // Compound Structure Builders
    // =========================================================================

    /** Tower: multi-tier spire with antenna spike */
    function buildSpire(radius, height, segments, color) {
        var c = _colorComponents(color);
        var cr = c[0],
            cg = c[1],
            cb = c[2];

        // Tier 1 (base): widest
        var t1h = height * 0.4;
        var tier1 = _cylinderGeo(radius, t1h, segments, cr, cg, cb, 0);

        // Tier 2 (middle): narrower
        var t2h = height * 0.33;
        var tier2 = _cylinderGeo(radius * 0.65, t2h, segments, cr * 1.1, cg * 1.1, cb * 1.1, t1h);

        // Tier 3 (top): narrowest
        var t3h = height * 0.17;
        var tier3 = _cylinderGeo(radius * 0.35, t3h, segments, cr * 1.2, cg * 1.2, cb * 1.2, t1h + t2h);

        // Antenna spike
        var antH = height * 0.1;
        var antenna = _coneGeo(radius * 0.08, antH, 4, cr * 1.4, cg * 1.4, cb * 1.4, t1h + t2h + t3h);

        return _mergeGeo([tier1, tier2, tier3, antenna]);
    }

    /** Experiment: dome-topped pod */
    function buildPod(radius, height, segments, color) {
        var c = _colorComponents(color);
        var cr = c[0],
            cg = c[1],
            cb = c[2];

        // Cylindrical base
        var bodyH = height - radius;
        var body = _cylinderGeo(radius, bodyH, segments, cr, cg, cb, 0);

        // Hemispherical dome on top
        var dome = _domeGeo(radius, 4, segments, cr * 1.1, cg * 1.1, cb * 1.1, bodyH);

        return _mergeGeo([body, dome]);
    }

    /** Gadget: hex workbench with base plate and accent top */
    function buildHexWorkbench(radius, height, color) {
        var c = _colorComponents(color);
        var cr = c[0],
            cg = c[1],
            cb = c[2];

        // Wide base plate
        var baseH = height * 0.15;
        var base = _cylinderGeo(radius * 1.35, baseH, 6, cr * 0.7, cg * 0.7, cb * 0.7, 0);

        // Main hex body
        var bodyH = height * 0.7;
        var body = _cylinderGeo(radius, bodyH, 6, cr, cg, cb, baseH);

        // Accent top plate (wider lip)
        var topH = height * 0.15;
        var top = _cylinderGeo(radius * 1.15, topH, 6, cr * 1.2, cg * 1.2, cb * 1.2, baseH + bodyH);

        return _mergeGeo([base, body, top]);
    }

    /** Database: elongated hexagonal bipyramid crystal */
    function buildCrystal(radius, height, color) {
        var c = _colorComponents(color);
        var cr = c[0],
            cg = c[1],
            cb = c[2];
        var positions = [];
        var normals = [];
        var colors = [];
        var midY = height / 2;

        for (var i = 0; i < 6; i++) {
            var a1 = (i / 6) * TAU;
            var a2 = ((i + 1) / 6) * TAU;
            var x1 = Math.cos(a1) * radius,
                z1 = Math.sin(a1) * radius;
            var x2 = Math.cos(a2) * radius,
                z2 = Math.sin(a2) * radius;

            // Upper face: equator to top apex
            var uv0 = [x1, midY, z1],
                uv1 = [x2, midY, z2],
                uv2 = [0, height, 0];
            var un = _faceNormal(uv0, uv1, uv2);
            positions.push(uv0[0], uv0[1], uv0[2], uv1[0], uv1[1], uv1[2], uv2[0], uv2[1], uv2[2]);
            normals.push(un[0], un[1], un[2], un[0], un[1], un[2], un[0], un[1], un[2]);
            var us = 0.85 + (i % 2) * 0.15;
            colors.push(cr * us, cg * us, cb * us);
            colors.push(cr * us, cg * us, cb * us);
            colors.push(cr * us * 1.1, cg * us * 1.1, cb * us * 1.1);

            // Lower face: equator to bottom apex
            var lv0 = [x2, midY, z2],
                lv1 = [x1, midY, z1],
                lv2 = [0, 0, 0];
            var ln = _faceNormal(lv0, lv1, lv2);
            positions.push(lv0[0], lv0[1], lv0[2], lv1[0], lv1[1], lv1[2], lv2[0], lv2[1], lv2[2]);
            normals.push(ln[0], ln[1], ln[2], ln[0], ln[1], ln[2], ln[0], ln[1], ln[2]);
            var ls = 0.75 + (i % 2) * 0.1;
            colors.push(cr * ls, cg * ls, cb * ls);
            colors.push(cr * ls, cg * ls, cb * ls);
            colors.push(cr * ls * 0.8, cg * ls * 0.8, cb * ls * 0.8);
        }

        return createMesh(positions, normals, colors);
    }

    /** Pipeline: rocket with engine, body, and nose cone */
    function buildRocket(radius, height, segments, color) {
        var c = _colorComponents(color);
        var cr = c[0],
            cg = c[1],
            cb = c[2];

        // Engine (wider base)
        var engineH = height * 0.2;
        var engine = _cylinderGeo(radius * 1.2, engineH, segments, cr * 0.7, cg * 0.7, cb * 0.7, 0);

        // Body
        var bodyH = height * 0.5;
        var body = _cylinderGeo(radius, bodyH, segments, cr, cg, cb, engineH);

        // Nose cone
        var noseH = height * 0.3;
        var nose = _coneGeo(radius, noseH, segments, cr * 1.2, cg * 1.2, cb * 1.2, engineH + bodyH);

        return _mergeGeo([engine, body, nose]);
    }

    // =========================================================================
    // Camera (orbit)
    // =========================================================================

    var camera = {
        theta: 0.5,
        phi: 0.6,
        distance: 16,
        targetX: 0,
        targetY: 0.5,
        targetZ: 0,
        minDist: 5,
        maxDist: 30,
        autoRotate: true,
        autoRotateSpeed: 0.05,
    };

    function getCameraPos() {
        var sp = Math.sin(camera.phi);
        var cp = Math.cos(camera.phi);
        var st = Math.sin(camera.theta);
        var ct = Math.cos(camera.theta);
        return [
            camera.targetX + camera.distance * cp * st,
            camera.targetY + camera.distance * sp,
            camera.targetZ + camera.distance * cp * ct,
        ];
    }

    // =========================================================================
    // Orbit Controls
    // =========================================================================

    var dragging = false;
    var lastMouse = [0, 0];

    canvas.addEventListener('mousedown', function (e) {
        if (e.button === 0) {
            dragging = true;
            lastMouse = [e.clientX, e.clientY];
            camera.autoRotate = false;
        }
    });

    addWindowListener('mousemove', function (e) {
        if (dragging) {
            var dx = e.clientX - lastMouse[0];
            var dy = e.clientY - lastMouse[1];
            camera.theta -= dx * 0.005;
            camera.phi += dy * 0.005;
            camera.phi = Core.clamp
                ? Core.clamp(camera.phi, 0.1, PI * 0.45)
                : Math.max(0.1, Math.min(PI * 0.45, camera.phi));
            lastMouse = [e.clientX, e.clientY];
        }
    });

    addWindowListener('mouseup', function () {
        dragging = false;
    });

    canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        camera.distance += e.deltaY * 0.01;
        camera.distance = Core.clamp
            ? Core.clamp(camera.distance, camera.minDist, camera.maxDist)
            : Math.max(camera.minDist, Math.min(camera.maxDist, camera.distance));
    });

    // =========================================================================
    // Scene Structures
    // =========================================================================

    var structures = [];
    var structureMap = {};
    var beams = [];
    var particles = [];
    var time = 0;
    var lastFrameTime = 0;
    var frameCount = 0;
    var fpsTimer = 0;
    var currentFps = 0;
    var hoveredStructure = null;
    var selectedStructure = null;
    var dashboardState = null;

    // =========================================================================
    // Summoning Animation State
    // =========================================================================
    var summoningActive = false;
    var summonStartTime = 0;
    var SUMMON_DEPTH = 4.0; // How far below grid structures start
    var SUMMON_GRID_PULSE_DURATION = 0.6; // Grid ignition ring duration
    var SUMMON_BEAM_DELAY = 1.8; // When beams start connecting
    var SUMMON_BEAM_STAGGER = 0.12; // Delay between each beam firing
    var SUMMON_TOTAL = 3.5; // Total ceremony duration

    // Default demo structures
    var demoStructures = [
        {id: 'tower', label: 'Zmuuzn', type: 'tower', health: 'green', detail: 'Branch: main', meta: {}},
        {id: 'exp-auth', label: 'auth', type: 'experiment', health: 'green', detail: 'Online (45ms)', meta: {}},
        {
            id: 'exp-helldivers',
            label: 'helldivers',
            type: 'experiment',
            health: 'green',
            detail: 'Online (52ms)',
            meta: {},
        },
        {id: 'gadget-pixel-lab', label: 'pixel-lab', type: 'gadget', health: 'green', detail: 'The Observer', meta: {}},
        {id: 'gadget-code-lab', label: 'code-lab', type: 'gadget', health: 'green', detail: 'The Apprentice', meta: {}},
        {
            id: 'gadget-lab-monitor-3d',
            label: 'lab-monitor-3d',
            type: 'gadget',
            health: 'green',
            detail: 'This dashboard',
            meta: {self: true},
        },
        {id: 'gadget-idle-lab', label: 'idle-lab', type: 'gadget', health: 'green', detail: 'The Grind', meta: {}},
        {
            id: 'database',
            label: 'PostgreSQL',
            type: 'database',
            health: 'green',
            detail: 'postgres.railway.internal:5432',
            meta: {},
        },
        {id: 'pipeline', label: 'Railway', type: 'pipeline', health: 'green', detail: 'europe-west4', meta: {}},
    ];

    function buildStructure(s, pos) {
        var config = Core.structureConfig ? Core.structureConfig(s.type) : {color: 0x4488ff, height: 1.5, radius: 0.6};
        var hColor = Core.healthColor ? Core.healthColor(s.health) : 0x44ff88;

        var mesh;
        if (s.type === 'tower') {
            mesh = buildSpire(config.radius, config.height, 8, config.color);
        } else if (s.type === 'database') {
            mesh = buildCrystal(config.radius, config.height, config.color);
        } else if (s.type === 'experiment') {
            mesh = buildPod(config.radius, config.height, 6, config.color);
        } else if (s.type === 'pipeline') {
            mesh = buildRocket(config.radius, config.height, 8, config.color);
        } else {
            mesh = buildHexWorkbench(config.radius, config.height, config.color);
        }

        // Health ring
        var ring = buildRing(config.radius + 0.1, config.radius + 0.25, 0.02, 24, hColor);

        return {
            id: s.id,
            type: s.type,
            label: s.label,
            health: s.health,
            detail: s.detail,
            meta: s.meta || {},
            pos: pos,
            mesh: mesh,
            ring: ring,
            config: config,
            hoverGlow: 0,
            selectGlow: 0,
            bobPhase: Math.random() * TAU,
        };
    }

    function rebuildScene(stateStructures) {
        structures = [];
        structureMap = {};
        beams = [];

        var layout = Core.computeLayout ? Core.computeLayout(stateStructures) : {};

        // Count siblings per type for stagger offset computation
        var siblingCounters = {};

        for (var i = 0; i < stateStructures.length; i++) {
            var s = stateStructures[i];
            var pos = layout[s.id] || {x: i * 2 - stateStructures.length, y: 0, z: 0};
            var built = buildStructure(s, pos);

            // Summoning metadata: delay + progress
            var sibIdx = siblingCounters[s.type] || 0;
            siblingCounters[s.type] = sibIdx + 1;
            built.summonDelay = Core.summonDelay ? Core.summonDelay(s.type, sibIdx) : 0;
            built.summonT = 0; // 0 = submerged, 1 = fully materialized

            structures.push(built);
            structureMap[s.id] = built;
        }

        // Build beams from tower to everything
        var tower = structureMap['tower'];
        if (tower) {
            for (var bi = 0; bi < structures.length; bi++) {
                if (structures[bi].id !== 'tower') {
                    beams.push({
                        from: tower,
                        to: structures[bi],
                        beamT: 0, // 0 = invisible, 1 = fully connected
                        beamDelay: SUMMON_BEAM_DELAY + bi * SUMMON_BEAM_STAGGER,
                    });
                }
            }
        }

        // Trigger summoning ceremony
        summoningActive = true;
        summonStartTime = time;
    }

    // Initial demo scene
    rebuildScene(demoStructures);

    // Build platform grid
    var gridPlane = buildGridPlane(24, -2.5);

    // =========================================================================
    // Particle System
    // =========================================================================

    var MAX_PARTICLES = 200;
    var particlePositions = new Float32Array(MAX_PARTICLES * 3);
    var particleColors = new Float32Array(MAX_PARTICLES * 4);
    var particleSizes = new Float32Array(MAX_PARTICLES);
    var particlePosBuf = gl.createBuffer();
    var particleColBuf = gl.createBuffer();
    var particleSizeBuf = gl.createBuffer();

    function spawnParticle(x, y, z, vx, vy, vz, r, g, b, a, size, life) {
        if (particles.length >= MAX_PARTICLES) return;
        particles.push({
            x: x,
            y: y,
            z: z,
            vx: vx,
            vy: vy,
            vz: vz,
            r: r,
            g: g,
            b: b,
            a: a,
            size: size,
            life: life,
            maxLife: life,
        });
    }

    function spawnStructureParticles(s) {
        if (!Core.spawnParticleVocab) return;
        var descriptors = Core.spawnParticleVocab(s.pos, s.config.height, s.health);
        for (var i = 0; i < descriptors.length; i++) {
            var d = descriptors[i];
            if (particles.length >= MAX_PARTICLES) return;
            particles.push({
                x: d.x,
                y: d.y,
                z: d.z,
                vx: d.vx,
                vy: d.vy,
                vz: d.vz,
                r: d.r,
                g: d.g,
                b: d.b,
                a: d.a,
                size: d.size,
                life: d.life,
                maxLife: d.life,
                motion: d.motion,
                anchorX: d.anchorX,
                anchorZ: d.anchorZ,
                orbitAngle: d.orbitAngle,
                orbitRadius: d.orbitRadius,
                orbitSpeed: d.orbitSpeed,
                spiralRadius: d.spiralRadius,
                spiralSpeed: d.spiralSpeed,
            });
        }
    }

    function updateParticles(dt) {
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            var lifeRatio = p.life / p.maxLife;

            if (p.motion === 'orbit') {
                // Restless satellite — circles the anchor with slight upward drift
                p.orbitAngle += p.orbitSpeed * dt;
                p.x = p.anchorX + Math.cos(p.orbitAngle) * p.orbitRadius;
                p.z = p.anchorZ + Math.sin(p.orbitAngle) * p.orbitRadius;
                p.y += p.vy;
                // Tighten orbit as life fades (spiraling inward)
                p.orbitRadius *= 1 - dt * 0.15;
                p.a = lifeRatio * 0.7;
            } else if (p.motion === 'spiral') {
                // Helical ascent — crystalline energy rising in a helix
                p.orbitAngle += p.spiralSpeed * dt;
                p.x = p.anchorX + Math.cos(p.orbitAngle) * p.spiralRadius;
                p.z = p.anchorZ + Math.sin(p.orbitAngle) * p.spiralRadius;
                p.y += p.vy;
                // Pulse alpha for flickering crystalline effect
                p.a = lifeRatio * 0.5 * (0.6 + Math.sin(p.orbitAngle * 3) * 0.4);
            } else if (p.motion === 'fall') {
                // Falling sparks — gravity + lateral scatter, flickering
                p.vy -= 0.001 * dt * 60; // gravity acceleration
                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                // Flicker: random alpha jitter for ember effect
                p.a = lifeRatio * 0.9 * (0.5 + Math.random() * 0.5);
                // Size shrinks as embers cool
                p.size *= 1 - dt * 0.3;
            } else {
                // "rise" (green) — gentle steady ascent, peaceful
                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                p.a = lifeRatio * 0.8;
            }
        }
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    function drawMesh(mesh, model, glow) {
        gl.useProgram(progMain);

        var eye = getCameraPos();
        var view = mat4LookAt(eye, [camera.targetX, camera.targetY, camera.targetZ], [0, 1, 0]);
        var proj = mat4Perspective(PI / 4, width / height, 0.1, 100);
        var mvp = mat4Multiply(proj, mat4Multiply(view, model));

        gl.uniformMatrix4fv(gl.getUniformLocation(progMain, 'uMVP'), false, mvp);
        gl.uniformMatrix4fv(gl.getUniformLocation(progMain, 'uModel'), false, model);
        gl.uniform3f(gl.getUniformLocation(progMain, 'uLightDir'), 0.3, 0.8, 0.5);
        gl.uniform3f(gl.getUniformLocation(progMain, 'uAmbient'), 0.15, 0.18, 0.25);
        gl.uniform1f(gl.getUniformLocation(progMain, 'uGlow'), glow || 0);

        var aPos = gl.getAttribLocation(progMain, 'aPos');
        var aNorm = gl.getAttribLocation(progMain, 'aNorm');
        var aColor = gl.getAttribLocation(progMain, 'aColor');

        gl.enableVertexAttribArray(aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.posBuf);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(aNorm);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normBuf);
        gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(aColor);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colBuf);
        gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    function drawGrid() {
        gl.useProgram(progGrid);

        var eye = getCameraPos();
        var view = mat4LookAt(eye, [camera.targetX, camera.targetY, camera.targetZ], [0, 1, 0]);
        var proj = mat4Perspective(PI / 4, width / height, 0.1, 100);
        var mvp = mat4Multiply(proj, view);

        gl.uniformMatrix4fv(gl.getUniformLocation(progGrid, 'uMVP'), false, mvp);
        gl.uniform1f(gl.getUniformLocation(progGrid, 'uTime'), time);

        // Summoning grid pulse: -1 when inactive, 0..1 during ignition
        var pulseVal = -1.0;
        if (summoningActive) {
            var elapsed = time - summonStartTime;
            if (elapsed < SUMMON_GRID_PULSE_DURATION) {
                pulseVal = elapsed / SUMMON_GRID_PULSE_DURATION;
            }
        }
        gl.uniform1f(gl.getUniformLocation(progGrid, 'uSummonPulse'), pulseVal);

        var aPos = gl.getAttribLocation(progGrid, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, gridPlane.buffer);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, gridPlane.count);
    }

    function drawBeams() {
        if (beams.length === 0) return;

        gl.useProgram(progBeam);

        var eye = getCameraPos();
        var view = mat4LookAt(eye, [camera.targetX, camera.targetY, camera.targetZ], [0, 1, 0]);
        var proj = mat4Perspective(PI / 4, width / height, 0.1, 100);
        var mvp = mat4Multiply(proj, view);

        gl.uniformMatrix4fv(gl.getUniformLocation(progBeam, 'uMVP'), false, mvp);
        gl.uniform1f(gl.getUniformLocation(progBeam, 'uTime'), time);

        for (var i = 0; i < beams.length; i++) {
            var b = beams[i];

            // During summoning, beams connect sequentially. Use the
            // closure-scoped clock directly — `summonElapsed` is a `var`
            // local to render() (declared after drawBeams is even called),
            // so referencing it here threw a ReferenceError every frame
            // under strict mode, aborting render() before the summon ever
            // completed: the floor froze on "Connecting nervous system…"
            // over a black canvas while the FPS counter kept ticking.
            // drawGrid() computes the same elapsed correctly (see above).
            if (summoningActive) {
                var summonElapsed = time - summonStartTime;
                var beamProgress = Core.clamp ? Core.clamp((summonElapsed - b.beamDelay) / 0.3, 0, 1) : 1;
                b.beamT = beamProgress;
                if (b.beamT <= 0.001) continue; // beam hasn't fired yet
            }

            var fromY = b.from.pos.y + (b.from.config.height || 1.5);
            var toY = b.to.pos.y + (b.to.config.height || 0.75);

            // During summoning, adjust target Y for structure's current summon offset
            var toSummonYOffset = summoningActive ? (1 - b.to.summonT) * -SUMMON_DEPTH : 0;

            var hc = Core.healthColor ? Core.healthColor(b.to.health) : 0x4488ff;
            var br = ((hc >> 16) & 0xff) / 255;
            var bg = ((hc >> 8) & 0xff) / 255;
            var bb = (hc & 0xff) / 255;

            gl.uniform3f(gl.getUniformLocation(progBeam, 'uBeamColor'), br, bg, bb);

            // Beam extends from tower toward target, partial during summoning
            var endX = Core.lerp ? Core.lerp(b.from.pos.x, b.to.pos.x, b.beamT) : b.to.pos.x;
            var endY = Core.lerp ? Core.lerp(fromY, toY + toSummonYOffset, b.beamT) : toY;
            var endZ = Core.lerp ? Core.lerp(b.from.pos.z, b.to.pos.z, b.beamT) : b.to.pos.z;

            var positions = new Float32Array([b.from.pos.x, fromY, b.from.pos.z, endX, endY, endZ]);

            // Flash brighter when beam first connects
            var beamFlash = b.beamT > 0.9 && b.beamT < 1.0 ? 1.0 : 0.0;
            var alphas = new Float32Array([0.8 + beamFlash * 0.2, 0.3 + beamFlash * 0.5]);

            var posBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

            var alphaBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
            gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);

            var aPos = gl.getAttribLocation(progBeam, 'aPos');
            var aAlpha = gl.getAttribLocation(progBeam, 'aAlpha');

            gl.enableVertexAttribArray(aPos);
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

            gl.enableVertexAttribArray(aAlpha);
            gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
            gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.LINES, 0, 2);

            gl.deleteBuffer(posBuf);
            gl.deleteBuffer(alphaBuf);
        }
    }

    function drawParticles() {
        if (particles.length === 0) return;

        gl.useProgram(progParticle);

        var eye = getCameraPos();
        var view = mat4LookAt(eye, [camera.targetX, camera.targetY, camera.targetZ], [0, 1, 0]);
        var proj = mat4Perspective(PI / 4, width / height, 0.1, 100);
        var mvp = mat4Multiply(proj, view);

        gl.uniformMatrix4fv(gl.getUniformLocation(progParticle, 'uMVP'), false, mvp);

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            particlePositions[i * 3] = p.x;
            particlePositions[i * 3 + 1] = p.y;
            particlePositions[i * 3 + 2] = p.z;
            particleColors[i * 4] = p.r;
            particleColors[i * 4 + 1] = p.g;
            particleColors[i * 4 + 2] = p.b;
            particleColors[i * 4 + 3] = p.a;
            particleSizes[i] = p.size;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, particlePosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, particlePositions.subarray(0, particles.length * 3), gl.DYNAMIC_DRAW);
        var aPos = gl.getAttribLocation(progParticle, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, particleColBuf);
        gl.bufferData(gl.ARRAY_BUFFER, particleColors.subarray(0, particles.length * 4), gl.DYNAMIC_DRAW);
        var aColor = gl.getAttribLocation(progParticle, 'aColor');
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, particleSizeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, particleSizes.subarray(0, particles.length), gl.DYNAMIC_DRAW);
        var aSize = gl.getAttribLocation(progParticle, 'aSize');
        gl.enableVertexAttribArray(aSize);
        gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.POINTS, 0, particles.length);
    }

    // =========================================================================
    // Raycasting (picking)
    // =========================================================================

    function screenToRay(mx, my) {
        var x = (2 * mx) / width - 1;
        var y = 1 - (2 * my) / height;

        var eye = getCameraPos();
        var view = mat4LookAt(eye, [camera.targetX, camera.targetY, camera.targetZ], [0, 1, 0]);
        var proj = mat4Perspective(PI / 4, width / height, 0.1, 100);
        var vp = mat4Multiply(proj, view);

        // Invert VP matrix (simplified for picking — use adj method)
        var inv = mat4Invert(vp);
        if (!inv) return null;

        var nearW = [
            inv[0] * x + inv[4] * y + inv[8] * -1 + inv[12],
            inv[1] * x + inv[5] * y + inv[9] * -1 + inv[13],
            inv[2] * x + inv[6] * y + inv[10] * -1 + inv[14],
            inv[3] * x + inv[7] * y + inv[11] * -1 + inv[15],
        ];
        var farW = [
            inv[0] * x + inv[4] * y + inv[8] * 1 + inv[12],
            inv[1] * x + inv[5] * y + inv[9] * 1 + inv[13],
            inv[2] * x + inv[6] * y + inv[10] * 1 + inv[14],
            inv[3] * x + inv[7] * y + inv[11] * 1 + inv[15],
        ];

        var near = [nearW[0] / nearW[3], nearW[1] / nearW[3], nearW[2] / nearW[3]];
        var far = [farW[0] / farW[3], farW[1] / farW[3], farW[2] / farW[3]];

        var dir = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
        var dl = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
        dir[0] /= dl;
        dir[1] /= dl;
        dir[2] /= dl;

        return {origin: near, dir: dir};
    }

    function mat4Invert(m) {
        var inv = new Float32Array(16);
        inv[0] =
            m[5] * m[10] * m[15] -
            m[5] * m[11] * m[14] -
            m[9] * m[6] * m[15] +
            m[9] * m[7] * m[14] +
            m[13] * m[6] * m[11] -
            m[13] * m[7] * m[10];
        inv[4] =
            -m[4] * m[10] * m[15] +
            m[4] * m[11] * m[14] +
            m[8] * m[6] * m[15] -
            m[8] * m[7] * m[14] -
            m[12] * m[6] * m[11] +
            m[12] * m[7] * m[10];
        inv[8] =
            m[4] * m[9] * m[15] -
            m[4] * m[11] * m[13] -
            m[8] * m[5] * m[15] +
            m[8] * m[7] * m[13] +
            m[12] * m[5] * m[11] -
            m[12] * m[7] * m[9];
        inv[12] =
            -m[4] * m[9] * m[14] +
            m[4] * m[10] * m[13] +
            m[8] * m[5] * m[14] -
            m[8] * m[6] * m[13] -
            m[12] * m[5] * m[10] +
            m[12] * m[6] * m[9];
        inv[1] =
            -m[1] * m[10] * m[15] +
            m[1] * m[11] * m[14] +
            m[9] * m[2] * m[15] -
            m[9] * m[3] * m[14] -
            m[13] * m[2] * m[11] +
            m[13] * m[3] * m[10];
        inv[5] =
            m[0] * m[10] * m[15] -
            m[0] * m[11] * m[14] -
            m[8] * m[2] * m[15] +
            m[8] * m[3] * m[14] +
            m[12] * m[2] * m[11] -
            m[12] * m[3] * m[10];
        inv[9] =
            -m[0] * m[9] * m[15] +
            m[0] * m[11] * m[13] +
            m[8] * m[1] * m[15] -
            m[8] * m[3] * m[13] -
            m[12] * m[1] * m[11] +
            m[12] * m[3] * m[9];
        inv[13] =
            m[0] * m[9] * m[14] -
            m[0] * m[10] * m[13] -
            m[8] * m[1] * m[14] +
            m[8] * m[2] * m[13] +
            m[12] * m[1] * m[10] -
            m[12] * m[2] * m[9];
        inv[2] =
            m[1] * m[6] * m[15] -
            m[1] * m[7] * m[14] -
            m[5] * m[2] * m[15] +
            m[5] * m[3] * m[14] +
            m[13] * m[2] * m[7] -
            m[13] * m[3] * m[6];
        inv[6] =
            -m[0] * m[6] * m[15] +
            m[0] * m[7] * m[14] +
            m[4] * m[2] * m[15] -
            m[4] * m[3] * m[14] -
            m[12] * m[2] * m[7] +
            m[12] * m[3] * m[6];
        inv[10] =
            m[0] * m[5] * m[15] -
            m[0] * m[7] * m[13] -
            m[4] * m[1] * m[15] +
            m[4] * m[3] * m[13] +
            m[12] * m[1] * m[7] -
            m[12] * m[3] * m[5];
        inv[14] =
            -m[0] * m[5] * m[14] +
            m[0] * m[6] * m[13] +
            m[4] * m[1] * m[14] -
            m[4] * m[2] * m[13] -
            m[12] * m[1] * m[6] +
            m[12] * m[2] * m[5];
        inv[3] =
            -m[1] * m[6] * m[11] +
            m[1] * m[7] * m[10] +
            m[5] * m[2] * m[11] -
            m[5] * m[3] * m[10] -
            m[9] * m[2] * m[7] +
            m[9] * m[3] * m[6];
        inv[7] =
            m[0] * m[6] * m[11] -
            m[0] * m[7] * m[10] -
            m[4] * m[2] * m[11] +
            m[4] * m[3] * m[10] +
            m[8] * m[2] * m[7] -
            m[8] * m[3] * m[6];
        inv[11] =
            -m[0] * m[5] * m[11] +
            m[0] * m[7] * m[9] +
            m[4] * m[1] * m[11] -
            m[4] * m[3] * m[9] -
            m[8] * m[1] * m[7] +
            m[8] * m[3] * m[5];
        inv[15] =
            m[0] * m[5] * m[10] -
            m[0] * m[6] * m[9] -
            m[4] * m[1] * m[10] +
            m[4] * m[2] * m[9] +
            m[8] * m[1] * m[6] -
            m[8] * m[2] * m[5];

        var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
        if (Math.abs(det) < 1e-8) return null;

        var invDet = 1 / det;
        for (var i = 0; i < 16; i++) inv[i] *= invDet;
        return inv;
    }

    function hitTestStructures(mx, my) {
        var ray = screenToRay(mx, my);
        if (!ray) return null;

        var closest = null;
        var closestDist = Infinity;

        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];
            var r = (s.config.radius || 0.5) + 0.3; // Slight padding
            var h = s.config.height || 1.0;
            var cy = s.pos.y + h / 2;

            // Sphere test (approximate bounding sphere)
            var sphereR = Math.max(r, h / 2) + 0.2;
            var dx = ray.origin[0] - s.pos.x;
            var dy = ray.origin[1] - cy;
            var dz = ray.origin[2] - s.pos.z;

            var a = ray.dir[0] * ray.dir[0] + ray.dir[1] * ray.dir[1] + ray.dir[2] * ray.dir[2];
            var b = 2 * (dx * ray.dir[0] + dy * ray.dir[1] + dz * ray.dir[2]);
            var c = dx * dx + dy * dy + dz * dz - sphereR * sphereR;
            var disc = b * b - 4 * a * c;

            if (disc >= 0) {
                var t = (-b - Math.sqrt(disc)) / (2 * a);
                if (t > 0 && t < closestDist) {
                    closestDist = t;
                    closest = s;
                }
            }
        }

        return closest;
    }

    // =========================================================================
    // Tooltip & Info Panel
    // =========================================================================

    function showTooltip(s, mx, my) {
        var title = tooltip.querySelector('.tooltip-title');
        var detail = tooltip.querySelector('.tooltip-detail');
        var health = tooltip.querySelector('.tooltip-health');

        var configLabel = Core.structureConfig ? Core.structureConfig(s.type).label : s.type;
        title.textContent = configLabel + ': ' + s.label;
        detail.textContent = s.detail;
        health.className = 'tooltip-health health-' + s.health;
        health.textContent = Core.healthVoice ? Core.healthVoice(s.health) : s.health.toUpperCase();

        tooltip.style.display = 'block';
        tooltip.style.left = mx + 16 + 'px';
        tooltip.style.top = my + 16 + 'px';

        // Keep tooltip in bounds
        var rect = tooltip.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();
        if (rect.right > containerRect.right) {
            tooltip.style.left = mx - rect.width - 8 + 'px';
        }
        if (rect.bottom > containerRect.bottom) {
            tooltip.style.top = my - rect.height - 8 + 'px';
        }
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }

    function showInfoPanel(s) {
        var config = Core.structureConfig ? Core.structureConfig(s.type) : {};
        var html =
            '<div class="panel-title">' + escapeHtml(config.label || s.type) + ': ' + escapeHtml(s.label) + '</div>';
        html +=
            '<div class="panel-row"><span class="panel-label">Health</span><span class="panel-value health-' +
            s.health +
            '">' +
            escapeHtml(Core.healthVoice ? Core.healthVoice(s.health) : s.health.toUpperCase()) +
            '</span></div>';
        html +=
            '<div class="panel-row"><span class="panel-label">Status</span><span class="panel-value">' +
            escapeHtml(s.detail) +
            '</span></div>';

        if (s.meta) {
            var keys = Object.keys(s.meta);
            for (var i = 0; i < keys.length; i++) {
                if (keys[i] === 'self') continue;
                html +=
                    '<div class="panel-row"><span class="panel-label">' +
                    escapeHtml(keys[i]) +
                    '</span><span class="panel-value">' +
                    escapeHtml(String(s.meta[keys[i]])) +
                    '</span></div>';
            }
        }

        html += '<div class="panel-row"><span class="panel-label">Description</span></div>';
        html +=
            '<div class="panel-value" style="margin-top:2px;font-size:11px;color:#6688aa;">' +
            escapeHtml(config.description || '') +
            '</div>';

        if (s.type === 'experiment') {
            html +=
                '<button class="panel-action" data-action="openExperiment" data-id="' +
                escapeHtml(s.id) +
                '">Enter the Lab</button>';
        } else if (s.type === 'gadget' && !s.meta.self) {
            html +=
                '<button class="panel-action" data-action="openGadget" data-id="' +
                escapeHtml(s.id) +
                '">Inspect Workbench</button>';
        }

        infoPanel.innerHTML = html;
        infoPanel.style.display = 'block';

        // Action button handlers
        var buttons = infoPanel.querySelectorAll('.panel-action');
        for (var bi = 0; bi < buttons.length; bi++) {
            buttons[bi].addEventListener('click', function (e) {
                var action = e.target.getAttribute('data-action');
                var id = e.target.getAttribute('data-id');
                onInteraction({type: 'interaction', action: action, id: id});
            });
        }
    }

    function hideInfoPanel() {
        infoPanel.style.display = 'none';
        selectedStructure = null;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =========================================================================
    // Mouse Interaction
    // =========================================================================

    canvas.addEventListener('mousemove', function (e) {
        if (dragging) {
            hideTooltip();
            return;
        }
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        var hit = hitTestStructures(mx, my);
        if (hit) {
            hoveredStructure = hit;
            showTooltip(
                hit,
                e.clientX - container.getBoundingClientRect().left,
                e.clientY - container.getBoundingClientRect().top,
            );
            canvas.style.cursor = 'pointer';
        } else {
            hoveredStructure = null;
            hideTooltip();
            canvas.style.cursor = dragging ? 'grabbing' : 'grab';
        }
    });

    canvas.addEventListener('click', function (e) {
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        var hit = hitTestStructures(mx, my);
        if (hit) {
            if (selectedStructure === hit) {
                hideInfoPanel();
            } else {
                selectedStructure = hit;
                showInfoPanel(hit);
                // Spawn some particles on click
                for (var i = 0; i < 8; i++) {
                    var hc = Core.healthColor ? Core.healthColor(hit.health) : 0x44ff88;
                    var r = ((hc >> 16) & 0xff) / 255;
                    var g = ((hc >> 8) & 0xff) / 255;
                    var b = (hc & 0xff) / 255;
                    spawnParticle(
                        hit.pos.x + (Math.random() - 0.5),
                        hit.pos.y + hit.config.height + Math.random(),
                        hit.pos.z + (Math.random() - 0.5),
                        (Math.random() - 0.5) * 0.05,
                        0.02 + Math.random() * 0.04,
                        (Math.random() - 0.5) * 0.05,
                        r,
                        g,
                        b,
                        1.0,
                        4 + Math.random() * 4,
                        1.5 + Math.random(),
                    );
                }
            }
        } else {
            hideInfoPanel();
        }
    });

    // =========================================================================
    // Main Loop
    // =========================================================================

    var particleSpawnTimer = 0;

    function render(now) {
        if (paused) {
            rafHandle = null;
            return;
        }
        rafHandle = requestAnimationFrame(render);

        var dt = Math.min((now - lastFrameTime) / 1000, 0.1);
        lastFrameTime = now;
        time += dt;

        // FPS counter
        frameCount++;
        fpsTimer += dt;
        if (fpsTimer >= 1) {
            currentFps = frameCount;
            frameCount = 0;
            fpsTimer = 0;
            fpsDisplay.textContent = currentFps + ' FPS';
        }

        // Auto-rotate camera
        if (camera.autoRotate) {
            camera.theta += camera.autoRotateSpeed * dt;
        }

        // Ambient particle spawning (suppressed during summoning — burst particles take over)
        if (!summoningActive) {
            particleSpawnTimer += dt;
            if (particleSpawnTimer > 0.5) {
                particleSpawnTimer = 0;
                for (var si = 0; si < structures.length; si++) {
                    if (Math.random() < 0.3) {
                        spawnStructureParticles(structures[si]);
                    }
                }
            }
        }

        // Summoning status display
        if (summoningActive) {
            var summonPhaseElapsed = time - summonStartTime;
            if (summonPhaseElapsed < 0.5) {
                statusDisplay.textContent = 'Igniting grid...';
            } else if (summonPhaseElapsed < 1.2) {
                statusDisplay.textContent = 'Summoning structures...';
            } else if (summonPhaseElapsed < 2.2) {
                statusDisplay.textContent = 'Materializing...';
            } else if (summonPhaseElapsed < SUMMON_TOTAL) {
                statusDisplay.textContent = 'Connecting nervous system...';
            }
        }

        updateParticles(dt);

        // Clear
        gl.clearColor(0.04, 0.04, 0.1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Draw grid platform
        drawGrid();

        // Draw beams (behind structures)
        gl.lineWidth(2);
        drawBeams();

        // =====================================================================
        // Update summoning state
        // =====================================================================
        var summonElapsed = summoningActive ? time - summonStartTime : 999;

        if (summoningActive && summonElapsed > SUMMON_TOTAL) {
            summoningActive = false;
            // Snap all to fully materialized
            for (var fi = 0; fi < structures.length; fi++) {
                structures[fi].summonT = 1;
            }
            for (var fbi = 0; fbi < beams.length; fbi++) {
                beams[fbi].beamT = 1;
            }
            statusDisplay.textContent = 'Online';
        }

        // Draw structures
        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];

            // Update summon progress for this structure
            if (summoningActive) {
                var rawProgress = Core.summonProgress ? Core.summonProgress(summonElapsed, s.summonDelay) : 1;
                s.summonT = Core.summonEase ? Core.summonEase(rawProgress) : rawProgress;
            }

            // Skip drawing structures that haven't begun summoning
            if (s.summonT <= 0.001) continue;

            // Bobbing animation (suppressed during summoning)
            var bobAmount = s.summonT >= 0.99 ? 1 : 0;
            var bob = Math.sin(time * 1.2 + s.bobPhase) * 0.15 * bobAmount;

            // Hover/select glow
            var targetHover = hoveredStructure === s ? 1 : 0;
            s.hoverGlow += (targetHover - s.hoverGlow) * 0.1;
            var targetSelect = selectedStructure === s ? 1 : 0;
            s.selectGlow += (targetSelect - s.selectGlow) * 0.1;
            var glow = Math.max(s.hoverGlow * 0.5, s.selectGlow * 0.8);

            // Health pulse for non-green
            if (s.health === 'amber') {
                glow += Core.pulse ? Core.pulse(time, 2) * 0.3 : 0;
            } else if (s.health === 'red') {
                glow += Core.pulse ? Core.pulse(time, 4) * 0.6 : 0;
            }

            // Summoning: emergence glow — structures glow intensely during materialization
            if (s.summonT < 0.95) {
                var emergenceGlow = Math.sin(s.summonT * PI) * 0.8; // peaks mid-emergence
                glow += emergenceGlow;
            }

            // Summoning: vertical offset — structures rise from below the grid
            var summonYOffset = (1 - s.summonT) * -SUMMON_DEPTH;

            // Summoning: scale — structures grow from nothing to full size with overshoot
            var summonScale = s.summonT;

            var model = mat4Create();
            model = mat4Translate(model, s.pos.x, s.pos.y + bob + summonYOffset, s.pos.z);
            model = mat4Scale(model, summonScale, summonScale, summonScale);

            // Slow rotation for database crystal
            if (s.type === 'database') {
                model = mat4RotateY(model, time * 0.5);
            }

            drawMesh(s.mesh, model, glow);

            // Health ring (at base, no bob) — also affected by summoning
            var ringModel = mat4Create();
            ringModel = mat4Translate(ringModel, s.pos.x, s.pos.y - 0.1 + summonYOffset, s.pos.z);
            ringModel = mat4Scale(ringModel, summonScale, summonScale, summonScale);
            drawMesh(s.ring, ringModel, glow * 0.5);

            // Summoning particle burst — heavy emission during the 0.2..0.8 progress range
            if (summoningActive && s.summonT > 0.2 && s.summonT < 0.8 && Math.random() < 0.4) {
                var hc = Core.healthColor ? Core.healthColor(s.health) : 0x44ff88;
                var pr = ((hc >> 16) & 0xff) / 255;
                var pg = ((hc >> 8) & 0xff) / 255;
                var pb = (hc & 0xff) / 255;
                for (var sp = 0; sp < 5; sp++) {
                    spawnParticle(
                        s.pos.x + (Math.random() - 0.5) * 0.8,
                        s.pos.y + summonYOffset + Math.random() * 0.5,
                        s.pos.z + (Math.random() - 0.5) * 0.8,
                        (Math.random() - 0.5) * 1.5,
                        1.5 + Math.random() * 2.0,
                        (Math.random() - 0.5) * 1.5,
                        pr,
                        pg,
                        pb,
                        0.9,
                        4 + Math.random() * 4,
                        0.6 + Math.random() * 0.6,
                    );
                }
            }
        }

        // Draw particles (last, with additive blending)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        drawParticles();
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    rafHandle = requestAnimationFrame(render);
    statusDisplay.textContent = 'Summoning laboratory...';

    // =========================================================================
    // External API — what the Vue host can do to the running scene
    // =========================================================================

    function applyState(payload) {
        dashboardState = payload;
        branchDisplay.textContent = dashboardState.branch || '--';
        statusDisplay.textContent = 'Online';
        if (dashboardState.timestamp) {
            lastUpdateDisplay.textContent =
                'Updated: ' +
                (Core.formatRelativeTime ? Core.formatRelativeTime(dashboardState.timestamp) : 'just now');
        }
        if (dashboardState.structures && dashboardState.structures.length > 0) {
            rebuildScene(dashboardState.structures);
            if (selectedStructure) {
                var updated = structureMap[selectedStructure.id];
                if (updated) {
                    selectedStructure = updated;
                    showInfoPanel(updated);
                } else {
                    hideInfoPanel();
                }
            }
        }
    }

    return {
        /**
         * Push a new DashboardState into the scene. Rebuilds geometry and
         * refreshes the header chrome. The state shape matches the legacy
         * VS Code payload (`{structures, branch, timestamp}`) — the Vue
         * composable flattens the typed Rust payload into this shape before
         * calling.
         */
        setState: function (payload) {
            applyState(payload);
        },
        /**
         * Stop the render loop. The next RAF callback will see `paused`
         * and return without re-scheduling. Cheap to call repeatedly.
         */
        pauseRaf: function () {
            paused = true;
        },
        /**
         * Resume the render loop. If the loop was previously paused this
         * issues a fresh RAF; if it is already running this is a no-op.
         */
        resumeRaf: function () {
            if (!paused) return;
            paused = false;
            if (rafHandle === null) {
                rafHandle = requestAnimationFrame(render);
            }
        },
        /**
         * Tear down the scene. Pauses the RAF, detaches every window
         * listener the scene installed, and releases the WebGL context.
         * Called by the Vue host on unmount.
         */
        destroy: function () {
            paused = true;
            if (rafHandle !== null) {
                cancelAnimationFrame(rafHandle);
                rafHandle = null;
            }
            for (var li = 0; li < windowListeners.length; li++) {
                var entry = windowListeners[li];
                window.removeEventListener(entry.type, entry.handler, entry.options);
            }
            windowListeners = [];
            // Best-effort context release. If the host removes the canvas
            // from the DOM the browser collects this on its own anyway.
            try {
                var lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            } catch (e) {
                // ignore — release is best-effort.
            }
        },
    };
}
