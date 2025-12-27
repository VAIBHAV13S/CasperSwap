import { CasperServiceByJsonRPC, CLValueParsers } from 'casper-js-sdk';
import { config } from '../config';
import { Pool } from 'pg';

export class CasperContractWatcher {
    private casperService: CasperServiceByJsonRPC;
    private db: Pool;
    private isWatching: boolean = false;
    private pollMs: number;
    private readonly stateKeyLastIndex = 'casper_lock_vault_last_event_index';
    private eventsSeedUref: string | null = null;
    private eventsLengthUref: string | null = null;
    private loggedNamedKeys: boolean = false;
    private didRewindForDecode: boolean = false;
    private isChecking: boolean = false;
    private loggedDecodeDebug: boolean = false;

    constructor(db: Pool) {
        this.db = db;
        this.casperService = new CasperServiceByJsonRPC(config.casper.rpcUrl);
        this.pollMs = Number.isFinite(config.casper.eventsPollMs) ? config.casper.eventsPollMs : 30000;
    }

    private toStateKeyHash(contractHashRaw: string): string {
        const withoutPrefix = contractHashRaw.startsWith('hash-')
            ? contractHashRaw.slice('hash-'.length)
            : contractHashRaw.startsWith('contract-')
                ? contractHashRaw.slice('contract-'.length)
                : contractHashRaw;
        return `hash-${withoutPrefix}`;
    }

    public async start() {
        console.log('🔍 Starting Casper contract watcher...');
        console.log('   Contract Hash:', config.casper.contractHash);
        console.log(`   Polling every ${Math.round(this.pollMs / 1000)} seconds for contract events`);

        this.isWatching = true;

        // Poll for events every 30 seconds
        setInterval(async () => {
            if (this.isWatching) {
                await this.checkForDeposits();
            }
        }, this.pollMs);
    }

