#!/usr/bin/env bun

import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

const root = join(import.meta.dir, '..', '..');

describe('agent documentation snippets', () => {
    test('learnings use execute_code globals consistently', async () => {
        const learningDir = join(root, 'learnings');
        const files = (await readdir(learningDir)).filter(file => file.endsWith('.md'));
        for (const file of files) {
            const markdown = await readFile(join(learningDir, file), 'utf8');
            expect(markdown).not.toContain('ctx.bot');
            expect(markdown).not.toContain('ctx.sdk');
            expect(markdown).not.toMatch(/\bstate\.combat\b/);
            expect(markdown).not.toMatch(/\bfunction\s+\w+\([^)]*:\s*\w+/);
        }
    });

    test('TypeScript fences are syntactically valid', async () => {
        const learningDir = join(root, 'learnings');
        const files = (await readdir(learningDir)).filter(file => file.endsWith('.md'));

        for (const file of files) {
            const markdown = await readFile(join(learningDir, file), 'utf8');
            const snippets = [...markdown.matchAll(/```(?:typescript|ts)\s*\n([\s\S]*?)```/g)];
            for (const [index, match] of snippets.entries()) {
                const snippet = (match[1] ?? '').replace(/\{\s*\.\.\.\s*\}/g, '{}');
                if (/^\s*import\s/m.test(snippet)) continue;
                const result = ts.transpileModule(`async function snippet() {\n${snippet}\n}`, {
                    fileName: `${file}#${index + 1}.ts`,
                    reportDiagnostics: true,
                    compilerOptions: {
                        target: ts.ScriptTarget.ESNext,
                        module: ts.ModuleKind.ESNext,
                    },
                });
                const errors = (result.diagnostics ?? []).filter(
                    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
                );
                if (errors.length > 0) {
                    const messages = errors.map(error =>
                        ts.flattenDiagnosticMessageText(error.messageText, '\n')
                    ).join('; ');
                    throw new Error(`${file} snippet ${index + 1}: ${messages}`);
                }
            }
        }
    });
});
