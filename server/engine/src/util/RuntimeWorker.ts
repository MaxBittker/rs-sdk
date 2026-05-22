import { Worker, type WorkerOptions } from 'worker_threads';

import Environment from '#/util/Environment.js';

const NODE_WORKER_BOOTSTRAP = new URL('./RuntimeWorkerNode.mjs', import.meta.url);

export function createRuntimeWorker(specifier: string | URL, options: WorkerOptions = {}): Worker {
    if (Environment.runtime.isBun) {
        return new Worker(specifier, options);
    }

    return new Worker(NODE_WORKER_BOOTSTRAP, {
        ...options,
        workerData: {
            ...(options.workerData && typeof options.workerData === 'object' ? options.workerData : {}),
            __ts_worker_filename: typeof specifier === 'string' ? specifier : specifier.href
        }
    });
}
