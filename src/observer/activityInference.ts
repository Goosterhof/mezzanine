// activityInference — pure functions that map a chronicle JSONL turn to
// an ActivityState value. Near-direct port of the Pixel Lab's
// `gadgets/pixel-lab/src/activityInference.ts` — the upstream JSONL
// vocabulary is Anthropic's claude turn format, which is the same shape
// in both gadgets.
//
// Two port adaptations:
//   1. The Node `path` import is stripped; `path.basename(filePath)`
//      becomes `filePath.split(/[\\/]/).pop()` so the module runs cleanly
//      in the Vite/browser runtime without a Node polyfill.
//   2. The Pixel Lab uses `as string` type assertions which type-aware
//      oxlint flags as unsafe (the assertion erases the unknown union
//      with undefined and the trailing `?? '...'` becomes unnecessary).
//      The Mezzanine port uses `typeof` guards to keep the safety
//      check honest. Behaviour is identical — every input that the
//      upstream cast treated as a string still resolves to a string here.
//
// The functions are exported individually so the inference layer is
// fully unit-testable. `useObserver` is the only consumer in the
// Mezzanine — the rest of the slice never reaches into these
// internals.

import type {ActivityState, InferredActivity} from './types';

function readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** Map an Anthropic subagent type to the activity its sprite should
 *  reflect. The Pixel Lab uses this for minion-sprite differentiation;
 *  the Mezzanine's Observer does not yet spawn minion sprites (one
 *  scientist = one sprite is Arc 2's contract), but the export survives
 *  for Arc 3 / future Task-spawn surfaces. */
export function subagentToActivity(subagentType: string): ActivityState {
    switch (subagentType) {
        case 'Explore':
            return 'reading';
        case 'Plan':
            return 'thinking';
        case 'Bash':
            return 'running';
        case 'general-purpose':
            return 'running';
        default:
            return 'thinking';
    }
}

interface ToolUseBlock {
    type: 'tool_use';
    name?: unknown;
    id?: unknown;
    input?: Record<string, unknown>;
}

function inferFromAssistantToolUse(block: ToolUseBlock): InferredActivity {
    const toolName = readString(block.name) ?? '';
    const toolUseId = readString(block.id);
    const input = block.input;
    const result = toolToActivity(toolName, input);

    // Detect Task spawn — extract subagent metadata.
    if (toolName.toLowerCase() === 'task' && input) {
        const subagentType = readString(input.subagent_type) ?? 'general-purpose';
        const description = readString(input.description) ?? 'Sub-agent task';
        return {...result, toolUseId, taskSpawn: {subagentType, description}};
    }

    return {...result, toolUseId};
}

function inferFromAssistantContent(content: ReadonlyArray<unknown>): InferredActivity | null {
    for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use') {
            return inferFromAssistantToolUse(b as unknown as ToolUseBlock);
        }
    }
    // Assistant text without tool use = thinking.
    for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && readString(b.text)) {
            return {activity: 'thinking', detail: 'Formulating hypothesis...'};
        }
    }
    return null;
}

function inferFromUserContent(content: ReadonlyArray<unknown>): InferredActivity | null {
    for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_result') {
            const toolUseId = readString(b.tool_use_id);
            return {activity: 'reading', detail: 'Analyzing results...', toolUseId, isToolResult: true};
        }
    }
    return null;
}

/** Map a JSONL turn entry to an inferred activity, or null when the
 *  entry has no activity signal. Pure — no side effects, no IO. */
export function inferActivity(entry: Record<string, unknown>): InferredActivity | null {
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) return null;

    const content = message.content;
    if (!Array.isArray(content)) return null;

    if (message.role === 'assistant') {
        return inferFromAssistantContent(content);
    }
    if (message.role === 'user') {
        return inferFromUserContent(content);
    }
    return null;
}

interface ToolMatcher {
    test: (lowered: string) => boolean;
    map: (input: Record<string, unknown> | undefined, original: string) => {activity: ActivityState; detail: string};
}

const EXACT_MATCHERS: ReadonlyArray<ToolMatcher> = [
    {test: (name) => name === 'todowrite', map: () => ({activity: 'writing', detail: 'Updating task list...'})},
    {
        test: (name) => name === 'webfetch' || name === 'websearch',
        map: () => ({activity: 'reading', detail: 'Researching the web...'}),
    },
    {test: (name) => name === 'skill', map: () => ({activity: 'running', detail: 'Activating skill protocol...'})},
];

const SUBSTRING_MATCHERS: ReadonlyArray<ToolMatcher> = [
    {
        test: (name) => name.includes('write') || name.includes('edit'),
        map: (input) => {
            const filePath = readString(input?.file_path) ?? readString(input?.notebook_path) ?? '';
            const shortPath = filePath ? (filePath.split(/[\\/]/).pop() ?? 'file') : 'file';
            return {activity: 'writing', detail: `Modifying ${shortPath}`};
        },
    },
    {
        test: (name) => name.includes('read') || name.includes('glob') || name.includes('grep'),
        map: () => ({activity: 'reading', detail: 'Scanning the laboratory...'}),
    },
    {
        test: (name) => name.includes('bash'),
        map: (input) => {
            const cmd = (readString(input?.command) ?? '').slice(0, 30);
            return {activity: 'running', detail: `Running: ${cmd}...`};
        },
    },
    {test: (name) => name.includes('task'), map: () => ({activity: 'thinking', detail: 'Dispatching a minion...'})},
    {
        test: (name) => name.includes('askuser') || name.includes('question'),
        map: () => ({activity: 'waiting', detail: 'Awaiting investor input...'}),
    },
];

/** Map a tool name + input shape to the activity its sprite should
 *  reflect. Lower-cased internally so callers can pass `Write`,
 *  `write`, or `WRITE` interchangeably. */
export function toolToActivity(
    toolName: string,
    input: Record<string, unknown> | undefined,
): {activity: ActivityState; detail: string} {
    const name = toolName.toLowerCase();

    // Specific tool matches first (before generic substring matches).
    for (const matcher of EXACT_MATCHERS) {
        if (matcher.test(name)) {
            return matcher.map(input, toolName);
        }
    }
    for (const matcher of SUBSTRING_MATCHERS) {
        if (matcher.test(name)) {
            return matcher.map(input, toolName);
        }
    }
    return {activity: 'thinking', detail: `Using ${toolName}...`};
}
