import { Pool } from 'pg';
import { Executor } from './Executor';
import { PriceOracle } from './PriceOracle';

export class SwapProcessor {
    private db: Pool;
    private executor: Executor;
    private priceOracle: PriceOracle;
    private isProcessing: boolean = false;

    constructor(db: Pool, priceOracle: PriceOracle) {
        this.db = db;
        this.priceOracle = priceOracle;
        this.executor = new Executor(db, priceOracle);
    }

    public async start() {
        console.log('🔄 Starting swap processor...');
        console.log('   Checking for pending swaps every 10 seconds');

        // Process immediately on start
        await this.processPendingSwaps();

        // Then check every 10 seconds
        setInterval(async () => {
            await this.processPendingSwaps();
        }, 10000);
    }

    private async processPendingSwaps() {
        if (this.isProcessing) {
            return; // Skip if already processing
        }

        this.isProcessing = true;

        try {
            const client = await this.db.connect();

            try {
                const result = await client.query(
                    "SELECT * FROM swaps WHERE status = 'PENDING' ORDER BY created_at ASC"
                );

                if (result.rows.length > 0) {
                    console.log('');
                    console.log(`📋 Found ${result.rows.length} pending swap(s)`);
                }

                for (const swap of result.rows) {
                    await this.processSwap(swap);
                }
            } finally {
                client.release();
            }
        } catch (err: any) {
            console.error('❌ Error processing swaps:', err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    private async processSwap(swap: any) {
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Processing Swap:', swap.swap_id);
        console.log('  From:', swap.from_chain);
        console.log('  To:', swap.to_chain);
        console.log('  Amount:', swap.amount);
        console.log('  Recipient:', swap.recipient);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (swap.to_chain === 'casper') {
            // Ethereum → Casper swap
            const deployHash = await this.executor.executeReleaseOnCasper(
                swap.swap_id,
                swap.recipient,
                swap.amount
            );

            if (deployHash) {
                console.log('');
                console.log('✅ Swap completed successfully!');
                console.log('   Casper Deploy:', deployHash);
            } else {
                console.log('');
                console.log('❌ Swap failed');
            }
        } else if (swap.to_chain === 'ethereum') {
            // Casper → Ethereum swap
            const txHash = await this.executor.executeReleaseOnEthereum(
                swap.swap_id,
                swap.recipient,
                swap.amount
            );

            if (txHash) {
                console.log('');
                console.log('✅ Swap completed successfully!');
                console.log('   Ethereum Tx:', txHash);
            } else {
                console.log('');
                console.log('❌ Swap failed');
            }
        }
    }
}
