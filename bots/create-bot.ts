#!/usr/bin/env bun
import { cp, readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function replaceInFile(filePath: string, replacements: Record<string, string>) {
    let content = await readFile(filePath, 'utf-8');
    for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(key, value);
    }
    await writeFile(filePath, content);
}

async function createBot(username?: string, serverOverride?: string, hideChat?: boolean) {
    // Generate username if not provided
    const botUsername = username || generateRandomString(9);

    // Validate username
    if (botUsername.length > 12) {
        console.error('Error: Username must be 12 characters or less');
        process.exit(1);
    }

    if (!/^[a-zA-Z0-9]+$/.test(botUsername)) {
        console.error('Error: Username must be alphanumeric');
        process.exit(1);
    }

    const templateDir = join(process.cwd(), 'bots', '_template');
    const botDir = join(process.cwd(), 'bots', botUsername);

    // Check if template exists
    if (!existsSync(templateDir)) {
        console.error(`Error: Template directory not found at ${templateDir}`);
        process.exit(1);
    }

    // Check if bot already exists
    if (existsSync(botDir)) {
        console.error(`Error: Bot directory already exists at ${botDir}`);
        process.exit(1);
    }

    // Copy template directory
    await cp(templateDir, botDir, { recursive: true });
    console.log(`Created bot directory: ${botDir}`);

    // Generate random password
    const password = generateRandomString(12);

    // Replace placeholders in all files
    const replacements = {
        '{{USERNAME}}': botUsername,
        '{{PASSWORD}}': password,
    };

    const files = await readdir(botDir);
    for (const file of files) {
        const filePath = join(botDir, file);
        await replaceInFile(filePath, replacements);
        console.log(`Created ${file}`);
    }

    const envPath = join(botDir, 'bot.env');

    // Override server if --local or --server= was passed
    if (serverOverride) {
        await replaceInFile(envPath, { 'rs-sdk-demo.fly.dev': serverOverride });
        console.log(`Server set to: ${serverOverride}`);
    }

    // Public chat is shown by default; disable it with --no-chat / --hide-chat
    if (hideChat) {
        await replaceInFile(envPath, { 'SHOW_CHAT=true': 'SHOW_CHAT=false' });
        console.log(`Public chat: disabled`);
    } else {
        console.log(`Public chat: enabled (default)`);
    }

    console.log(`\n✓ Bot "${botUsername}" created successfully!`);
    console.log(`\nCredentials saved in bots/${botUsername}/bot.env`);
    console.log(`\nTo get started:`);
    console.log(`  bun bots/${botUsername}/script.ts`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const positional: string[] = [];
let serverOverride: string | undefined;
let hideChat = false;

for (const arg of args) {
    if (arg === '--local') {
        serverOverride = 'localhost';
    } else if (arg.startsWith('--server=')) {
        serverOverride = arg.slice('--server='.length);
    } else if (arg === '--no-chat' || arg === '--hide-chat') {
        hideChat = true;
    } else if (arg === '--show-chat') {
        // Public chat is now on by default; accepted as a no-op for back-compat.
    } else {
        positional.push(arg);
    }
}

createBot(positional[0], serverOverride, hideChat).catch(console.error);