    private async checkForDeposits() {
        if (this.isChecking) {
            return;
        }

        this.isChecking = true;
        try {
            const client = await this.db.connect();
            try {
                const lastIndex = await this.getLastProcessedIndex(client);
                let nextIndex = lastIndex + 1;

                // Self-heal: if we've already advanced the cursor but no Casper swap rows exist,
                // we likely upgraded decoding logic after initial raw-event ingestion.
                // Rewind to 0 so we can re-decode historical events. Inserts are idempotent.
                if (lastIndex >= 0 && !this.didRewindForDecode) {
                    const swapCheck = await client.query(
                        "SELECT 1 FROM swaps WHERE from_chain = 'casper' LIMIT 1"
                    );
                    if (swapCheck.rows.length === 0) {
                        console.log('   ⚠️  Casper swaps table empty but cursor advanced; rewinding to re-decode events from index 0');
                        await this.setLastProcessedIndex(client, -1);
                        nextIndex = 0;
                        this.didRewindForDecode = true;
                    }
                }

                // Fetch latest state root hash.
                const stateRootHash = await this.rpcRetry(() => this.casperService.getStateRootHash());

                // Odra/CES stores events under a named dictionary "__events" within the contract.
                // We poll sequentially by index until we hit a missing key.
                const contractHash = this.toStateKeyHash(config.casper.contractHash);

                if (!this.eventsSeedUref) {
                    this.eventsSeedUref = await this.resolveEventsSeedUref(stateRootHash, contractHash);
                }

                const eventsLength = await this.getEventsLength(stateRootHash);
                if (eventsLength === 0 && nextIndex !== 0) {
                    console.log(`   ⚠️  __events_length is 0 but cursor is at ${nextIndex}; rewinding cursor to 0`);
                    await this.setLastProcessedIndex(client, -1);
                    nextIndex = 0;
                }
                if (eventsLength !== null && eventsLength > 0 && nextIndex > eventsLength) {
                    console.log(`   ⚠️  Cursor (${nextIndex}) is beyond __events_length (${eventsLength}); rewinding cursor to 0`);
                    await this.setLastProcessedIndex(client, -1);
                    nextIndex = 0;
                }
                if (eventsLength !== null && nextIndex >= eventsLength) {
                    console.log(`   No new Casper events (next=${nextIndex}, length=${eventsLength})`);
                    return;
                }

                let processedCount = 0;
                for (;;) {
                    if (eventsLength !== null && nextIndex >= eventsLength) {
                        if (processedCount > 0) {
                            console.log(`   ✅ Processed ${processedCount} Casper event(s)`);
                        }
                        return;
                    }

                    const dictionaryItemKey = nextIndex.toString();
                    console.log(`   Checking LockVault __events[${dictionaryItemKey}]...`);

                    let storedValue;
                    try {
                        if (this.eventsSeedUref) {
                            storedValue = await this.rpcRetry(() => this.casperService.getDictionaryItemByURef(
                                stateRootHash,
                                dictionaryItemKey,
                                this.eventsSeedUref as string,
                                { rawData: false }
                            ));
                        } else {
                            storedValue = await this.rpcRetry(() => this.casperService.getDictionaryItemByName(
                                stateRootHash,
                                contractHash,
                                '__events',
                                dictionaryItemKey,
                                { rawData: false }
                            ));
                        }
                    } catch (_err: any) {
                        if (processedCount > 0) {
                            console.log(`   ✅ Processed ${processedCount} Casper event(s)`);
                        }
                        return;
                    }

                    // Store raw event value. We keep decoding minimal for now; decoding can be improved
                    // once the exact CES schema is finalized.
                    const payload = storedValue;
                    const txHash = `casper_event_${contractHash}_${dictionaryItemKey}`;

                    const existing = await client.query(
                        'SELECT 1 FROM events WHERE tx_hash = $1 AND chain = $2',
                        [txHash, 'casper']
                    );
                    if (existing.rows.length === 0) {
                        await client.query(
                            'INSERT INTO events (chain, event_type, block_number, tx_hash, payload) VALUES ($1, $2, $3, $4, $5)',
                            ['casper', 'ContractEvent', 0, txHash, JSON.stringify(payload)]
                        );
                    }

                    // Try best-effort extraction for DepositInitiated-like payload.
                    // If we cannot decode, we still advance the cursor and keep the raw event in DB.
                    const extracted = this.tryExtractDepositInitiated(payload);
                    if (extracted) {
                        try {
                            await client.query(
                                'INSERT INTO swaps (swap_id, user_address, from_chain, to_chain, token_address, amount, recipient, deposit_tx_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (swap_id) DO NOTHING',
                                [
                                    extracted.swapId,
                                    extracted.depositor,
                                    'casper',
                                    extracted.toChain,
                                    extracted.token,
                                    extracted.amount,
                                    extracted.recipient,
                                    txHash,
                                    'PENDING'
                                ]
                            );
                            console.log(`   ✅ Decoded DepositInitiated -> swaps.swap_id=${extracted.swapId}`);
                        } catch (e: any) {
                            console.log(`   ⚠️  Failed inserting swap row: ${e?.message || e}`);
                        }
                    } else {
                        const released = this.tryExtractReleaseExecuted(payload);
                        if (released) {
                            await client.query(
                                "UPDATE swaps SET status = 'COMPLETED', release_tx_hash = $1, updated_at = NOW() WHERE swap_id = $2 AND status <> 'COMPLETED'",
                                [txHash, released.swapId]
                            );
                            console.log(`   ✅ Decoded ReleaseExecuted -> swaps.swap_id=${released.swapId} marked COMPLETED`);
                        } else {
                            const refunded = this.tryExtractRefundExecuted(payload);
                            if (refunded) {
                                await client.query(
                                    "UPDATE swaps SET status = 'REFUNDED', release_tx_hash = $1, updated_at = NOW() WHERE swap_id = $2 AND status <> 'REFUNDED'",
                                    [txHash, refunded.swapId]
                                );
                                console.log(`   ✅ Decoded RefundExecuted -> swaps.swap_id=${refunded.swapId} marked REFUNDED`);
                            } else {
                                console.log('   ⚠️  Could not decode Casper event into known LockVault event (stored raw event only)');
                            }
                        }
                    }

                    await this.setLastProcessedIndex(client, nextIndex);
                    processedCount += 1;
                    nextIndex += 1;

                    // Safety cap per tick.
                    if (processedCount >= 50) {
                        console.log('   ⚠️  Processed 50 Casper events in one tick; pausing until next poll');
                        return;
                    }
                }
            } finally {
                client.release();
            }

        } catch (err: any) {
            console.error('   Error checking Casper deposits:', err.message);
        } finally {
            this.isChecking = false;
        }
    }

    private tryExtractReleaseExecuted(payload: any): null | {
        swapId: string;
        recipient: string;
        amount: string;
    } {
        try {
            const decoded = this.decodeCesEventBytesReleaseLike(payload);
            if (!decoded) return null;
            if (!decoded.name.startsWith('event_ReleaseExecuted')) return null;
            return {
                swapId: decoded.swapId.toString(),
                recipient: decoded.recipientHex,
                amount: decoded.amountDecimal,
            };
        } catch {
            return null;
        }
    }

