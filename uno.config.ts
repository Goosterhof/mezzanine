import {defineConfig, presetAttributify, presetIcons, presetWind3, transformerVariantGroup} from 'unocss';

// The Mezzanine — Balcony palette.
//
// The Mezzanine's visual posture is architectural: the investor stands on an
// elevated balcony, watching the lab floor below. The palette reads like a
// theatre balcony — deep wood and steel underfoot, brass railings, a single
// green pulse where a scientist is dispatched. No maritime tones, no
// gemstone-vault tones (those belong to the Horadric Cube). The colours
// the bench era used carry forward — the metaphor changed, not the eye.

export default defineConfig({
    presets: [presetWind3({dark: 'class'}), presetAttributify(), presetIcons({scale: 1.2, cdn: 'https://esm.sh/'})],
    transformers: [transformerVariantGroup()],
    theme: {
        colors: {
            // Surface tones — the balcony and the floor below
            'mz-surface': '#0F1114', // deep steel — the canvas behind everything
            'mz-rail': '#171A1F', // balcony rail — slightly raised from surface
            'mz-canvas': '#0B0D10', // scientist output pane — the deepest well
            'mz-command': '#1C2026', // command bar — the instrument tray
            'mz-panel': '#191D23', // slide-down sheets (Dispatch, etc.)

            // Edge + line work — the balcony's frame
            'mz-edge': '#2A3038', // primary border / divider
            'mz-edge-soft': '#1F242B', // secondary border, hairlines
            'mz-rule': '#363D47', // grip rules, focused edges

            // Text — engraved labels on brass plates
            'mz-text': '#E2E5E9', // primary
            'mz-text-mute': '#9098A4', // secondary, labels
            'mz-text-faint': '#5B6470', // tertiary, watermarks
            'mz-stamp': '#B4B9C0', // monospace, stamped lettering

            // Pulse states — the only thing that moves
            'mz-pulse-idle': '#3F4751', // dim grey
            'mz-pulse-awaiting': '#4ADE80', // steady green
            'mz-pulse-working': '#22C55E', // pulsing green (animated)
            'mz-pulse-flash': '#86EFAC', // bright flash → settles to awaiting
            'mz-pulse-crashed': '#F87171', // red

            // Brass — accents on balcony fittings
            'mz-brass': '#D4A24C',
            'mz-brass-dim': '#8C6A2F',

            // Signal — only used when the laboratory needs the investor's eye
            'mz-signal': '#F59E0B',
        },
        fontFamily: {
            display: "'Space Grotesk', system-ui, sans-serif",
            mono: "'JetBrains Mono', 'Fira Code', monospace",
            body: "'Space Grotesk', system-ui, sans-serif",
        },
        boxShadow: {
            balcony: '0 0 0 1px rgba(54, 61, 71, 0.6), 0 4px 16px rgba(0, 0, 0, 0.5)',
            tray: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 -1px 0 rgba(0, 0, 0, 0.5)',
            pulse: '0 0 8px rgba(74, 222, 128, 0.45)',
        },
    },
    shortcuts: {
        'mz-tab':
            'flex items-center gap-3 px-4 py-3 text-mz-text-mute hover:text-mz-text hover:bg-mz-edge-soft/40 cursor-pointer transition-colors duration-100 border-l-2 border-transparent',
        'mz-tab-active': 'text-mz-text bg-mz-edge-soft/60 border-l-2 border-mz-brass',
        'mz-button':
            'px-3 py-1.5 text-xs font-display tracking-wide uppercase text-mz-text-mute border border-mz-edge hover:border-mz-rule hover:text-mz-text transition-colors duration-100',
        'mz-button-icon':
            'w-9 h-9 flex items-center justify-center text-mz-text-mute hover:text-mz-text hover:bg-mz-edge-soft/60 transition-colors duration-100',
        'mz-input':
            'bg-mz-canvas border border-mz-edge text-mz-text font-mono text-sm px-3 py-2 focus:outline-none focus:border-mz-rule placeholder:text-mz-text-faint',
        'mz-rule': 'h-px bg-mz-edge-soft',
        'mz-stamp-label': 'text-mz-text-faint font-display tracking-[0.2em] uppercase text-[10px]',
    },
    preflights: [
        {
            getCSS: () => `
        :root { color-scheme: dark; }
        html, body, #app { height: 100%; margin: 0; }
        body {
          background: #0F1114;
          color: #E2E5E9;
          font-family: 'Space Grotesk', system-ui, sans-serif;
          font-feature-settings: "ss01", "cv11";
          overflow: hidden;
        }
        ::selection { background: rgba(212, 162, 76, 0.25); color: #E2E5E9; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(54, 61, 71, 0.55); border-radius: 0; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(212, 162, 76, 0.55); }

        @keyframes mz-pulse-working {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(74, 222, 128, 0.55); }
          50% { opacity: 0.55; box-shadow: 0 0 4px rgba(74, 222, 128, 0.25); }
        }
        @keyframes mz-pulse-flash {
          0% { background-color: #86EFAC; box-shadow: 0 0 12px rgba(134, 239, 172, 0.7); }
          100% { background-color: #4ADE80; box-shadow: 0 0 6px rgba(74, 222, 128, 0.35); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `,
        },
    ],
});
