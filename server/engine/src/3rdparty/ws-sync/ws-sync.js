// thank you: https://github.com/Puvox/synchronous-websocket-request-js

// this was edited slightly from the source, but since it's unlicensed, we may revisit this to
// rewrite it using the same idea (pass a message request ID and await a response)

import { webcrypto as crypto } from 'crypto';

export default class WsSyncReq {
    waitedSyncCallbacks = {};
    waiterPrefix = 'id';
    loopPauseWaitIntervalMS = 500;

    wsc = null;

    constructor (ws_connection) {
        this.wsc = ws_connection;
        this.wsc.on('message', (payload)=>{
            this.receivedMessage(payload);
        })
    }

    // some random UUID like generator
    uuidv4() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    sleep(ms) {
        return new Promise(resolve => this.setTimeout_safe(resolve, ms));
    }

    // immitating ccxt's setTimeout
    setTimeout_safe (done, ms) {
        const self = this; const targetTime = Date.now() + ms; if (ms >= 2147483647) { throw new Error ('setTimeout() function was called with unrealistic value of ' + ms.toString ()); }  let clearInnerTimeout = () => {}; let active = true; const id = setTimeout (() => { active = true; const rest = targetTime - Date.now (); if (rest > 0) { clearInnerTimeout = self.setTimeout_safe (done, rest, setTimeout, targetTime); } else { done (); } }, ms); return function clear () { if (active) { active = false; clearTimeout (id); } clearInnerTimeout (); };
    }

    // https://stackoverflow.com/a/44782052/2377343
    cloneObjectDestructuve(orig){
        return Object.assign(Object.create(Object.getPrototypeOf(orig)), orig);
    }

    isString(x) { return Object.prototype.toString.call(x) === '[object String]'; }
	isInteger(x) { return Number.isInteger(x); }
	isObject(variable){ return typeof variable === 'object' && variable !== null; }
    isKeyType(x) { return this.isString(x) || this.isInteger(x); }

    send(data) {
        if (!this.checkIfWsLive()) return false;
        this.wsc.send(JSON.stringify(data));
        return true;
    }

    checkIfWsLive() {
        return this.wsc !== null && this.wsc.readyState === 1;
    }

    keyOfRequestId = 'replyTo';
    keyOfResponseId = 'replyTo';

    async fetchSync(dataToSend = {}, timeoutMs = 10000, expectedObjectStructure = null, callbackOnIncoming = null) {
        const uniqueId = this.waiterPrefix + '_' + this.uuidv4();
        if (uniqueId in this.waitedSyncCallbacks) {
            throw new Error('ws-sync fetch - uniqueId already exists: ' + uniqueId);
        }

        let expectedObj = null;
        if (expectedObjectStructure === null) {
            expectedObj = {
                [this.keyOfResponseId] : uniqueId
            };
        } else if (this.isObject(expectedObjectStructure)) {
            expectedObj = expectedObjectStructure;
            if ('includeUniqueKey' in expectedObj) {
                if (expectedObj.includeUniqueKey) {
                    expectedObj[this.keyOfResponseId] = uniqueId;
                }
                delete expectedObj.includeUniqueKey;
            }
        } else {
            throw new Error('ws-sync fetch - expectedObjectStructure argument must be "null" or an object');
        }

        this.waitedSyncCallbacks[uniqueId] = {
            'result': null,
            'onIncomingCallback': callbackOnIncoming,
            'expectedObject': expectedObj,
        };
        try {
            const data_new = this.cloneObjectDestructuve (dataToSend);
            data_new[this.keyOfRequestId] = uniqueId;

            if (this.send(data_new)) {
                let start = Date.now();
                while (true) {
                    if (!this.checkIfWsLive()) {
                        return { error : 'ws-sync - connection lost: ' + uniqueId, result:null};
                    } else if ((Date.now() - start) > timeoutMs) {
                        return { error : 'ws-sync - exceeded timeout: ' + uniqueId, result:null};
                    } else {
                        await this.sleep(this.loopPauseWaitIntervalMS);
                        if (uniqueId in this.waitedSyncCallbacks) {
                            const value = this.waitedSyncCallbacks[uniqueId];
                            if (value['result'] != null) {
                                return { error: null, result: value['result'] };
                            }
                        } else {
                            var msg = 'ws-sync - unexpected exception, this should not be happen... the unique id does not exist: ' + uniqueId;
                            return { error : msg, result:null };
                        }
                    }
                }
            } else {
                return { error : 'ws-sync - failed to send request. Socket may be disconnected', result:null };
            }
        } finally {
            delete this.waitedSyncCallbacks[uniqueId];
        }
    }

    receivedMessage(fullPayload) {
        let response = null;
        try {
            response = JSON.parse(fullPayload);
        } catch(exc)  {
            throw new Error('ws-sync - could not parse JSON: ' + fullPayload + ' | ' + exc.toString() );
        }

        for (const [uniqId, kvpObject] of Object.entries(this.waitedSyncCallbacks)) {
            let found = true;
            let isIncomingForSameId = false;
            let valuesArray = Object.entries(kvpObject['expectedObject']);
            if (valuesArray.length == 0) {
                found = false;
            } else {
                if (this.keyOfResponseId in response && response[this.keyOfResponseId] == uniqId) {
                    isIncomingForSameId = true;
                }
                // loop through all expected keys
                for (const [keyName, valueOfKey] of valuesArray) {
                    if (keyName in response) {
                        if (valueOfKey !== undefined && response[keyName] !== valueOfKey) {
                            found = false;
                            break;
                        }
                    } else {
                        // if even one of the 'expected' key was not found, reject it
                        found = false;
                        break;
                    }
                }
            }

            if (found) {
                this.waitedSyncCallbacks[uniqId]['result'] = response;
            } 

            if (!found || this.includeLastMatchForCallbacks){
                // for incoming callback
                // note, here the last cycle will be skiped, when `found` variable is true
                if (kvpObject['onIncomingCallback'] !== null) {
                    kvpObject['onIncomingCallback'](response, isIncomingForSameId);
                }
            }
        }
    }

    includeLastMatchForCallbacks = false;
}
