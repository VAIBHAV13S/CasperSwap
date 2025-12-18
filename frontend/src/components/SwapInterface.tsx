import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useClickRef } from '@make-software/csprclick-react';
import { CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, CLAccountHash, CasperServiceByJsonRPC } from 'casper-js-sdk';
import { CONTRACTS, ETH_LOCK_VAULT_ABI } from '../lib/contracts';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ArrowUpDown, Wallet, Info, RefreshCw, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const SwapInterface = () => {
    const [fromChain, setFromChain] = useState('ethereum');
    const [toChain, setToChain] = useState('casper');
    const [amount, setAmount] = useState('');
    const [recipient, setRecipient] = useState('');
    const [estimatedOutput, setEstimatedOutput] = useState('0');
    const [exchangeRate, setExchangeRate] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    // Ethereum Wallet
    const { address: ethAddress, isConnected: isEthConnected } = useAccount();
    const { writeContract } = useWriteContract();

    // Casper Wallet
    const clickRef = useClickRef();
    const [casperAddress, setCasperAddress] = useState<string>('');
    const [casperConnected, setCasperConnected] = useState(false);

    // Check Casper wallet connection
    useEffect(() => {
        const checkConnection = async () => {
            if (clickRef && clickRef.current) {
                try {
                    const isConnected = await clickRef.current.isConnected();
                    if (isConnected) {
                        const account = await clickRef.current.getActivePublicKey();
                        if (account) {
                            setCasperAddress(account);
                            setCasperConnected(true);
                        }
                    }
                } catch (err) {
                    console.log('Casper connection check failed:', err);
                }
            }
        };
        checkConnection();
        const interval = setInterval(checkConnection, 2000);
        return () => clearInterval(interval);
    }, [clickRef]);

    // Fetch exchange rate
    useEffect(() => {
        let cancelled = false;

        const updateRate = async () => {
            try {
                const res = await fetch(
                    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,casper-network&vs_currencies=usd'
                );

                if (!res.ok) throw new Error('Failed to fetch prices');

                const json = await res.json();
                const ethUsd = Number(json?.ethereum?.usd);
                const csprUsd = Number(json?.['casper-network']?.usd);

                if (!Number.isFinite(ethUsd) || !Number.isFinite(csprUsd) || csprUsd <= 0) {
                    throw new Error('Invalid price data');
                }

                const rate = ethUsd / csprUsd;
                if (!cancelled) setExchangeRate(rate);
            } catch {
                if (!cancelled && exchangeRate === 0) setExchangeRate(75000);
            }
        };

        updateRate();
        const interval = setInterval(updateRate, 60000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    // Estimate output
    useEffect(() => {
        if (amount && parseFloat(amount) > 0 && exchangeRate > 0) {
            if (fromChain === 'ethereum') {
                setEstimatedOutput((parseFloat(amount) * exchangeRate).toFixed(2));
            } else {
                setEstimatedOutput((parseFloat(amount) / exchangeRate).toFixed(6));
            }
        } else {
            setEstimatedOutput('0');
        }
    }, [amount, fromChain, exchangeRate]);

    const switchChains = () => {
        setFromChain(toChain);
        setToChain(fromChain);
        setAmount('');
        setRecipient('');
    };

    const handleSwap = async () => {
        if (fromChain === 'ethereum') {
            await handleEthereumToCasper();
        } else {
            await handleCasperToEthereum();
        }
    };

    const handleEthereumToCasper = async () => {
        if (!ethAddress) {
            alert('Please connect your Ethereum wallet');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        const convertedAmount = parseFloat(amount) * exchangeRate;
        if (convertedAmount < 2.5) {
            alert(`Minimum swap amount: ${(2.5 / exchangeRate).toFixed(6)} ETH (equals 2.5 CSPR)`);
            return;
        }
        if (!recipient) {
            alert('Please enter a Casper recipient address');
            return;
        }

        try {
            setIsProcessing(true);
            await writeContract({
                address: CONTRACTS.ethereum.contractAddress,
                abi: ETH_LOCK_VAULT_ABI,
                functionName: 'deposit',
                args: ['casper', recipient],
                value: BigInt(Math.floor(parseFloat(amount) * 1e18)),
                gas: BigInt(300000),
            });
            alert('Swap initiated! Your CSPR will arrive in 30-60 seconds.');
        } catch (error: any) {
            console.error('Swap failed:', error);
            alert(`Swap failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCasperToEthereum = async () => {
        let connectedKey = casperAddress;
        if ((!connectedKey || !casperConnected) && (window as any).CasperWalletProvider) {
            try {
                const provider = (window as any).CasperWalletProvider();
                if (await provider.isConnected()) {
                    connectedKey = await provider.getActivePublicKey();
                    setCasperAddress(connectedKey);
                    setCasperConnected(true);
                }
            } catch (e) {
                console.log('Auto-connect check failed:', e);
            }
        }

        if (!connectedKey) {
            alert('Please connect your Casper wallet first');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        if (parseFloat(amount) < 2.5) {
            alert('Minimum swap amount: 2.5 CSPR');
            return;
        }
        if (!recipient) {
            alert('Please enter an Ethereum recipient address');
            return;
        }

        try {
            setIsProcessing(true);
            const contractHash = import.meta.env.VITE_CASPER_CONTRACT_HASH || 'e13f53fca445eadac96bc577779cf3c16b426832db8ec079308b4c313d1083aa';
            const amountInMotes = (parseFloat(amount) * 1e9).toString();
            const zeroAddress = new CLAccountHash(new Uint8Array(32));
            const runtimeArgs = RuntimeArgs.fromMap({
                to_chain: CLValueBuilder.string('ethereum'),
                token: CLValueBuilder.key(zeroAddress),
                recipient: CLValueBuilder.string(recipient),
                amount: CLValueBuilder.u256(amountInMotes)
            });
            const contractHashBytes = Uint8Array.from(Buffer.from(contractHash, 'hex'));
            const deploy = DeployUtil.makeDeploy(
                new DeployUtil.DeployParams(
                    CLPublicKey.fromHex(connectedKey),
                    'casper-test'
                ),
                DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                    contractHashBytes,
                    'deposit',
                    runtimeArgs
                ),
                DeployUtil.standardPayment(3000000000)
            );
            const deployJSON = DeployUtil.deployToJson(deploy);
            let signedDeployJSON;

            if (clickRef && clickRef.current && (await clickRef.current.isConnected())) {
                signedDeployJSON = await clickRef.current.sign(JSON.stringify(deployJSON), connectedKey);
            } else if ((window as any).CasperWalletProvider) {
                const provider = (window as any).CasperWalletProvider();
                if (await provider.isConnected()) {
                    const res = await provider.sign(JSON.stringify(deployJSON), connectedKey);
                    if (res.cancelled) throw new Error('Signing cancelled');
                    let signatureBytes: Uint8Array;
                    if (typeof res.signature === 'string') {
                        signatureBytes = Uint8Array.from(Buffer.from(res.signature, 'hex'));
                    } else if (res.signature instanceof Uint8Array) {
                        signatureBytes = res.signature;
                    } else {
                        signatureBytes = Uint8Array.from(Buffer.from(res.signature as any));
                    }
                    if (signatureBytes.length === 65) signatureBytes = signatureBytes.slice(1);
                    const signedDeploy = DeployUtil.setSignature(
                        deploy,
                        signatureBytes,
                        CLPublicKey.fromHex(connectedKey)
                    );
                    signedDeployJSON = DeployUtil.deployToJson(signedDeploy);
                } else {
                    throw new Error('Wallet not connected for signing');
                }
            } else {
                throw new Error('No wallet provider found for signing');
            }

            const signedDeploy = DeployUtil.deployFromJson(signedDeployJSON).unwrap();
            const casperService = new CasperServiceByJsonRPC(window.location.origin + '/casper-node');
            const result = await casperService.deploy(signedDeploy);

            if (result.deploy_hash) {
                alert(`Swap initiated! Deploy hash: ${result.deploy_hash}\n\nYour ETH will arrive in 30-60 seconds.`);
            } else {
                throw new Error('No deploy hash returned');
            }

        } catch (error: any) {
            console.error('Swap failed:', error);
            alert(`Swap failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const connectCasperWallet = async () => {
        if (clickRef && clickRef.current) {
            try {
                await clickRef.current.signIn();
                return;
            } catch (err) { console.error(err); }
        }
        if ((window as any).CasperWalletProvider) {
            try {
                const provider = (window as any).CasperWalletProvider();
                await provider.requestConnection();
                const activeKey = await provider.getActivePublicKey();
                setCasperAddress(activeKey);
                setCasperConnected(true);
                return;
            } catch (err: any) {
                alert('Connection failed: ' + err.message);
                return;
            }
        }
        if (typeof window !== 'undefined' && (window as any).csprclick) {
            try {
                await (window as any).csprclick.requestConnection();
                const activeKey = await (window as any).csprclick.getActivePublicKey();
                if (activeKey) { setCasperAddress(activeKey); setCasperConnected(true); }
                return;
            } catch (err: any) { alert('Failed: ' + err.message); return; }
        }
        alert('No compatible Casper wallet detected.');
    };

    // Unused in UI but preserved
    const handleDeployContract = async () => { /* Logic preserved if needed later */ };

    return (
        <Card variant="glass" className="w-full max-w-[480px] border-white/10 shadow-2xl overflow-hidden relative group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-secondary opacity-50 group-hover:opacity-100 transition-opacity" />

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        CasperSwap
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-primary/80 mt-1">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                        Live on Testnet
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white">
                        <Info className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* From Section */}
            <div className="space-y-1">
                <div className="flex justify-between px-1">
                    <span className="text-sm text-gray-400 font-medium">From</span>
                    <span className="text-sm text-gray-400">Balance: --</span>
                </div>
                <div className="bg-black/20 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                        <select
                            value={fromChain}
                            onChange={(e) => {
                                setFromChain(e.target.value);
                                setToChain(e.target.value === 'ethereum' ? 'casper' : 'ethereum');
                            }}
                            className="bg-transparent text-white text-lg font-semibold outline-none cursor-pointer hover:text-primary transition-colors appearance-none pr-4"
                        >
                            <option value="ethereum" className="bg-surface text-white">Ethereum (Sepolia)</option>
                            <option value="casper" className="bg-surface text-white">Casper (Testnet)</option>
                        </select>
                    </div>
                    <div className="flex justify-between items-baseline">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                            className="bg-transparent text-white text-3xl font-bold outline-none w-full placeholder-gray-600"
                            step="0.001"
                        />
                        <span className="text-sm text-gray-500 ml-2 font-medium">
                            {fromChain === 'ethereum' ? 'ETH' : 'CSPR'}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 text-right">
                        ≈ ${(parseFloat(amount || '0') * (fromChain === 'ethereum' ? (exchangeRate * 0.035) : 0.035)).toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Switcher */}
            <div className="flex justify-center -my-3 relative z-10">
                <motion.button
                    whileHover={{ scale: 1.1, rotate: 180 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={switchChains}
                    className="bg-surface border-4 border-[#0F172A] rounded-xl p-2 text-primary shadow-lg hover:text-white hover:bg-primary transition-colors"
                >
                    <ArrowDown className="w-5 h-5" />
                </motion.button>
            </div>

            {/* To Section */}
            <div className="space-y-1 mb-6">
                <div className="flex justify-between px-1">
                    <span className="text-sm text-gray-400 font-medium">To</span>
                    <span className="text-sm text-gray-400">Balance: --</span>
                </div>
                <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-lg font-semibold text-white">
                            {toChain === 'ethereum' ? 'Ethereum (Sepolia)' : 'Casper (Testnet)'}
                        </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                        <span className="text-3xl font-bold text-gray-300">
                            {estimatedOutput === '0' ? '0.0' : estimatedOutput}
                        </span>
                        <span className="text-sm text-gray-500 ml-2 font-medium">
                            {toChain === 'ethereum' ? 'ETH' : 'CSPR'}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 text-right">
                        Exch. Rate: 1 ETH ≈ {exchangeRate.toLocaleString()} CSPR
                    </div>
                </div>
            </div>

            {/* Recipient Input */}
            <div className="mb-6">
                <div className="relative">
                    <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder={`Recipient ${toChain === 'ethereum' ? '0x...' : 'hash-...'}`}
                        className="glass-input w-full pl-10 text-sm"
                    />
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
                {fromChain === 'ethereum' ? (
                    <div className="w-full [&>div]:w-full [&>button]:w-full">
                        <ConnectButton.Custom>
                            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                                const ready = mounted;
                                const connected = ready && account && chain;
                                return (
                                    <div
                                        {...(!ready && {
                                            'aria-hidden': true,
                                            'style': { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
                                        })}
                                    >
                                        {(() => {
                                            if (!connected) {
                                                return (
                                                    <Button onClick={openConnectModal} variant="secondary" className="w-full">
                                                        Connect Ethereum Wallet
                                                    </Button>
                                                );
                                            }
                                            if (chain.unsupported) {
                                                return (
                                                    <Button onClick={openChainModal} variant="destructive" className="w-full">
                                                        Wrong Network
                                                    </Button>
                                                );
                                            }
                                            return (
                                                <div className="flex gap-2">
                                                    <Button onClick={openAccountModal} variant="secondary" className="flex-1 text-sm" type="button">
                                                        {account.displayName}
                                                        {account.displayBalance ? ` (${account.displayBalance})` : ''}
                                                    </Button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            }}
                        </ConnectButton.Custom>
                    </div>
                ) : (
                    <Button
                        onClick={connectCasperWallet}
                        variant={casperAddress ? "secondary" : "secondary"}
                        className="w-full"
                    >
                        <Wallet className="w-4 h-4" />
                        {casperAddress ? `Connected: ${casperAddress.slice(0, 6)}...${casperAddress.slice(-4)}` : 'Connect Casper Wallet'}
                    </Button>
                )}

                <Button
                    onClick={handleSwap}
                    disabled={!amount || parseFloat(amount) <= 0 || isProcessing}
                    isLoading={isProcessing}
                    variant="primary"
                    size="lg"
                    className="w-full"
                >
                    {isProcessing ? 'Swapping...' : 'Swap Assets'}
                </Button>
            </div>

            {/* Footer Rules */}
            <div className="mt-6 flex items-start gap-2 text-xs text-gray-500 px-2">
                <Info className="w-4 h-4 shrink-0 text-primary" />
                <p>
                    Ensure you are on {fromChain === 'ethereum' ? 'Sepolia' : 'Casper Testnet'}.
                    Minimum swap is ≈ 2.5 CSPR.
                </p>
            </div>
        </Card>
    );
};
