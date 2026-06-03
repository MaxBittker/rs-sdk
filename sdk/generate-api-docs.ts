#!/usr/bin/env bun
/**
 * Generate API documentation from SDK source files.
 * Extracts method signatures and JSDoc comments to create sdk/API.md
 *
 * Run: bun sdk/generate-api-docs.ts
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

interface MethodDoc {
    name: string;
    signature: string;
    params: { name: string; type: string; description?: string }[];
    returnType: string;
    description: string;
    isAsync: boolean;
}

interface TypeDoc {
    name: string;
    description: string;
    properties: { name: string; type: string; description?: string }[];
}

/**
 * Extract JSDoc comment above a position in the source
 */
function extractJSDoc(source: string, methodStart: number): string {
    // Look backwards from method start for JSDoc - but only if it's immediately before
    const before = source.slice(Math.max(0, methodStart - 2000), methodStart);

    // Find ALL JSDoc comments in the window and take the LAST one
    // This handles cases where multiple methods are close together
    const jsDocPattern = /\/\*\*([^]*?)\*\//g;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = jsDocPattern.exec(before)) !== null) {
        lastMatch = match;
    }

    if (!lastMatch) return '';

    // Verify this JSDoc is actually adjacent to the method (only whitespace between)
    const afterJsDoc = before.slice(lastMatch.index + lastMatch[0].length);
    if (!/^\s*$/.test(afterJsDoc)) {
        return ''; // There's non-whitespace between JSDoc and method
    }

    const content = lastMatch[1] || '';

    // Clean up: split by lines, remove asterisks, filter @tags, join
    const lines = content
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trim())
        .filter(line => line && !line.startsWith('@')); // Skip empty and @param, @returns etc

    // Take only the first sentence/line as description
    const description = lines.join(' ').trim();

    // Limit to first sentence (end at period followed by space or end)
    const firstSentence = description.match(/^[^.]+\.?/)?.[0] || description;

    // Truncate if still too long
    if (firstSentence.length > 100) {
        return firstSentence.slice(0, 97) + '...';
    }

    return firstSentence;
}

// Keywords and built-ins to skip
const SKIP_NAMES = new Set([
    'async', 'await', 'if', 'else', 'while', 'for', 'return', 'throw', 'try', 'catch',
    'new', 'function', 'class', 'interface', 'type', 'const', 'let', 'var',
    'RegExp', 'map', 'filter', 'find', 'reduce', 'forEach', 'some', 'every',
    'log', 'warn', 'error', 'console', 'JSON', 'Object', 'Array', 'String', 'Number',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Promise',
    'constructor', 'super', 'this', 'null', 'undefined', 'true', 'false'
]);

/**
 * Parse method signatures from a class
 */
