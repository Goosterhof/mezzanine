// activityInference — port of the Pixel Lab's 43 dedicated test cases.
// The cases mirror the upstream verbatim (the inference logic is
// near-direct, see src/observer/activityInference.ts). The Node `path`
// import was stripped during the port; the basename-extraction test
// below guards against `path.basename` ever reappearing.

import {describe, it, expect} from 'vitest';

import {inferActivity, subagentToActivity, toolToActivity} from '../../src/observer/activityInference';

describe('toolToActivity', () => {
    it('maps Write tool to writing activity', () => {
        const result = toolToActivity('Write', {file_path: '/src/app.ts'});
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Modifying app.ts');
    });

    it('maps Edit tool to writing activity', () => {
        const result = toolToActivity('Edit', {file_path: '/home/user/project/index.js'});
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Modifying index.js');
    });

    it('maps NotebookEdit tool to writing activity', () => {
        const result = toolToActivity('NotebookEdit', {file_path: '/notebooks/analysis.ipynb'});
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Modifying analysis.ipynb');
    });

    it('handles Write tool without file_path', () => {
        const result = toolToActivity('Write', {});
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Modifying file');
    });

    it('maps Read tool to reading activity', () => {
        const result = toolToActivity('Read', {file_path: '/src/app.ts'});
        expect(result.activity).toBe('reading');
        expect(result.detail).toBe('Scanning the laboratory...');
    });

    it('maps Glob tool to reading activity', () => {
        expect(toolToActivity('Glob', {pattern: '**/*.ts'}).activity).toBe('reading');
    });

    it('maps Grep tool to reading activity', () => {
        expect(toolToActivity('Grep', {pattern: 'TODO'}).activity).toBe('reading');
    });

    it('maps Bash tool to running activity', () => {
        const result = toolToActivity('Bash', {command: 'npm run test'});
        expect(result.activity).toBe('running');
        expect(result.detail).toBe('Running: npm run test...');
    });

    it('truncates long Bash commands to 30 chars', () => {
        const longCmd = 'npm run build && npm run test && npm run lint && npm run deploy';
        const result = toolToActivity('Bash', {command: longCmd});
        expect(result.activity).toBe('running');
        expect(result.detail.length).toBeLessThanOrEqual('Running: ...'.length + 30);
    });

    it('maps Task tool to thinking activity', () => {
        const result = toolToActivity('Task', {});
        expect(result.activity).toBe('thinking');
        expect(result.detail).toBe('Dispatching a minion...');
    });

    it('maps AskUserQuestion to waiting activity', () => {
        const result = toolToActivity('AskUserQuestion', {});
        expect(result.activity).toBe('waiting');
        expect(result.detail).toBe('Awaiting investor input...');
    });

    it('maps unknown tools to thinking activity', () => {
        const result = toolToActivity('SomeUnknownTool', {});
        expect(result.activity).toBe('thinking');
        expect(result.detail).toBe('Using SomeUnknownTool...');
    });

    it('is case-insensitive for tool names', () => {
        expect(toolToActivity('BASH', {command: 'ls'}).activity).toBe('running');
        expect(toolToActivity('read', {}).activity).toBe('reading');
        expect(toolToActivity('WRITE', {}).activity).toBe('writing');
    });

    it('maps NotebookEdit with notebook_path to writing with filename', () => {
        const result = toolToActivity('NotebookEdit', {notebook_path: '/notebooks/analysis.ipynb'});
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Modifying analysis.ipynb');
    });

    it('maps TodoWrite to writing activity', () => {
        const result = toolToActivity('TodoWrite', {});
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Updating task list...');
    });

    it('maps WebFetch to reading activity', () => {
        const result = toolToActivity('WebFetch', {});
        expect(result.activity).toBe('reading');
        expect(result.detail).toBe('Researching the web...');
    });

    it('maps WebSearch to reading activity', () => {
        const result = toolToActivity('WebSearch', {});
        expect(result.activity).toBe('reading');
        expect(result.detail).toBe('Researching the web...');
    });

    it('maps Skill to running activity', () => {
        const result = toolToActivity('Skill', {});
        expect(result.activity).toBe('running');
        expect(result.detail).toBe('Activating skill protocol...');
    });

    it('handles undefined input gracefully', () => {
        const result = toolToActivity('Write', undefined);
        expect(result.activity).toBe('writing');
        expect(result.detail).toBe('Modifying file');
    });

    it('handles Bash with undefined input gracefully', () => {
        const result = toolToActivity('Bash', undefined);
        expect(result.activity).toBe('running');
        expect(result.detail).toBe('Running: ...');
    });

    it('extracts basename from Windows-style paths without path.basename', () => {
        // Guard against `import * as path from "path"` returning as a
        // regression. The port replaced path.basename with a regex
        // splitter — this case fails if the Node import sneaks back.
        const result = toolToActivity('Write', {file_path: 'C:\\Users\\me\\src\\main.ts'});
        expect(result.detail).toBe('Modifying main.ts');
    });
});

