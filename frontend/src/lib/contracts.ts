// Contract Configuration
export const CONTRACTS = {
    casper: {
        contractHash: import.meta.env.VITE_CASPER_CONTRACT_HASH || '76f1c326539d21277212e15397f1a95d10e41d9b0e2259309b2221f0930c6e8f',
        rpcUrl: import.meta.env.VITE_CASPER_RPC_URL || 'https://node.testnet.casper.network',
        networkName: import.meta.env.VITE_CASPER_NETWORK_NAME || 'casper-test',
    },
    ethereum: {
        contractAddress: (import.meta.env.VITE_ETHEREUM_CONTRACT_ADDRESS || '0x26D1Fc099043e4e086a3e844862cb2EFa4Db9754') as `0x${string}`,
        chainId: parseInt(import.meta.env.VITE_ETHEREUM_CHAIN_ID || '11155111'),
        networkName: import.meta.env.VITE_ETHEREUM_NETWORK_NAME || 'sepolia',
    },
};

// Ethereum Contract ABI (EthLockVault)
export const ETH_LOCK_VAULT_ABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "swapId",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "depositor",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "toChain",
                "type": "string"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "recipient",
                "type": "string"
            }
        ],
        "name": "DepositInitiated",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "string",
                "name": "toChain",
                "type": "string"
            },
            {
                "internalType": "string",
                "name": "recipient",
                "type": "string"
            }
        ],
        "name": "deposit",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "name": "deposits",
        "outputs": [
            {
                "internalType": "address",
                "name": "depositor",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            },
            {
                "internalType": "string",
                "name": "toChain",
                "type": "string"
            },
            {
                "internalType": "string",
                "name": "recipient",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "nextSwapId",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;
