import kleur from 'kleur';

import Environment from '#/util/Environment.js';

export function printDebug(message: string) {
    const now = new Date();

    // todo: print based on env variable
    console.log(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.cyan('DEBUG\t'), message);
}

export function printInfo(message: string) {
    const now = new Date();

    console.log(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.green('INFO\t'), message);
}

export function printError(message: string | Error) {
    const now = new Date();

    if (message instanceof Error) {
        console.error(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.red('ERROR\t'), message.message);

        if (Environment.build.verbose) {
            console.error(message.stack);
        }
    } else {
        console.error(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.red('ERROR\t'), message);
    }
}

export function printFatalError(message: string | Error) {
    const now = new Date();

    if (message instanceof Error) {
        console.error(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.red('ERROR\t'), message.message);

        if (Environment.build.verbose) {
            console.error(message.stack);
        }
    } else {
        console.error(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.red('ERROR\t'), message);
    }

    process.exit(1);
}

export function printWarning(message: string) {
    const now = new Date();

    console.log(kleur.magenta(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}\t`), kleur.yellow('WARN\t'), message);
}
