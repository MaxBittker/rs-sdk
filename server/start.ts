import child_process from 'child_process';
import fs from 'fs';

import { ExitPromptError } from '@inquirer/core';
import { confirm, input, number, password, select } from '@inquirer/prompts';

// Ensure all relative paths resolve from this script's directory,
// regardless of where it's invoked from (e.g. `bun server/start.ts`).
process.chdir(import.meta.dir);

// if you're forking this feel free to change these :) it does make some assumptions elsewhere (branch names)
const repoOrg = 'https://github.com/LostCityRS';
const engineRepo = 'Engine-TS';
const contentRepo = 'Content';
const webRepo = 'Client-TS';
const javaRepo = 'Client-Java';

function cloneRepo(repo: string, dir: string, branch: string) {
    child_process.execSync(`git clone ${repoOrg}/${repo} --single-branch -b ${branch} ${dir}`, {
        stdio: 'inherit'
    });
}

function updateRepo(cwd: string) {
    child_process.execSync('git pull', {
        stdio: 'inherit',
        cwd
    });
}

async function runOnOs(url: string) {
    try {
        const open = (await import('open')).default;
        await open(url);
    } catch (e) {
        console.warn(`Could not open browser automatically.`);
        console.warn(`Open this URL manually: ${url}`);
    }
}

let config = {
    rev: 'unset'
};

type RevInfo = {
    description: string;
    webclient?: boolean;
    wip?: boolean;
}

const revInfo: Record<string, RevInfo> = {
    '225': {
        description: 'May 18, 2004',
        webclient: true
    },
    '244': {
        description: 'June 28, 2004',
        webclient: true
    },
    '245.2': {
        description: 'July 13, 2004 (there were 3 "245" builds!)',
        webclient: true
    },
    '254': {
        description: 'September 7, 2004',
        webclient: true
    },
    '274': {
        description: 'November 2, 2004',
        wip: true
    }
};

let running = true;
async function main() {
    if (!fs.existsSync('server.json')) {
        await promptConfig();
    }

    config = JSON.parse(fs.readFileSync('server.json', 'utf8'));

    if (!fs.existsSync('engine')) {
        cloneRepo(engineRepo, 'engine', config.rev);
    }

    if (!fs.existsSync('content')) {
        cloneRepo(contentRepo, 'content', config.rev);
    }

    if (revInfo[config.rev]?.webclient && !fs.existsSync('webclient')) {
        cloneRepo(webRepo, 'webclient', config.rev);
    }

    if (!fs.existsSync('javaclient')) {
        cloneRepo(javaRepo, 'javaclient', config.rev);
    }

    if (!fs.existsSync('engine/.env')) {
        child_process.spawnSync('bun install', {
            shell: true,
            stdio: 'inherit',
            cwd: 'engine'
        });

        child_process.spawnSync('bun run setup', {
            shell: true,
            stdio: 'inherit',
            cwd: 'engine'
        });
    }

    const choice = await select({
        message: 'What would you like to do?',
        choices: [{
            name: 'Start Server',
            description: 'Starts the server normally',
            value: 'start'
        }, {
            name: 'Update Source',
            description: 'Pull the latest commits for all subprojects',
            value: 'update'
        }, {
            name: 'Run Web Client',
            description: 'Opens your browser to play using the modern web client (TypeScript)',
            value: 'web'
        }, {
            name: 'Run Java Client',
            description: 'Opens the legacy Java applet to play using the original client',
            value: 'java'
        }, {
            name: 'Advanced Options',
            description: 'View more options',
            value: 'advanced'
        }, {
            name: 'Quit',
            description: '',
            value: 'quit'
        }]
    }, { clearPromptOnDone: true });

    if (choice === 'start') {
        child_process.execSync('bun start', {
            stdio: 'inherit',
            cwd: 'engine'
        });
    } else if (choice === 'update') {
        updateRepo('engine');
        updateRepo('content');
        updateRepo('webclient');
        updateRepo('javaclient');
    } else if (choice === 'web') {
        if (!revInfo[config.rev]?.webclient) {
            console.log('This version does not have a webclient available (yet?), sorry.');
        } else {
            const port = (process.platform === 'win32' || process.platform === 'darwin') ? '' : ':8888';
            await runOnOs(`http://localhost${port}/rs2.cgi`);
        }
    } else if (choice === 'java') {
        const command = process.platform === 'win32' ? 'gradlew' : './gradlew';
        if (config.rev === '225') {
            child_process.execSync(`${command} run --args="10 0 highmem members"`, {
                stdio: 'inherit',
                cwd: 'javaclient'
            });
        } else {
            child_process.execSync(`${command} run --args="10 0 highmem members 32"`, {
                stdio: 'inherit',
                cwd: 'javaclient'
            });
        }
    } else if (choice === 'advanced') {
        await promptAdvanced();
    } else if (choice === 'quit') {
        running = false;
    }
}

