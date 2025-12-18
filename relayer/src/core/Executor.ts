import { CasperClient, CLPublicKey, DeployUtil, Keys, RuntimeArgs, CLValueBuilder } from 'casper-js-sdk';
import { ethers } from 'ethers';
import { config } from '../config';
import { Pool } from 'pg';
import { PriceOracle } from './PriceOracle';
import * as fs from 'fs';
import * as path from 'path';

export class Executor {
    private casperClient: CasperClient;
    private ethProvider: ethers.JsonRpcProvider;
    private ethWallet: ethers.Wallet;
    private db: Pool;
    private priceOracle: PriceOracle;

    constructor(db: Pool, priceOracle: PriceOracle) {
        this.db = db;
        this.priceOracle = priceOracle;
        this.casperClient = new CasperClient(config.casper.rpcUrl);

        // Setup Ethereum
        this.ethProvider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
        this.ethWallet = new ethers.Wallet(config.ethereum.privateKey, this.ethProvider);
    }

    public async executeReleaseOnCasper(swapId: string, recipient: string, amount: string): Promise<string | null> {
        console.log('');
        console.log('🚀 Executing Casper release via contract...');
        console.log('  Swap ID:', swapId);
        console.log('  Recipient:', recipient);
        console.log('  Amount (Wei):', amount);

        // NOTE: The current LockVault contract's `release()` only emits an event and does not
        // transfer any CSPR. To actually pay the recipient, we must use a native transfer.
        return await this.executeDirectCasperTransfer(swapId, recipient, amount);
    }

    private async executeDirectCasperTransfer(swapId: string, recipient: string, amount: string): Promise<string | null> {
        try {
            const keyPath = path.resolve(__dirname, '../../../keys/secret_key.pem');
            const pubKeyPath = path.resolve(__dirname, '../../../keys/public_key.pem');
            const keyPair = Keys.Ed25519.parseKeyFiles(pubKeyPath, keyPath);
            const recipientPublicKey = CLPublicKey.fromHex(recipient);

            const amountInMotes = this.priceOracle.convertEthToCspr(
                ethers.formatEther(amount)
            );

            const deployParams = new DeployUtil.DeployParams(
                keyPair.publicKey,
                config.casper.networkName
            );

            const payment = DeployUtil.standardPayment(100000000);
            const session = DeployUtil.ExecutableDeployItem.newTransfer(
                amountInMotes,
                recipientPublicKey,
                undefined,
                parseInt(swapId)
            );

            const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
            const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);

            console.log('  Sending direct transfer...');
            const deployHash = await this.casperClient.putDeploy(signedDeploy);

            console.log('  ✅ Direct transfer sent!');
            console.log('  Deploy Hash:', deployHash);

            await this.updateSwapStatus(swapId, 'COMPLETED', deployHash);
            return deployHash;
        } catch (err: any) {
            console.error('  ❌ Direct transfer also failed:', err.message);
            await this.updateSwapStatus(swapId, 'FAILED', null);
            return null;
        }
    }

    public async executeReleaseOnEthereum(swapId: string, recipient: string, amount: string): Promise<string | null> {
        console.log('');
        console.log('🚀 Executing Ethereum release...');
        console.log('  Swap ID:', swapId);
        console.log('  Recipient:', recipient);
        console.log('  Amount (motes):', amount);

        try {
            // Convert using price oracle
            const amountInWei = this.priceOracle.convertCsprToEth(
                (Number(amount) / 1e9).toString()
            );

            const prices = this.priceOracle.getPrices();
            console.log('  Exchange Rate:');
            console.log(`    CSPR: $${prices.cspr.toFixed(4)}`);
            console.log(`    ETH: $${prices.eth.toFixed(2)}`);
            console.log(`    Rate: 1 CSPR = ${(1 / prices.rate).toFixed(6)} ETH`);
            console.log('  Amount conversion:');
            console.log('    CSPR:', (Number(amount) / 1e9).toFixed(4));
            console.log('    ETH:', ethers.formatEther(amountInWei));
            console.log('    Wei:', amountInWei);

            // Create transaction
            const tx = await this.ethWallet.sendTransaction({
                to: recipient,
                value: BigInt(amountInWei),
                gasLimit: 21000
            });

            console.log('  Sending transaction...');
            const receipt = await tx.wait();

            console.log('  ✅ Transaction confirmed!');
            console.log('  Tx Hash:', receipt?.hash);
            console.log('  Explorer:', `https://sepolia.etherscan.io/tx/${receipt?.hash}`);

            // Update database
            await this.updateSwapStatus(swapId, 'COMPLETED', receipt?.hash || '');

            return receipt?.hash || null;
        } catch (err: any) {
            console.error('  ❌ Ethereum release failed:', err.message);
            await this.updateSwapStatus(swapId, 'FAILED', null);
            return null;
        }
    }

    private async updateSwapStatus(swapId: string, status: string, releaseHash: string | null) {
        const client = await this.db.connect();
        try {
            await client.query(
                'UPDATE swaps SET status = $1, release_tx_hash = $2, updated_at = NOW() WHERE swap_id = $3',
                [status, releaseHash, swapId]
            );
        } finally {
            client.release();
        }
    }
}
