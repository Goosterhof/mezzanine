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
            exclude: ['src/main.ts', 'src/vite-env.d.ts'],
            thresholds: {lines: 90, functions: 90, branches: 90, statements: 90},
        },
    },
});