describe('inferActivity', () => {
    it('returns null for entries without a message', () => {
        expect(inferActivity({})).toBeNull();
        expect(inferActivity({type: 'system'})).toBeNull();
    });

    it('returns null for entries with empty message', () => {
        expect(inferActivity({message: {}})).toBeNull();
    });

    it('detects tool_use in assistant messages', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [{type: 'tool_use', name: 'Write', input: {file_path: '/src/main.ts'}}],
            },
        };
        const result = inferActivity(entry);
        expect(result).not.toBeNull();
        expect(result!.activity).toBe('writing');
        expect(result!.detail).toBe('Modifying main.ts');
    });

    it('detects thinking from assistant text without tool_use', () => {
        const entry = {message: {role: 'assistant', content: [{type: 'text', text: 'Let me analyze this...'}]}};
        const result = inferActivity(entry);
        expect(result).not.toBeNull();
        expect(result!.activity).toBe('thinking');
    });

    it('ignores assistant messages with empty text', () => {
        const entry = {message: {role: 'assistant', content: [{type: 'text', text: ''}]}};
        expect(inferActivity(entry)).toBeNull();
    });

    it('detects tool_result in user messages as reading', () => {
        const entry = {
            message: {role: 'user', content: [{type: 'tool_result', tool_use_id: '123', content: 'file contents'}]},
        };
        const result = inferActivity(entry);
        expect(result).not.toBeNull();
        expect(result!.activity).toBe('reading');
        expect(result!.detail).toBe('Analyzing results...');
    });

    it('returns null for user messages without tool_result', () => {
        const entry = {message: {role: 'user', content: [{type: 'text', text: 'Hello'}]}};
        expect(inferActivity(entry)).toBeNull();
    });

    it('prioritizes tool_use over text in mixed content', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [
                    {type: 'text', text: "I'll read the file now."},
                    {type: 'tool_use', name: 'Read', input: {file_path: '/a.ts'}},
                ],
            },
        };
        const result = inferActivity(entry);
        expect(result).not.toBeNull();
        expect(result!.activity).toBe('reading');
    });

    it('handles non-array content gracefully', () => {
        expect(inferActivity({message: {role: 'assistant', content: 'just a string'}})).toBeNull();
    });

    it('uses the first tool_use when multiple are present', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [
                    {type: 'tool_use', name: 'Read', input: {}},
                    {type: 'tool_use', name: 'Write', input: {file_path: '/a.ts'}},
                ],
            },
        };
        const result = inferActivity(entry);
        expect(result).not.toBeNull();
        expect(result!.activity).toBe('reading');
    });

    it('returns null for assistant messages with only non-text non-tool blocks', () => {
        const entry = {message: {role: 'assistant', content: [{type: 'image', source: '...'}]}};
        expect(inferActivity(entry)).toBeNull();
    });

    it('returns toolUseId from tool_use blocks', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [{type: 'tool_use', id: 'toolu_abc', name: 'Write', input: {file_path: '/src/main.ts'}}],
            },
        };
        const result = inferActivity(entry);
        expect(result!.toolUseId).toBe('toolu_abc');
    });

    it('returns toolUseId and isToolResult from tool_result blocks', () => {
        const entry = {
            message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'toolu_xyz', content: 'file'}]},
        };
        const result = inferActivity(entry);
        expect(result!.toolUseId).toBe('toolu_xyz');
        expect(result!.isToolResult).toBe(true);
    });

    it('does not return isToolResult for tool_use blocks', () => {
        const entry = {
            message: {role: 'assistant', content: [{type: 'tool_use', id: 'toolu_abc', name: 'Read', input: {}}]},
        };
        expect(inferActivity(entry)!.isToolResult).toBeUndefined();
    });

    it('handles tool_use without id field gracefully', () => {
        const entry = {message: {role: 'assistant', content: [{type: 'tool_use', name: 'Read', input: {}}]}};
        const result = inferActivity(entry);
        expect(result!.toolUseId).toBeUndefined();
        expect(result!.activity).toBe('reading');
    });

    it('returns taskSpawn for Task tool_use', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [
                    {
                        type: 'tool_use',
                        id: 'toolu_abc',
                        name: 'Task',
                        input: {subagent_type: 'Explore', description: 'Explore OCR system', prompt: '...'},
                    },
                ],
            },
        };
        const result = inferActivity(entry);
        expect(result!.taskSpawn).toStrictEqual({subagentType: 'Explore', description: 'Explore OCR system'});
        expect(result!.activity).toBe('thinking');
    });

    it('defaults subagentType to general-purpose when missing', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [{type: 'tool_use', id: 'toolu_def', name: 'Task', input: {prompt: 'do something'}}],
            },
        };
        const result = inferActivity(entry);
        expect(result!.taskSpawn!.subagentType).toBe('general-purpose');
        expect(result!.taskSpawn!.description).toBe('Sub-agent task');
    });

    it('does NOT return taskSpawn for non-Task tools', () => {
        const entry = {
            message: {
                role: 'assistant',
                content: [{type: 'tool_use', id: 'toolu_xyz', name: 'Bash', input: {command: 'ls'}}],
            },
        };
        expect(inferActivity(entry)!.taskSpawn).toBeUndefined();
    });
});

describe('subagentToActivity', () => {
    it('maps Explore to reading', () => {
        expect(subagentToActivity('Explore')).toBe('reading');
    });

    it('maps Plan to thinking', () => {
        expect(subagentToActivity('Plan')).toBe('thinking');
    });

    it('maps general-purpose to running', () => {
        expect(subagentToActivity('general-purpose')).toBe('running');
    });

    it('maps Bash to running', () => {
        expect(subagentToActivity('Bash')).toBe('running');
    });

    it('defaults unknown types to thinking', () => {
        expect(subagentToActivity('CustomAgent')).toBe('thinking');
    });
});