function parseClassMethods(source: string, className: string): MethodDoc[] {
    const methods: MethodDoc[] = [];
    const seenNames = new Set<string>();

    // Match class method declarations with proper indentation (4 spaces or 1 tab at start)
    // Pattern: async? methodName(params): ReturnType {
    const methodRegex = /^[ \t]+(async\s+)?(\w+)\s*\(([^)]*)\)\s*:\s*([^{]+?)\s*\{/gm;

    let match;
    while ((match = methodRegex.exec(source)) !== null) {
        const [fullMatch, asyncKeyword, name, params, returnType] = match;

        // Skip if required groups didn't match (params may be empty for zero-arg methods)
        if (!name || params === undefined || !returnType) continue;

        // Skip private methods, constructor, keywords, and duplicates
        if (name.startsWith('_')) continue;
        if (SKIP_NAMES.has(name)) continue;
        if (seenNames.has(name)) continue;

        // Skip if name looks like it's from inside a function body (lowercase common patterns)
        if (/^(result|state|item|npc|loc|error|response|data|msg|opt)$/.test(name)) continue;

        seenNames.add(name);

        const description = extractJSDoc(source, match.index);
        const parsedParams = parseParams(params);
        const cleanReturn = returnType.trim();

        methods.push({
            name,
            signature: `${name}(${params.trim()}): ${cleanReturn}`,
            params: parsedParams,
            returnType: cleanReturn,
            description,
            isAsync: !!asyncKeyword
        });
    }

    return methods;
}

/**
 * Parse parameter string into structured params
 */
function parseParams(paramStr: string): { name: string; type: string; description?: string }[] {
    if (!paramStr.trim()) return [];

    const params: { name: string; type: string }[] = [];

    // Split by comma, but be careful of generic types like Map<string, number>
    let depth = 0;
    let current = '';

    for (const char of paramStr) {
        if (char === '<' || char === '(' || char === '{') depth++;
        else if (char === '>' || char === ')' || char === '}') depth--;
        else if (char === ',' && depth === 0) {
            if (current.trim()) params.push(parseParam(current.trim()));
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) params.push(parseParam(current.trim()));

    return params;
}

function parseParam(param: string): { name: string; type: string } {
    // Handle patterns like: name: type, name?: type, name = default
    const match = param.match(/^(\w+)(\??)\s*(?::\s*(.+?))?(?:\s*=\s*.+)?$/);
    if (!match) return { name: param, type: 'unknown' };

    const [, name, optional, type] = match;
    return {
        name: name + (optional || ''),
        type: type?.trim() || 'unknown'
    };
}

/**
 * Parse interface/type definitions
 */
function parseTypes(source: string): TypeDoc[] {
    const types: TypeDoc[] = [];

    // Match interface definitions
    const interfaceRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?export\s+interface\s+(\w+)\s*\{([^}]+)\}/g;

    let match;
    while ((match = interfaceRegex.exec(source)) !== null) {
        const [fullMatch, name, body] = match;
        if (!name || !body) continue;

        const description = extractJSDoc(source, match.index);

        const properties = parseInterfaceBody(body);

        types.push({ name, description, properties });
    }

    return types;
}

function parseInterfaceBody(body: string): { name: string; type: string; description?: string }[] {
    const props: { name: string; type: string; description?: string }[] = [];

    // Match property: type patterns, with optional JSDoc
    const lines = body.split('\n');
    let currentComment = '';

    for (const line of lines) {
        const trimmed = line.trim();

        // Capture single-line comments
        const commentMatch = trimmed.match(/^\/\*\*\s*(.+?)\s*\*\/$/);
        if (commentMatch && commentMatch[1]) {
            currentComment = commentMatch[1];
            continue;
        }

        // Match property definition
        const propMatch = trimmed.match(/^(\w+)(\??)\s*:\s*(.+?);?$/);
        if (propMatch) {
            const [, name, optional, type] = propMatch;
            if (!name || !type) continue;
            props.push({
                name: name + (optional || ''),
                type: type.replace(/;$/, ''),
                description: currentComment || undefined
            });
            currentComment = '';
        }
    }

    return props;
}

/**
 * Generate markdown from parsed docs
 */
function generateMarkdown(
    botActionsMethods: MethodDoc[],
    sdkMethods: MethodDoc[],
    resultTypes: TypeDoc[]
): string {
    const lines: string[] = [
        '# SDK API Reference',
        '',
        '> Auto-generated from source. Do not edit directly.',
        '> Run `bun sdk/generate-api-docs.ts` to regenerate.',
        '',
        '## BotActions (High-Level)',
        '',
        'These methods wait for the **effect to complete**, not just server acknowledgment.',
        ''
    ];

    // Group BotActions methods by category
    const categories: Record<string, MethodDoc[]> = {
        'UI & Dialog': [],
        'Movement': [],
        'Combat & Equipment': [],
        'Woodcutting & Firemaking': [],
        'Items & Inventory': [],
        'Doors': [],
        'NPC Interaction': [],
        'Shopping': [],
        'Banking': [],
        'Crafting & Smithing': [],
        'Condition Waiting': [],
        'Other': []
    };

    for (const method of botActionsMethods) {
        const name = method.name.toLowerCase();
        if (name.includes('dialog') || name.includes('blocking') || name.includes('tutorial')) {
            categories['UI & Dialog']!.push(method);
        } else if (name.includes('walk')) {
            categories['Movement']!.push(method);
        } else if (name.includes('attack') || name.includes('equip') || name.includes('eat') || name.includes('cast')) {
            categories['Combat & Equipment']!.push(method);
        } else if (name.includes('chop') || name.includes('burn')) {
            categories['Woodcutting & Firemaking']!.push(method);
        } else if (name.includes('pickup')) {
            categories['Items & Inventory']!.push(method);
        } else if (name.includes('door')) {
            categories['Doors']!.push(method);
        } else if (name.includes('talk')) {
            categories['NPC Interaction']!.push(method);
        } else if (name.includes('shop') || name.includes('buy') || name.includes('sell')) {
            categories['Shopping']!.push(method);
        } else if (name.includes('bank') || name.includes('deposit') || name.includes('withdraw')) {
            categories['Banking']!.push(method);
        } else if (name.includes('fletch') || name.includes('craft') || name.includes('smith')) {
            categories['Crafting & Smithing']!.push(method);
        } else if (name.includes('wait')) {
            categories['Condition Waiting']!.push(method);
        } else {
            categories['Other']!.push(method);
        }
    }

    for (const [category, methods] of Object.entries(categories)) {
        if (methods.length === 0) continue;

        lines.push(`### ${category}`, '');
        lines.push('| Method | Description |');
        lines.push('|--------|-------------|');

        for (const method of methods) {
            const sig = formatSignature(method);
            const desc = method.description || '_No description_';
            lines.push(`| \`${sig}\` | ${desc} |`);
        }
        lines.push('');
    }

    // SDK methods
    lines.push('---', '', '## BotSDK (Low-Level)', '');
    lines.push('These methods resolve when server **acknowledges** them (not when effects complete).', '');

    const sdkCategories: Record<string, MethodDoc[]> = {
        'State Access': [],
        'On-Demand Scanning': [],
        'Raw Actions': [],
        'Pathfinding': [],
        'Condition Waiting': [],
        'Connection': [],
        'Other': []
    };

    for (const method of sdkMethods) {
        const name = method.name.toLowerCase();
        if (name.startsWith('get') || name.startsWith('find') && !name.includes('path')) {
            sdkCategories['State Access']!.push(method);
        } else if (name.startsWith('scan')) {
            sdkCategories['On-Demand Scanning']!.push(method);
        } else if (name.startsWith('send')) {
            sdkCategories['Raw Actions']!.push(method);
        } else if (name.includes('path')) {
            sdkCategories['Pathfinding']!.push(method);
        } else if (name.includes('wait')) {
            sdkCategories['Condition Waiting']!.push(method);
        } else if (name.includes('connect') || name === 'isConnected' || name.includes('connection')) {
            sdkCategories['Connection']!.push(method);
        } else {
            sdkCategories['Other']!.push(method);
        }
    }

    for (const [category, methods] of Object.entries(sdkCategories)) {
        if (methods.length === 0) continue;

        lines.push(`### ${category}`, '');
        lines.push('| Method | Description |');
        lines.push('|--------|-------------|');

        for (const method of methods) {
            const sig = formatSignature(method);
            const desc = method.description || '_No description_';
            lines.push(`| \`${sig}\` | ${desc} |`);
        }
        lines.push('');
    }

    // Result types
    lines.push('---', '', '## Result Types', '');

    for (const type of resultTypes) {
        if (!type.name.endsWith('Result') && !type.name.endsWith('State')) continue;

        lines.push(`### ${type.name}`, '');
        if (type.description) lines.push(type.description, '');
        lines.push('```typescript');
        lines.push(`interface ${type.name} {`);
        for (const prop of type.properties) {
            const comment = prop.description ? ` // ${prop.description}` : '';
            lines.push(`  ${prop.name}: ${prop.type};${comment}`);
        }
        lines.push('}');
        lines.push('```', '');
    }

    return lines.join('\n');
}

function formatSignature(method: MethodDoc): string {
    // Compact format: methodName(param1, param2?)
    const params = method.params
        .map(p => p.name)
        .join(', ');
    return `${method.name}(${params})`;
}

async function main() {
    const sdkDir = import.meta.dir;

    // Read source files
    const actionsSource = await readFile(join(sdkDir, 'actions.ts'), 'utf-8');
    const indexSource = await readFile(join(sdkDir, 'index.ts'), 'utf-8');
    const typesSource = await readFile(join(sdkDir, 'types.ts'), 'utf-8');

    // Parse
    const botActionsMethods = parseClassMethods(actionsSource, 'BotActions');
    const sdkMethods = parseClassMethods(indexSource, 'BotSDK');
    const types = parseTypes(typesSource);

    // Generate markdown
    const markdown = generateMarkdown(botActionsMethods, sdkMethods, types);

    // Write output
    const outputPath = join(sdkDir, 'API.md');
    await writeFile(outputPath, markdown);

    console.log(`Generated ${outputPath}`);
    console.log(`  - ${botActionsMethods.length} BotActions methods`);
    console.log(`  - ${sdkMethods.length} BotSDK methods`);
    console.log(`  - ${types.filter(t => t.name.endsWith('Result') || t.name.endsWith('State')).length} result types`);
}

main().catch(console.error);
