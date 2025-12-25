import { CasperClient, CLPublicKey, DeployUtil, Keys, RuntimeArgs, CLValueBuilder } from 'casper-js-sdk';
import { ethers } from 'ethers';
import { config } from '../config';
import { Pool } from 'pg';
import { PriceOracle } from './PriceOracle';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class Executor {
    private casperClient: CasperClient;
    private ethProvider: ethers.JsonRpcProvider;
    private ethWallet: ethers.Wallet;
    private db: Pool;
    private priceOracle: PriceOracle;

    private loadCasperKeyPair() {
        const pubPem = process.env.CASPER_PUBLIC_KEY_PEM;
        const secPem = process.env.CASPER_SECRET_KEY_PEM;
        if (pubPem && secPem) {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casper-keys-'));
            const pubPath = path.join(dir, 'public_key.pem');
            const secPath = path.join(dir, 'secret_key.pem');
            fs.writeFileSync(pubPath, pubPem, { encoding: 'utf8' });
            fs.writeFileSync(secPath, secPem, { encoding: 'utf8' });
            return (Keys as any).Ed25519.parseKeyFiles(pubPath, secPath);
        }

        const pubPathEnv = process.env.CASPER_PUBLIC_KEY_PATH;
        const secPathEnv = process.env.CASPER_SECRET_KEY_PATH;
        if (pubPathEnv && secPathEnv) {
            return (Keys as any).Ed25519.parseKeyFiles(pubPathEnv, secPathEnv);
        }

        const keyPath = path.resolve(__dirname, '../../../keys/secret_key.pem');
        const pubKeyPath = path.resolve(__dirname, '../../../keys/public_key.pem');
        if (!fs.existsSync(keyPath) || !fs.existsSync(pubKeyPath)) {
            throw new Error(
                'Casper keys not found. Provide CASPER_PUBLIC_KEY_PEM/CASPER_SECRET_KEY_PEM (preferred) or CASPER_PUBLIC_KEY_PATH/CASPER_SECRET_KEY_PATH, or include keys/public_key.pem and keys/secret_key.pem in the service.'
            );
        }
        return (Keys as any).Ed25519.parseKeyFiles(pubKeyPath, keyPath);
    }

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

        try {
            const keyPair = this.loadCasperKeyPair();

            const contractHashRaw = config.casper.contractHash || '';
            const contractHash = contractHashRaw.startsWith('hash-')
                ? contractHashRaw.slice('hash-'.length)
                : contractHashRaw.startsWith('contract-')
                    ? contractHashRaw.slice('contract-'.length)
                    : contractHashRaw;

            const contractHashBytes = Uint8Array.from(Buffer.from(contractHash, 'hex'));

            // Convert ETH wei -> CSPR motes (string)
            const amountInMotes = this.priceOracle.convertEthToCspr(
                ethers.formatEther(amount)
            );

            const recipientPublicKey = CLPublicKey.fromHex(recipient);

            const runtimeArgs = RuntimeArgs.fromMap({
                swap_id: CLValueBuilder.u64(parseInt(swapId)),
                recipient: CLValueBuilder.key(recipientPublicKey),
                amount: CLValueBuilder.u256(amountInMotes)
            });

            const deployParams = new DeployUtil.DeployParams(
                keyPair.publicKey,
                config.casper.networkName
            );

            const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                contractHashBytes,
                'release',
                runtimeArgs
            );

            const payment = DeployUtil.standardPayment(100000000);
            const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
            const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);

            console.log('  Sending LockVault.release deploy...');
            const deployHash = await this.casperClient.putDeploy(signedDeploy);

            console.log('  ✅ LockVault.release sent!');
            console.log('  Deploy Hash:', deployHash);

            await this.updateSwapStatus(swapId, 'COMPLETED', deployHash);
            return deployHash;
        } catch (err: any) {
            console.error('  ❌ LockVault.release failed:', err.message);
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

            const ethLockVault = new ethers.Contract(
                config.ethereum.contractAddress,
                [
                    'function release(uint256 swapId, address recipient, uint256 amount, bytes signature) external'
                ],
                this.ethWallet
            );

            const swapIdU256 = BigInt(swapId);
            const amountU256 = BigInt(amountInWei);

            const messageHash = ethers.solidityPackedKeccak256(
                ['uint256', 'address', 'uint256'],
                [swapIdU256, recipient, amountU256]
            );
            const signature = await this.ethWallet.signMessage(ethers.getBytes(messageHash));

            console.log('  Calling EthLockVault.release...');
            const tx = await ethLockVault.release(swapIdU256, recipient, amountU256, signature, {
                gasLimit: 300000
            });

            console.log('  Waiting for confirmation...');
            const receipt = await tx.wait();

            console.log('  ✅ Release confirmed!');
            console.log('  Tx Hash:', receipt?.hash);
            console.log('  Explorer:', `https://sepolia.etherscan.io/tx/${receipt?.hash}`);

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
