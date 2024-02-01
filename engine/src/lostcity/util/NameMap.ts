import fs from 'fs';

export function loadOrder(path: string) {
    if (!fs.existsSync(path)) {
        return [];
    }

    return fs
        .readFileSync(path, 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x)
        .map(x => parseInt(x));
}

// TODO (jkm) use Record<..> here rather than string-typed arrays

export function loadPack(path: string) {
    if (!fs.existsSync(path)) {
        return [] as string[];
    }

    return fs
        .readFileSync(path, 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x)
        .reduce((acc, x) => {
            const [id, name] = x.split('=');
            acc[id as unknown as number] = name;
            return acc;
        }, [] as string[]);
}

export function loadDir(path: string, extension: string, callback: (src: string[], file: string, path: string) => void) {
    const files = fs.readdirSync(path);

    for (const file of files) {
        if (fs.statSync(`${path}/${file}`).isDirectory()) {
            loadDir(`${path}/${file}`, extension, callback);
        } else if (file.endsWith(extension)) {
            callback(
                fs
                    .readFileSync(`${path}/${file}`, 'ascii')
                    .replace(/\r/g, '')
                    .split('\n')
                    .filter(x => x),
                file,
                path
            );
        }
    }
}

export function listFiles(path: string, out: string[] = []) {
    const files = fs.readdirSync(path);

    for (const file of files) {
        if (fs.statSync(`${path}/${file}`).isDirectory()) {
            listFiles(`${path}/${file}`, out);
        } else {
            out.push(`${path}/${file}`);
        }
    }

    return out;
}
