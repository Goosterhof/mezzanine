import {ref} from 'vue';

import type {Colleague} from '../roster/types';

import {useColleagues} from '../roster/useColleagues';
import {useRoster} from '../roster/useRoster';
import {useShell} from '../shell/useShell';

const draft = ref('');

export function useCommandDraft() {
    return {
        draft,
        prepare(identity: Colleague, text: string): void {
            if (draft.value.trim())
                throw new Error(
                    'Your unfinished draft is preserved in Conversation. Send or clear it before preparing another brief.',
                );
            const scientist = useColleagues().bench(identity);
            if (!scientist || ['done', 'crashed'].includes(scientist.state)) {
                throw new Error('Open this colleague’s conversation before preparing a brief.');
            }
            // Preserve the investor's unsent words. This never writes to a PTY.
            draft.value = text;
            useRoster().select(scientist.id);
            useShell().navigate('conversation');
        },
    };
}
