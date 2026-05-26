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
            ],
            thresholds: {lines: 90, functions: 90, branches: 90, statements: 90},
        },
    },
});
