import type {ILinkHandler} from '@xterm/xterm';

import {openUrl} from '@tauri-apps/plugin-opener';
import {ref} from 'vue';

/** One activation path for detected URLs and explicit OSC 8 hyperlinks. */
export function createTerminalLinks(open: (url: string) => Promise<void> = openUrl) {
    const notice = ref<{text: string; error: boolean} | null>(null);
    const activate = (event: MouseEvent, text: string): void => {
        if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return;
        try {
            const url = new URL(text);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
        } catch {
            return;
        }
        event.preventDefault();
        void open(text).catch(() => {
            notice.value = {text: `Could not open ${text}. You can still select and copy the link.`, error: true};
        });
    };
    const hover = (_event: MouseEvent, text: string): void => {
        notice.value = {text: `Ctrl / ⌘ + click to open · ${text}`, error: false};
    };
    const leave = (): void => {
        if (!notice.value?.error) notice.value = null;
    };
    const handler: ILinkHandler = {allowNonHttpProtocols: false, activate, hover, leave};
    return {handler, notice, activate, hover, leave};
}
