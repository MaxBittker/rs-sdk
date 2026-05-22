export default class Database {
    private readonly db: IDBDatabase;

    constructor(db: IDBDatabase) {
        db.onerror = this.onerror;
        db.onclose = this.onclose;
        this.db = db;
    }

    static async openDatabase(): Promise<IDBDatabase> {
        return await new Promise<IDBDatabase>((resolve, reject): void => {
            const request: IDBOpenDBRequest = indexedDB.open('lostcity', 1);

            request.onsuccess = (event: Event): void => {
                const target: IDBOpenDBRequest = event.target as IDBOpenDBRequest;
                resolve(target.result);
            };

            request.onupgradeneeded = (event: Event): void => {
                const target: IDBOpenDBRequest = event.target as IDBOpenDBRequest;
                target.result.createObjectStore('cache');
            };

            request.onerror = (event: Event): void => {
                const target: IDBOpenDBRequest = event.target as IDBOpenDBRequest;
                reject(target.result);
            };
        });
    }

    async read(archive: number, file: number) {
        return await new Promise<Uint8Array | undefined>((resolve): void => {
            const transaction: IDBTransaction = this.db.transaction('cache', 'readonly');
            const store: IDBObjectStore = transaction.objectStore('cache');
            const request: IDBRequest<Uint8Array | Int8Array | ArrayBuffer> = store.get(`${archive}.${file}`);

            request.onsuccess = (): void => {
                if (request.result) {
                    resolve(Database.asUint8Array(request.result));
                } else {
                    // IDB will call onsuccess with "undefined" if key does not exist
                    resolve(undefined);
                }
            };

            request.onerror = (): void => {
                resolve(undefined);
            };
        });
    }

    async cacheload(name: string) {
        return await new Promise<Uint8Array | undefined>((resolve): void => {
            const transaction: IDBTransaction = this.db.transaction('cache', 'readonly');
            const store: IDBObjectStore = transaction.objectStore('cache');
            const request: IDBRequest<Uint8Array | Int8Array | ArrayBuffer> = store.get(name);

            request.onsuccess = (): void => {
                if (request.result) {
                    resolve(Database.asUint8Array(request.result));
                } else {
                    // IDB will call onsuccess with "undefined" if key does not exist
                    resolve(undefined);
                }
            };

            request.onerror = (): void => {
                resolve(undefined);
            };
        });
    }

    async write(archive: number, file: number, src: Uint8Array | Int8Array | null) {
        if (src === null) {
            return;
        }

        return await new Promise<void>((resolve, _reject): void => {
            const transaction: IDBTransaction = this.db.transaction('cache', 'readwrite');
            const store: IDBObjectStore = transaction.objectStore('cache');
            const request: IDBRequest<IDBValidKey> = store.put(src, `${archive}.${file}`);

            request.onsuccess = (): void => {
                resolve();
            };

            request.onerror = (): void => {
                // not too worried if it doesn't save, it'll redownload later
                resolve();
            };
        });
    }

    async cachesave(name: string, src: Uint8Array | Int8Array | null) {
        if (src === null) {
            return;
        }

        return await new Promise<void>((resolve, _reject): void => {
            const transaction: IDBTransaction = this.db.transaction('cache', 'readwrite');
            const store: IDBObjectStore = transaction.objectStore('cache');
            const request: IDBRequest<IDBValidKey> = store.put(src, name);

            request.onsuccess = (): void => {
                resolve();
            };

            request.onerror = (): void => {
                // not too worried if it doesn't save, it'll redownload later
                resolve();
            };
        });
    }

    private onclose = (_event: Event): void => {};

    private onerror = (_event: Event): void => {};

    private static asUint8Array(src: Uint8Array | Int8Array | ArrayBuffer): Uint8Array {
        if (src instanceof Uint8Array) {
            return src;
        }

        return src instanceof Int8Array ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength) : new Uint8Array(src);
    }
}
