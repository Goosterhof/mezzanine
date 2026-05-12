import vue from '@vitejs/plugin-vue';
import {fileURLToPath, URL} from 'node:url';
import UnoCSS from 'unocss/vite';
import {defineConfig} from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// The Mezzanine dev server runs on 1430 — chosen to sit one decade above the
// Horadric Cube's 1420 so the two gadgets can run side-by-side during
// cross-gadget development without port collisions.

export default defineConfig(async () => ({
    plugins: [vue(), UnoCSS()],

    resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},

    clearScreen: false,
    server: {
        port: 1430,
        strictPort: true,
        host: host || false,
        hmr: host ? {protocol: 'ws', host, port: 1431} : undefined,
        watch: {ignored: ['**/src-tauri/**']},
    },
}));
