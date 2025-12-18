import { ethers } from 'ethers';
import { Pool } from 'pg';
import { config } from './config';

async function backfillEvents() {
    console.log('====================================');
    console.log('Backfilling Past Ethereum Events');
    console.log('====================================');
    console.log('');

    const provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
    const abi = [
        "event DepositInitiated(uint256 indexed swapId, address indexed depositor, uint256 amount, string toChain, string recipient)"
    ];
    const contract = new ethers.Contract(config.ethereum.contractAddress, abi, provider);

    console.log('Contract:', config.ethereum.contractAddress);
    console.log('RPC:', config.ethereum.rpcUrl);
    console.log('');
    console.log('Fetching past events...');

    try {
        // Get events from the last 100 blocks (scan in 10-block chunks for Alchemy free tier)
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock - 100;

        console.log(`Scanning blocks ${fromBlock} to ${currentBlock}...`);
        console.log('(Scanning in 10-block chunks for Alchemy free tier)');
        console.log('');

        const allEvents: ethers.EventLog[] = [];

        // Scan in 10-block chunks
        for (let start = fromBlock; start <= currentBlock; start += 10) {
            const end = Math.min(start + 9, currentBlock);
            console.log(`  Scanning blocks ${start} to ${end}...`);

            const filter = contract.filters.DepositInitiated();
            const logs = await contract.queryFilter(filter, start, end);
            const events = logs.filter((log): log is ethers.EventLog => 'args' in log);

            allEvents.push(...events);
        }

        console.log('');
        console.log(`Found ${allEvents.length} deposit events`);
        console.log('');

        const db = new Pool({ connectionString: config.database.connectionString });

        for (const event of allEvents) {
            const args = event.args;
            console.log('Processing event:');
            console.log('  Swap ID:', args[0].toString());
            console.log('  Depositor:', args[1]);
            console.log('  Amount:', ethers.formatEther(args[2]), 'ETH');
            console.log('  To Chain:', args[3]);
            console.log('  Recipient:', args[4]);
            console.log('  Tx Hash:', event.transactionHash);
            console.log('');

            // Save to database
            const client = await db.connect();
            try {
                await client.query(
                    'INSERT INTO events (chain, event_type, block_number, tx_hash, payload) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
                    ['ethereum', 'DepositInitiated', event.blockNumber, event.transactionHash, JSON.stringify({
                        swapId: args[0].toString(),
                        depositor: args[1],
                        amount: args[2].toString(),
                        toChain: args[3],
                        recipient: args[4]
                    })]
                );

                await client.query(
                    'INSERT INTO swaps (swap_id, user_address, from_chain, to_chain, token_address, amount, recipient, deposit_tx_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (swap_id) DO NOTHING',
                    [args[0].toString(), args[1], 'ethereum', args[3], '0x0000000000000000000000000000000000000000', args[2].toString(), args[4], event.transactionHash, 'PENDING']
                );

                console.log('✅ Saved to database');
            } catch (err) {
                console.error('❌ Error saving:', err);
            } finally {
                client.release();
            }
        }

        await db.end();
        console.log('');
        console.log('====================================');
        console.log('Backfill Complete!');
        console.log('====================================');
    } catch (err: any) {
        console.error('Error:', err.message);
    }
}

backfillEvents();
