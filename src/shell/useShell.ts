import {ref} from 'vue';

export const PAGES = [
    {id: 'conversation', label: 'Conversation'},
    {id: 'mission-control', label: 'Mission Control'},
    {id: 'drydock', label: 'Drydock'},
    {id: 'holotable', label: 'Holotable'},
    {id: 'grind', label: 'Grind'},
    {id: 'briefs', label: 'Briefs'},
] as const;
export type PageId = (typeof PAGES)[number]['id'];
const page = ref<PageId>('conversation');

export function useShell() {
    return {
        page,
        navigate(destination: PageId): void {
            page.value = destination;
        },
        reset(): void {
            page.value = 'conversation';
        },
    };
}