    private tryExtractRefundExecuted(payload: any): null | {
        swapId: string;
        recipient: string;
        amount: string;
    } {
        try {
            const decoded = this.decodeCesEventBytesReleaseLike(payload);
            if (!decoded) return null;
            if (!decoded.name.startsWith('event_RefundExecuted')) return null;
            return {
                swapId: decoded.swapId.toString(),
                recipient: decoded.recipientHex,
                amount: decoded.amountDecimal,
            };
        } catch {
            return null;
        }
    }

    private async resolveEventsSeedUref(stateRootHash: string, contractHashKey: string): Promise<string | null> {
        try {
            const storedValue = await this.rpcRetry(() => this.casperService.getBlockState(stateRootHash, contractHashKey, []));
            const namedKeys = storedValue?.Contract?.namedKeys || [];

            if (!this.loggedNamedKeys) {
                this.loggedNamedKeys = true;
                if (namedKeys.length === 0) {
                    console.log('   ⚠️  No named keys found on contract (cannot auto-discover __events seed URef)');
                } else {
                    console.log('   Contract named keys:');
                    for (const nk of namedKeys) {
                        console.log(`     - ${nk.name}: ${nk.key}`);
                    }
                }
            }

            const eventsKey = namedKeys.find((k: any) => k.name === '__events')?.key;
            const eventsLengthKey = namedKeys.find((k: any) => k.name === '__events_length')?.key;

            if (eventsLengthKey && eventsLengthKey.startsWith('uref-')) {
                this.eventsLengthUref = eventsLengthKey;
            }
            if (!eventsKey) {
                console.log('   ⚠️  Named key "__events" not found; falling back to getDictionaryItemByName');
                return null;
            }

            // Named keys may point directly to a dictionary seed URef or to a dictionary-* key.
            // CasperServiceByJsonRPC.getDictionaryItemByURef expects a seed URef.
            if (eventsKey.startsWith('uref-')) {
                console.log(`   ✅ Discovered __events seed URef: ${eventsKey}`);
                return eventsKey;
            }

            console.log(`   ⚠️  __events named key is not a URef (${eventsKey}); falling back to getDictionaryItemByName`);
            return null;
        } catch (err: any) {
            console.log(`   ⚠️  Failed to resolve contract named keys: ${err.message}`);
            return null;
        }
    }

    private async getEventsLength(stateRootHash: string): Promise<number | null> {
        if (!this.eventsLengthUref) {
            return null;
        }

        try {
            const storedValue = await this.rpcRetry(() => this.casperService.getBlockState(stateRootHash, this.eventsLengthUref as string, []));
            const bytes = this.extractBytesFromPayload(storedValue);
            if (!bytes || bytes.length < 4) {
                return null;
            }
            const n = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
            return Number.isFinite(n) ? n : null;
        } catch {
            return null;
        }
    }

