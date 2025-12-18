import dotenv from 'dotenv';
dotenv.config();

export const config = {
    casper: {
        rpcUrl: process.env.CASPER_RPC_URL || 'https://node.testnet.casper.network',
        eventStreamUrl: process.env.CASPER_EVENT_STREAM_URL || 'http://localhost:18101/events/main',
        contractHash: process.env.LOCK_VAULT_CONTRACT_HASH || process.env.CASPER_CONTRACT_HASH || '76f1c326539d21277212e15397f1a95d10e41d9b0e2259309b2221f0930c6e8f',
        networkName: process.env.CASPER_NETWORK_NAME || 'casper-test',
        privateKey: process.env.CASPER_PRIVATE_KEY || '',
        eventsPollMs: parseInt(process.env.CASPER_EVENTS_POLL_MS || '30000'),
    },
    ethereum: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
        contractAddress: process.env.ETHEREUM_CONTRACT_ADDRESS || '0x26D1Fc099043e4e086a3e844862cb2EFa4Db9754',
        privateKey: process.env.ETHEREUM_PRIVATE_KEY || '',
        chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '11155111'),
    },
    database: {
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/casper_swap',
    },
    polling: {
        interval: 10000, // 10 seconds
    },
};
