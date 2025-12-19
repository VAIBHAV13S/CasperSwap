import { Pool } from 'pg';
import { config } from './config';
import { EventWatcher } from './watchers/EventWatcher';
import { CasperContractWatcher } from './watchers/CasperContractWatcher';
import { SwapProcessor } from './core/SwapProcessor';
import { PriceOracle } from './core/PriceOracle';
import http from 'http';

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

    // Render free-tier Web Services require a bound port. This lightweight health server
    // keeps the process alive without turning the relayer into a full API.
    const port = Number(process.env.PORT || 0);
    if (port) {
        const server = http.createServer((req, res) => {
            if (req.url === '/healthz') {
                res.statusCode = 200;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            res.statusCode = 404;
            res.end('Not Found');
        });

        server.listen(port, '0.0.0.0', () => {
            console.log(`🩺 Health server listening on :${port} (GET /healthz)`);
        });
    }
}

main().catch(console.error);
