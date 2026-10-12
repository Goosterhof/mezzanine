export interface ChatItem {
    id: string;
    kind: 'user' | 'assistant' | 'tool';
    phase: string | null;
    text: string;
    label: string;
    truncated: boolean;
}

export interface ChatTurn {
    id: string;
    items: ChatItem[];
    omittedItems: number;
}

export interface ChatPage {
    threadId: string;
    turns: ChatTurn[];
    nextCursor: string | null;
}

export interface PinnedReply {
    turnId: string;
    item: ChatItem;
}