async function promptConfig() {
    const orderedRevs = Object.entries(revInfo);
    orderedRevs.sort((a, b) => parseInt(a[0]) - parseInt(b[0])); // descending revs
    orderedRevs.sort((a, b) => a[1].wip ? 1 : -1); // wip last

    let choices = [];
    for (const [rev, info] of orderedRevs) {
        choices.push({
            name: info.wip ? `${rev} (WIP)` : rev,
            value: rev,
            description: info.description
        });
    }

    const rev = await select({
        message: 'What version are you interested in?',
        choices
    }, { clearPromptOnDone: true });

    config.rev = rev;

    fs.writeFileSync('server.json', JSON.stringify(config, null, 2));
}

async function promptAdvanced() {
    const choice = await select({
        message: 'What would you like to do?',
        choices: [{
            name: 'Start Server (engine dev)',
            description: 'Starts the server and watches for .ts file changes to reload',
            value: 'start-dev'
        }, {
        // todo:
        //     name: 'Reconfigure Server',
        //     description: 'Edit the environment config for the server',
        //     value: 'configure'
        // }, {
            name: 'Clean-build Server',
            description: '',
            value: 'clean-build'
        }, {
            name: 'Build Web Client',
            description: '',
            value: 'build-web'
        }, {
            name: 'Build Java Client',
            description: '',
            value: 'build-java'
        }, {
            name: 'Change Version',
            description: '',
            value: 'change-version'
        }, {
            name: 'Back',
            description: 'Go back',
            value: 'back'
        }]
    }, { clearPromptOnDone: true });

    if (choice === 'start-dev') {
        child_process.execSync('bun run dev', {
            stdio: 'inherit',
            cwd: 'engine'
        });
    } else if (choice === 'configure') {
        // todo: has issues with input appearing right now
        child_process.spawnSync('bun run setup', {
            shell: true,
            stdio: 'inherit',
            cwd: 'engine'
        });
    } else if (choice === 'clean-build') {
        child_process.execSync('bun run clean', {
            stdio: 'inherit',
            cwd: 'engine'
        });

        child_process.execSync('bun run build', {
            stdio: 'inherit',
            cwd: 'engine'
        });
    } else if (choice === 'build-web') {
        child_process.execSync('bun run build', {
            stdio: 'inherit',
            cwd: 'webclient'
        });
    } else if (choice === 'build-java') {
        const command = process.platform === 'win32' ? 'gradlew' : './gradlew';
        child_process.execSync(`${command} build`, {
            stdio: 'inherit',
            cwd: 'javaclient'
        });
    } else if (choice === 'change-version') {
        await promptConfig();

        fs.rmSync('engine', { recursive: true, force: true });
        fs.rmSync('content', { recursive: true, force: true });
        fs.rmSync('webclient', { recursive: true, force: true });
        fs.rmSync('javaclient', { recursive: true, force: true });
    }
}

try {
    while (running) {
        await main();
    }
} catch (e) {
    if (e instanceof ExitPromptError) {
        process.exit(0);
    } else if (e instanceof Error) {
        if (e.message.startsWith('Command failed:')) {
            process.exit(0);
        }

        console.log(e.message);
    }
}
