import { Pool } from 'pg';
import { config } from './config';
import { EventWatcher } from './watchers/EventWatcher';
import { CasperContractWatcher } from './watchers/CasperContractWatcher';
import { SwapProcessor } from './core/SwapProcessor';
import { PriceOracle } from './core/PriceOracle';

async function main() {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   CasperSwap Relayer Service v1.0     ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    const db = new Pool({
        connectionString: config.database.connectionString,
    });

    // Test database connection
    try {
        const client = await db.connect();
        console.log('✅ Database connected');
        client.release();
    } catch (err: any) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Starting Services...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Initialize price oracle
    console.log('💱 Initializing price oracle...');
    const priceOracle = new PriceOracle();
    console.log('');

    // Start event watcher
    const watcher = new EventWatcher(db);
    await watcher.start();

    // Start Casper contract watcher (polls LockVault __events)
    const casperWatcher = new CasperContractWatcher(db);
    await casperWatcher.start();

    console.log('');

    // Start swap processor with price oracle
    const processor = new SwapProcessor(db, priceOracle);
    await processor.start();

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Relayer is running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Features:');
    console.log('  • Real-time price oracle (ETH/CSPR)');
    console.log('  • Ethereum → Casper swaps');
    console.log('  • Casper → Ethereum swaps');
    console.log('  • Automatic exchange rate conversion');
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
}

main().catch(console.error);