    private async rpcRetry<T>(fn: () => Promise<T>, attempts: number = 3, baseDelayMs: number = 500): Promise<T> {
        let lastErr: any;
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (err: any) {
                lastErr = err;
                const msg = String(err?.message || err);
                const shouldRetry = msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed') || msg.includes('network');
                if (!shouldRetry || i === attempts - 1) {
                    throw err;
                }
                const delay = baseDelayMs * Math.pow(2, i);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
        throw lastErr;
    }

    private async getLastProcessedIndex(client: any): Promise<number> {
        const res = await client.query('SELECT value FROM relayer_state WHERE key = $1', [this.stateKeyLastIndex]);
        if (res.rows.length === 0) {
            return -1;
        }
        const n = parseInt(res.rows[0].value, 10);
        return Number.isFinite(n) ? n : -1;
    }

    private async setLastProcessedIndex(client: any, idx: number): Promise<void> {
        await client.query(
            'INSERT INTO relayer_state (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
            [this.stateKeyLastIndex, idx.toString()]
        );
    }

    private tryExtractDepositInitiated(payload: any): null | {
        swapId: string;
        depositor: string;
        amount: string;
        toChain: string;
        recipient: string;
        token: string;
    } {
        try {
            const decoded = this.decodeCesEventBytes(payload);
            if (!decoded) return null;
            if (!decoded.name.startsWith('event_DepositInitiated')) return null;

            return {
                swapId: decoded.swapId.toString(),
                depositor: decoded.depositorHex,
                amount: decoded.amountDecimal,
                toChain: decoded.toChain,
                recipient: decoded.recipient,
                token: decoded.tokenHex,
            };
        } catch {
            return null;
        }
    }

    private decodeCesEventBytes(payload: any): null | {
        name: string;
        swapId: bigint;
        depositorHex: string;
        amountDecimal: string;
        toChain: string;
        recipient: string;
        tokenHex: string;
    } {
        const bytes = this.extractBytesFromPayload(payload);
        if (!bytes || bytes.length < 10) return null;

        let off = 0;
        const readU32LE = () => {
            if (off + 4 > bytes.length) throw new Error('oob');
            const v = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
            off += 4;
            return v;
        };
        const readU64LE = (): bigint => {
            if (off + 8 > bytes.length) throw new Error('oob');
            let v = 0n;
            for (let i = 0; i < 8; i++) {
                v |= BigInt(bytes[off + i]) << (8n * BigInt(i));
            }
            off += 8;
            return v;
        };
        const readBytes = (len: number) => {
            if (off + len > bytes.length) throw new Error('oob');
            const out = bytes.slice(off, off + len);
            off += len;
            return out;
        };
        const bytesToAscii = (b: number[]) => String.fromCharCode(...b);
        const bytesToHex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join('');
        const bytesLeToBigInt = (b: number[]) => {
            let v = 0n;
            for (let i = 0; i < b.length; i++) {
                v |= BigInt(b[i]) << (8n * BigInt(i));
            }
            return v;
        };

        // Robust event-name detection:
        // CES events include an ASCII name like "event_DepositInitiated" somewhere near the start.
        // With CLType=Any wrappers, there may be prefixes that make direct parsing unreliable.
        const marker = [101, 118, 101, 110, 116, 95]; // "event_"
        const findMarker = (): number | null => {
            for (let i = 0; i <= Math.min(bytes.length - marker.length, 256); i++) {
                let ok = true;
                for (let j = 0; j < marker.length; j++) {
                    if (bytes[i + j] !== marker[j]) {
                        ok = false;
                        break;
                    }
                }
                if (ok) return i;
            }
            return null;
        };

        const markerPos = findMarker();
        if (markerPos === null) return null;

        let nameEnd = markerPos;
        while (nameEnd < bytes.length && bytes[nameEnd] !== 0) {
            nameEnd += 1;
        }
        if (nameEnd >= bytes.length) return null;

        const name = bytesToAscii(bytes.slice(markerPos, nameEnd));
        off = nameEnd + 1; // skip null terminator

        if (!this.loggedDecodeDebug) {
            this.loggedDecodeDebug = true;
            console.log(`   Casper event decode debug: name=${name}, bytes=${bytes.length}`);
        }

        const swapId = readU64LE();
        const depositor = readBytes(32);

        const findNextStringLenOffset = (start: number): number | null => {
            for (let i = start; i <= Math.min(start + 64, bytes.length - 4); i++) {
                const len = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
                if (len === 0 || len > 256) continue;
                const strStart = i + 4;
                const strEnd = strStart + len;
                if (strEnd > bytes.length) continue;
                const slice = bytes.slice(strStart, strEnd);
                const printable = slice.every((c) => c >= 32 && c <= 126);
                if (!printable) continue;
                return i;
            }
            return null;
        };

        const amountStart = off;
        const toChainLenPos = findNextStringLenOffset(amountStart);
        if (toChainLenPos === null) return null;
        const amountBytes = bytes.slice(amountStart, toChainLenPos);
        off = toChainLenPos;

        const toChainLen = readU32LE();
        const toChain = bytesToAscii(readBytes(toChainLen));
        const recipientLen = readU32LE();
        const recipient = bytesToAscii(readBytes(recipientLen));
        const token = readBytes(32);

        return {
            name,
            swapId,
            depositorHex: `account-hash-${bytesToHex(depositor)}`,
            amountDecimal: bytesLeToBigInt(amountBytes).toString(10),
            toChain,
            recipient,
            tokenHex: `account-hash-${bytesToHex(token)}`,
        };
    }

    private decodeCesEventBytesReleaseLike(payload: any): null | {
        name: string;
        swapId: bigint;
        recipientHex: string;
        amountDecimal: string;
    } {
        const bytes = this.extractBytesFromPayload(payload);
        if (!bytes || bytes.length < 10) return null;

        let off = 0;

        const readU64LE = (): bigint => {
            if (off + 8 > bytes.length) throw new Error('oob');
            let v = 0n;
            for (let i = 0; i < 8; i++) {
                v |= BigInt(bytes[off + i]) << (8n * BigInt(i));
            }
            off += 8;
            return v;
        };
        const readBytes = (len: number) => {
            if (off + len > bytes.length) throw new Error('oob');
            const out = bytes.slice(off, off + len);
            off += len;
            return out;
        };
        const bytesToAscii = (b: number[]) => String.fromCharCode(...b);
        const bytesToHex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join('');
        const bytesLeToBigInt = (b: number[]) => {
            let v = 0n;
            for (let i = 0; i < b.length; i++) {
                v |= BigInt(b[i]) << (8n * BigInt(i));
            }
            return v;
        };

        const marker = [101, 118, 101, 110, 116, 95]; // "event_"
        const findMarker = (): number | null => {
            for (let i = 0; i <= Math.min(bytes.length - marker.length, 256); i++) {
                let ok = true;
                for (let j = 0; j < marker.length; j++) {
                    if (bytes[i + j] !== marker[j]) {
                        ok = false;
                        break;
                    }
                }
                if (ok) return i;
            }
            return null;
        };

        const markerPos = findMarker();
        if (markerPos === null) return null;

        let nameEnd = markerPos;
        while (nameEnd < bytes.length && bytes[nameEnd] !== 0) {
            nameEnd += 1;
        }
        if (nameEnd >= bytes.length) return null;

        const name = bytesToAscii(bytes.slice(markerPos, nameEnd));
        off = nameEnd + 1;

        const swapId = readU64LE();
        const recipient = readBytes(32);

        const amountBytes = bytes.slice(off);
        if (amountBytes.length === 0) return null;

        return {
            name,
            swapId,
            recipientHex: `account-hash-${bytesToHex(recipient)}`,
            amountDecimal: bytesLeToBigInt(amountBytes).toString(10),
        };
    }

    private extractBytesFromPayload(payload: any): number[] | null {
        // DB-friendly format (what you pasted): { CLValue: ["22","0",...] }
        if (Array.isArray(payload?.CLValue)) {
            const arr = payload.CLValue;
            const bytes = arr.map((x: any) => Number(x));
            return bytes.every((n: number) => Number.isFinite(n)) ? bytes : null;
        }

        // RPC StoredValue format: { CLValue: { bytes: "...", cl_type: "Any", parsed: null } }
        const hex = payload?.CLValue?.bytes;
        if (typeof hex === 'string' && hex.length > 0) {
            const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
            if (clean.length % 2 !== 0) return null;
            const out: number[] = [];
            for (let i = 0; i < clean.length; i += 2) {
                out.push(parseInt(clean.slice(i, i + 2), 16));
            }
            return out;
        }

        // casper-js-sdk may return CLValue objects. Prefer CLValueParsers.toJSON.
        const clValueObj = payload?.CLValue;
        if (clValueObj) {
            try {
                const res = CLValueParsers.toJSON(clValueObj);
                if ((res as any)?.ok) {
                    const jsonBytes = (res as any).val?.bytes;
                    if (typeof jsonBytes === 'string' && jsonBytes.length > 0) {
                        const clean = jsonBytes.startsWith('0x') ? jsonBytes.slice(2) : jsonBytes;
                        if (clean.length % 2 !== 0) return null;
                        const out: number[] = [];
                        for (let i = 0; i < clean.length; i += 2) {
                            out.push(parseInt(clean.slice(i, i + 2), 16));
                        }
                        return out;
                    }
                }
            } catch {
                // fall through
            }

            // Fallback: some CLValue implementations expose .data.bytes
            const dataBytes = clValueObj?.data?.bytes;
            if (typeof dataBytes === 'string' && dataBytes.length > 0) {
                const clean = dataBytes.startsWith('0x') ? dataBytes.slice(2) : dataBytes;
                if (clean.length % 2 !== 0) return null;
                const out: number[] = [];
                for (let i = 0; i < clean.length; i += 2) {
                    out.push(parseInt(clean.slice(i, i + 2), 16));
                }
                return out;
            }
        }

        // Sometimes we might already pass the StoredValue directly (from casper-js-sdk),
        // so try one more common nesting.
        const alt = (payload as any)?.storedValue;
        if (Array.isArray(alt?.CLValue)) {
            const arr = alt.CLValue;
            const bytes = arr.map((x: any) => Number(x));
            return bytes.every((n: number) => Number.isFinite(n)) ? bytes : null;
        }

        return null;
    }

    public stop() {
        this.isWatching = false;
    }
}
