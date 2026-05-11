import {defineConfig, presetAttributify, presetIcons, presetUno, transformerVariantGroup} from 'unocss';

// The Workbench — Bench palette.
//
// The Workbench's visual posture is mechanical: a steel bench under workshop
// light, brass fittings on the instruments, a green pulse for live sessions.
// No maritime tones, no gemstone-vault tones (those belong to the Horadric
// Cube). The palette reads like a precision tool catalogue, not a dashboard.

export default defineConfig({
    presets: [presetUno({dark: 'class'}), presetAttributify(), presetIcons({scale: 1.2, cdn: 'https://esm.sh/'})],
    transformers: [transformerVariantGroup()],
    theme: {
        colors: {
            // Surface tones — the bench itself
            'wb-surface': '#0F1114', // deep steel — the canvas behind everything
            'wb-rail': '#171A1F', // left rail — slightly raised from surface
            'wb-canvas': '#0B0D10', // session output pane — the deepest well
            'wb-command': '#1C2026', // command bar — the instrument tray
            'wb-panel': '#191D23', // slide-in panels (Mission Control, Drydock, Dossier)

            // Edge + line work — the bench's frame
            'wb-edge': '#2A3038', // primary border / divider
            'wb-edge-soft': '#1F242B', // secondary border, hairlines
            'wb-rule': '#363D47', // grip rules, focused edges

            // Text — engraved labels on brass plates
            'wb-text': '#E2E5E9', // primary
            'wb-text-mute': '#9098A4', // secondary, labels
            'wb-text-faint': '#5B6470', // tertiary, watermarks
            'wb-stamp': '#B4B9C0', // monospace, stamped lettering

            // Pulse states — the only thing that moves
            'wb-pulse-idle': '#3F4751', // dim grey
            'wb-pulse-awaiting': '#4ADE80', // steady green
            'wb-pulse-working': '#22C55E', // pulsing green (animated)
            'wb-pulse-flash': '#86EFAC', // bright flash → settles to awaiting
            'wb-pulse-crashed': '#F87171', // red

            // Brass — accents on instrument fittings
            'wb-brass': '#D4A24C',
            'wb-brass-dim': '#8C6A2F',

            // Signal — only used when the laboratory needs the investor's eye
            'wb-signal': '#F59E0B',
        },
        fontFamily: {
            display: "'Space Grotesk', system-ui, sans-serif",
            mono: "'JetBrains Mono', 'Fira Code', monospace",
            body: "'Space Grotesk', system-ui, sans-serif",
        },
        boxShadow: {
            bench: '0 0 0 1px rgba(54, 61, 71, 0.6), 0 4px 16px rgba(0, 0, 0, 0.5)',
            tray: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 -1px 0 rgba(0, 0, 0, 0.5)',
            pulse: '0 0 8px rgba(74, 222, 128, 0.45)',
        },
    },
    shortcuts: {
        'wb-tab':
            'flex items-center gap-3 px-4 py-3 text-wb-text-mute hover:text-wb-text hover:bg-wb-edge-soft/40 cursor-pointer transition-colors duration-100 border-l-2 border-transparent',
        'wb-tab-active': 'text-wb-text bg-wb-edge-soft/60 border-l-2 border-wb-brass',
        'wb-button':
            'px-3 py-1.5 text-xs font-display tracking-wide uppercase text-wb-text-mute border border-wb-edge hover:border-wb-rule hover:text-wb-text transition-colors duration-100',
        'wb-button-icon':
            'w-9 h-9 flex items-center justify-center text-wb-text-mute hover:text-wb-text hover:bg-wb-edge-soft/60 transition-colors duration-100',
        'wb-input':
            'bg-wb-canvas border border-wb-edge text-wb-text font-mono text-sm px-3 py-2 focus:outline-none focus:border-wb-rule placeholder:text-wb-text-faint',
        'wb-rule': 'h-px bg-wb-edge-soft',
        'wb-stamp-label': 'text-wb-text-faint font-display tracking-[0.2em] uppercase text-[10px]',
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

        @keyframes wb-pulse-working {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(74, 222, 128, 0.55); }
          50% { opacity: 0.55; box-shadow: 0 0 4px rgba(74, 222, 128, 0.25); }
        }
        @keyframes wb-pulse-flash {
          0% { background-color: #86EFAC; box-shadow: 0 0 12px rgba(134, 239, 172, 0.7); }
          100% { background-color: #4ADE80; box-shadow: 0 0 6px rgba(74, 222, 128, 0.35); }
        }
      `,
        },
    ],
});
