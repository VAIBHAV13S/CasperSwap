import { ethers } from 'ethers';
import { CasperServiceByJsonRPC, EventStream } from 'casper-js-sdk';
import { config } from '../config';
import { Pool } from 'pg';

export class EventWatcher {
    private casperService: CasperServiceByJsonRPC;
    private casperEventStream: EventStream;
    private ethProvider: ethers.JsonRpcProvider;
    private ethContract: ethers.Contract;
    private db: Pool;
    private lastCheckedBlock: number = 0;

    constructor(db: Pool) {
        this.db = db;
        this.casperService = new CasperServiceByJsonRPC(config.casper.rpcUrl);
        this.casperEventStream = new EventStream(config.casper.eventStreamUrl);

        this.ethProvider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
        const abi = [
            "event DepositInitiated(uint256 indexed swapId, address indexed depositor, uint256 amount, string toChain, string recipient)"
        ];
        this.ethContract = new ethers.Contract(config.ethereum.contractAddress, abi, this.ethProvider);
    }

    public async start() {
        console.log('Starting Event Watcher...');

        // Run initial backfill
        await this.backfillRecentEvents();

        // Start real-time listeners
        this.startCasperWatcher();
        this.startEthereumWatcher();

        // Start polling as backup
        this.startPolling();
    }

    private async backfillRecentEvents() {
        console.log('🔍 Checking for recent events...');

        try {
            const currentBlock = await this.ethProvider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 100); // Last 100 blocks

            console.log(`   Scanning blocks ${fromBlock} to ${currentBlock}...`);

            const allEvents: ethers.EventLog[] = [];

            // Scan in 10-block chunks for Alchemy free tier
            for (let start = fromBlock; start <= currentBlock; start += 10) {
                const end = Math.min(start + 9, currentBlock);

                const filter = this.ethContract.filters.DepositInitiated();
                const logs = await this.ethContract.queryFilter(filter, start, end);
                const events = logs.filter((log): log is ethers.EventLog => 'args' in log);

                allEvents.push(...events);
            }

            if (allEvents.length > 0) {
                console.log(`   ✅ Found ${allEvents.length} recent event(s)`);

                for (const event of allEvents) {
                    await this.saveEvent('ethereum', 'DepositInitiated', event);
                }
            } else {
                console.log('   No recent events found');
            }

            this.lastCheckedBlock = currentBlock;
        } catch (err: any) {
            console.error('   ⚠️  Backfill error:', err.message);
        }
    }

    private async startCasperWatcher() {
        console.log('Watching Casper events...');
        try {
            console.log('⚠️  Casper event stream disabled (requires local node)');
            console.log('   Relayer will process Ethereum → Casper swaps only');
        } catch (err: any) {
            console.error('Casper watcher error:', err.message);
        }
    }

    private async startEthereumWatcher() {
        console.log('Watching Ethereum events...');
        try {
            // NOTE: Alchemy/Infura websocket-style filters can be flaky in some environments
            // and may throw asynchronous errors like "filter not found" / 400 Bad Request.
            // We rely on polling + backfill below as the stable ingestion path.
            console.log('⚠️  Ethereum realtime listener disabled (using polling + backfill)');
        } catch (err: any) {
            console.error('❌ Ethereum watcher error:', err.message);
        }
    }

    private startPolling() {
        console.log('🔄 Starting polling backup (every 30 seconds)...');

        setInterval(async () => {
            try {
                const currentBlock = await this.ethProvider.getBlockNumber();

                if (currentBlock > this.lastCheckedBlock) {
                    const fromBlock = this.lastCheckedBlock + 1;

                    // Scan in 10-block chunks
                    for (let start = fromBlock; start <= currentBlock; start += 10) {
                        const end = Math.min(start + 9, currentBlock);

                        const filter = this.ethContract.filters.DepositInitiated();
                        const logs = await this.ethContract.queryFilter(filter, start, end);
                        const events = logs.filter((log): log is ethers.EventLog => 'args' in log);

                        if (events.length > 0) {
                            console.log('');
                            console.log(`📡 Polling found ${events.length} new event(s) in blocks ${start}-${end}`);

                            for (const event of events) {
                                await this.saveEvent('ethereum', 'DepositInitiated', event);
                            }
                        }
                    }

                    this.lastCheckedBlock = currentBlock;
                }
            } catch (err: any) {
                console.error('Polling error:', err.message);
            }
        }, 30000); // Every 30 seconds
    }

    private async saveEvent(chain: string, eventType: string, event: any) {
        const client = await this.db.connect();
        try {
            // Extract event data
            const args = event.args || event;
            const txHash = event.transactionHash || event.log?.transactionHash;
            const blockNumber = event.blockNumber || event.log?.blockNumber || 0;

            // Check if already exists
            const existing = await client.query(
                'SELECT * FROM events WHERE tx_hash = $1 AND chain = $2',
                [txHash, chain]
            );

            if (existing.rows.length > 0) {
                return; // Already processed
            }

            await client.query(
                'INSERT INTO events (chain, event_type, block_number, tx_hash, payload) VALUES ($1, $2, $3, $4, $5)',
                [chain, eventType, blockNumber, txHash, JSON.stringify({
                    swapId: args[0]?.toString() || args.swapId?.toString(),
                    depositor: args[1] || args.depositor,
                    amount: args[2]?.toString() || args.amount?.toString(),
                    toChain: args[3] || args.toChain,
                    recipient: args[4] || args.recipient
                })]
            );

            // Create swap entry
            if (eventType === 'DepositInitiated') {
                await client.query(
                    'INSERT INTO swaps (swap_id, user_address, from_chain, to_chain, token_address, amount, recipient, deposit_tx_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (swap_id) DO NOTHING',
                    [
                        args[0]?.toString() || args.swapId?.toString(),
                        args[1] || args.depositor,
                        chain,
                        args[3] || args.toChain,
                        '0x0000000000000000000000000000000000000000',
                        args[2]?.toString() || args.amount?.toString(),
                        args[4] || args.recipient,
                        txHash,
                        'PENDING'
                    ]
                );

                console.log('   ✅ Event saved to database');
            }
        } catch (err: any) {
            if (!err.message.includes('duplicate key')) {
                console.error('Error saving event:', err.message);
            }
        } finally {
            client.release();
        }
    }
}
