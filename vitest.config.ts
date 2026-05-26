import vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.spec.ts'],
        setupFiles: ['./tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.{ts,vue}'],
            // App.vue is the top-level shell — pure composition of slices, no
            // logic worth asserting beyond mounting it; covering it would
            // duplicate the slice-level specs. The two `types.ts` files
            // marked here are type-only modules (no runtime exports) that
            // v8 reports as 0% because no spec imports them; their consumers
            // import via `import type`, which strips at build time.
            exclude: [
                'src/main.ts',
                'src/vite-env.d.ts',
                'src/App.vue',
                'src/chronicle/types.ts',
                'src/drydock/types.ts',
                // The Holotable's WebGL host components need a real
                // browser to exercise — jsdom does not provide a WebGL
                // context. The lifted scene.js + lab-core.js are JS, not
                // included in the v8 sweep at all. The composable side
                // (useHolotable.ts + types.ts) covers everything testable
                // at this layer. See experiment log #00051 § Phase H-4.
                'src/holotable/HolotablePanel.vue',
                'src/holotable/HolotableScene.vue',
                // The Observer's lifted canvas scene (Arc 2 #00052) is
                // pure JS pixel-art rendering — jsdom has no Canvas 2D
                // implementation and the renderer guards behind
                // `ctx.imageSmoothingEnabled = false` and so on. The
                // LabScene Vue wrapper mounts the scene module which the
                // jsdom environment cannot run; the composable side
                // (useObserver.ts + activityInference.ts + types.ts) is
                // what carries the testable surface for v8 coverage.
                'src/observer/LabScene.vue',
                'src/observer/ObserverPanel.vue',
                'src/observer/scene.js',
                'src/observer/lab-core.js',
                // The Grind's Canvas 2D renderer (Arc 3 #00053) draws
                // through `canvas.getContext('2d')`; jsdom returns `null`
                // for that context (see tests/setup.ts shim), making the
                // renderer untestable at the v8 level. The HUD and the
                // composable carry the testable surface.
                'src/grind/GrindRenderer.vue',
                'src/grind/GrindPanel.vue',
                'src/grind/types.ts',
            ],
            thresholds: {lines: 90, functions: 90, branches: 90, statements: 90},
        },
    },
});
