import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useClickRef } from '@make-software/csprclick-react';
import { CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, CLAccountHash, CasperServiceByJsonRPC } from 'casper-js-sdk';
import { CONTRACTS, ETH_LOCK_VAULT_ABI } from '../lib/contracts';

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
        // Check periodically or when ref changes
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

                if (!res.ok) {
                    throw new Error('Failed to fetch prices');
                }

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
        // Check if wallet is connected (CSPR.click or Direct)
        let connectedKey = casperAddress;

        // If not connected, try to connect first
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

            // Contract hash from environment
            const contractHash = import.meta.env.VITE_CASPER_CONTRACT_HASH || 'e13f53fca445eadac96bc577779cf3c16b426832db8ec079308b4c313d1083aa';
            const amountInMotes = (parseFloat(amount) * 1e9).toString();

            // Use CLAccountHash for zero address (token argument)
            const zeroAddress = new CLAccountHash(new Uint8Array(32));

            const runtimeArgs = RuntimeArgs.fromMap({
                to_chain: CLValueBuilder.string('ethereum'),
                token: CLValueBuilder.key(zeroAddress),
                recipient: CLValueBuilder.string(recipient),
                amount: CLValueBuilder.u256(amountInMotes)
            });

            // Use Buffer (polyfilled) for hex decoding
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

            // 1. Try Signing with CSPR.click SDK
            if (clickRef && clickRef.current && (await clickRef.current.isConnected())) {
                signedDeployJSON = await clickRef.current.sign(JSON.stringify(deployJSON), connectedKey);
            }
            // 2. Try Signing with CasperWalletProvider (Direct Fallback)
            else if ((window as any).CasperWalletProvider) {
                const provider = (window as any).CasperWalletProvider();
                if (await provider.isConnected()) {
                    const res = await provider.sign(JSON.stringify(deployJSON), connectedKey);
                    if (res.cancelled) {
                        throw new Error('Signing cancelled');
                    }

                    // Handle signature result which might be string or bytes
                    let signatureBytes: Uint8Array;
                    if (typeof res.signature === 'string') {
                        signatureBytes = Uint8Array.from(Buffer.from(res.signature, 'hex'));
                    } else if (res.signature instanceof Uint8Array) {
                        signatureBytes = res.signature;
                    } else {
                        // Attempt fallback conversion if it's an object/array
                        // Note: Using Buffer.from handles both array-like objects and buffers
                        signatureBytes = Uint8Array.from(Buffer.from(res.signature as any));
                    }
                    // Fix: Casper Wallet sometimes returns the tag + signature (65 bytes).
                    // We only need the raw signature (64 bytes) for setSignature.
                    if (signatureBytes.length === 65) {
                        console.log("Stripping signature tag (65 -> 64 bytes)");
                        signatureBytes = signatureBytes.slice(1);
                    }

                    console.log("Signature length:", signatureBytes.length);
                    console.log("Signature (hex):", Buffer.from(signatureBytes).toString('hex'));
                    console.log("Connected Key:", connectedKey);

                    const signedDeploy = DeployUtil.setSignature(
                        deploy,
                        signatureBytes,
                        CLPublicKey.fromHex(connectedKey)
                    );

                    // Verify the deploy locally if possible (sanity check)
                    console.log("Signed Deploy JSON:", JSON.stringify(DeployUtil.deployToJson(signedDeploy), null, 2));

                    signedDeployJSON = DeployUtil.deployToJson(signedDeploy);
                } else {
                    throw new Error('Wallet not connected for signing');
                }
            } else {
                throw new Error('No wallet provider found for signing');
            }

            // Send to network
            const signedDeploy = DeployUtil.deployFromJson(signedDeployJSON).unwrap();

            // Use CasperServiceByJsonRPC to handle the rpc call via proxy
            const casperService = new CasperServiceByJsonRPC(window.location.origin + '/casper-node');

            // casper-js-sdk v2+ deploy returns the hash string directly promise
            // or throws error
            let deployHash: string;
            try {
                console.log("Submitting deploy...");
                const result = await casperService.deploy(signedDeploy);
                deployHash = result.deploy_hash;
                console.log("Deploy Success! Hash:", deployHash);
            } catch (err: any) {
                // Fallback if return type differs or fails
                console.error("Service deploy error:", err);
                // Try to log the detailed error if available
                if (err.message) console.error("Error Message:", err.message);
                if (err.data) console.error("Error Data:", JSON.stringify(err.data, null, 2));
                throw err;
            }

            if (deployHash) {
                alert(`Swap initiated! Deploy hash: ${deployHash}\n\nYour ETH will arrive in 30-60 seconds.`);
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
        console.log('Connect clicked');

        // 1. Try SDK (CSPR.click)
        if (clickRef && clickRef.current) {
            try {
                console.log('Attempting SDK signIn...');
                await clickRef.current.signIn();
                return;
            } catch (err: any) {
                console.error('SDK signIn failed:', err);
            }
        }

        // 2. Try Direct Casper Wallet (New Extension)
        if ((window as any).CasperWalletProvider) {
            console.log('Found CasperWalletProvider');
            try {
                const provider = (window as any).CasperWalletProvider();
                const isConnected = await provider.isConnected();

                if (isConnected) {
                    const activeKey = await provider.getActivePublicKey();
                    setCasperAddress(activeKey);
                    setCasperConnected(true);
                    return;
                }

                await provider.requestConnection();
                const activeKey = await provider.getActivePublicKey();
                setCasperAddress(activeKey);
                setCasperConnected(true);
                return;
            } catch (err: any) {
                console.error('CasperWalletProvider failed:', err);
                alert('Casper Wallet connection failed: ' + err.message);
                return;
            }
        }

        // 3. Try Legacy/Window Helper (CSPR.click direct window object)
        if (typeof window !== 'undefined' && (window as any).csprclick) {
            console.log('Falling back to window.csprclick');
            try {
                await (window as any).csprclick.requestConnection();
                const activeKey = await (window as any).csprclick.getActivePublicKey();
                if (activeKey) {
                    setCasperAddress(activeKey);
                    setCasperConnected(true);
                }
                return;
            } catch (err: any) {
                console.error('Window fallback failed:', err);
                alert('Failed to connect: ' + (err.message || 'Unknown error'));
                return;
            }
        }

        alert('No compatible Casper wallet detected. Please install Casper Wallet or CSPR.click.');
    };

    const handleDeployContract = async () => {
        if (!casperAddress) {
            alert('Please connect Casper wallet first');
            return;
        }

        try {
            setIsProcessing(true);
            console.log("Fetching WASM...");
            const wasmResponse = await fetch('/casper_swap.wasm');
            if (!wasmResponse.ok) throw new Error('Failed to load WASM file');
            const wasmBytes = new Uint8Array(await wasmResponse.arrayBuffer());

            console.log("Creating deploy...");
            const deployParams = new DeployUtil.DeployParams(
                CLPublicKey.fromHex(casperAddress),
                'casper-test',
                1,
                1800000
            );

            const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
                wasmBytes,
                RuntimeArgs.fromMap({})
            );

            const payment = DeployUtil.standardPayment(200000000000); // 200 CSPR

            const deploy = DeployUtil.makeDeploy(
                deployParams,
                session,
                payment
            );

            const deployJSON = DeployUtil.deployToJson(deploy);
            let signedDeployJSON;

            // Sign
            if (clickRef && clickRef.current && (await clickRef.current.isConnected())) {
                signedDeployJSON = await clickRef.current.sign(JSON.stringify(deployJSON), casperAddress);
            } else if ((window as any).CasperWalletProvider) {
                const provider = (window as any).CasperWalletProvider();
                const res = await provider.sign(JSON.stringify(deployJSON), casperAddress);
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
                    CLPublicKey.fromHex(casperAddress)
                );
                signedDeployJSON = DeployUtil.deployToJson(signedDeploy);
            } else {
                throw new Error('No wallet found');
            }

            // Send
            const signedDeploy = DeployUtil.deployFromJson(signedDeployJSON).unwrap();
            const casperService = new CasperServiceByJsonRPC(window.location.origin + '/casper-node');
            const result = await casperService.deploy(signedDeploy);

            console.log("Deploy Result:", result);
            alert(`Contract Deployed! Hash: ${result.deploy_hash}\n\nPlease verify in explorer and update .env`);

        } catch (error: any) {
            console.error('Deploy failed:', error);
            alert('Deploy failed: ' + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/20 shadow-2xl">
                <h1 className="text-4xl font-bold text-white mb-8 text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    CasperSwap
                </h1>

                {/* Exchange Rate Display */}
                <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="text-sm text-gray-300 mb-1">Exchange Rate</div>
                    <div className="text-lg font-bold text-white">
                        1 ETH ≈ {exchangeRate.toLocaleString()} CSPR
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Live market rate • Updates every 60s
                    </div>
                </div>

                {/* From Chain */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">From</label>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <select
                            value={fromChain}
                            onChange={(e) => {
                                setFromChain(e.target.value);
                                setToChain(e.target.value === 'ethereum' ? 'casper' : 'ethereum');
                            }}
                            className="bg-transparent text-white text-lg font-semibold outline-none w-full mb-3"
                        >
                            <option value="ethereum">Ethereum (Sepolia)</option>
                            <option value="casper">Casper (Testnet)</option>
                        </select>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                            className="bg-transparent text-white text-3xl font-bold outline-none w-full"
                            step="0.001"
                        />
                        <div className="text-sm text-gray-400 mt-2">
                            {fromChain === 'ethereum' ? 'ETH' : 'CSPR'}
                        </div>
                    </div>
                </div>

                {/* Swap Direction Button */}
                <div className="flex justify-center -my-2 relative z-10">
                    <button
                        onClick={switchChains}
                        className="bg-white/10 hover:bg-white/20 rounded-full p-3 border border-white/20 transition-all"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                    </button>
                </div>

                {/* To Chain */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">To</label>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="text-lg font-semibold text-white mb-3">
                            {toChain === 'ethereum' ? 'Ethereum (Sepolia)' : 'Casper (Testnet)'}
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                            {estimatedOutput}
                        </div>
                        <div className="text-sm text-gray-400">
                            {toChain === 'ethereum' ? 'ETH' : 'CSPR'}
                        </div>
                    </div>
                </div>

                {/* Recipient Address */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Recipient Address ({toChain === 'ethereum' ? 'Ethereum' : 'Casper'})
                    </label>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <input
                            type="text"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder={toChain === 'ethereum' ? '0x...' : '01...'}
                            className="bg-transparent text-white text-sm outline-none w-full"
                        />
                    </div>
                </div>

                {/* Wallet Connection */}
                <div className="flex flex-col gap-3 mb-6">
                    {fromChain === 'ethereum' ? (
                        <ConnectButton showBalance={false} chainStatus="none" />
                    ) : (
                        <button
                            onClick={connectCasperWallet}
                            className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold py-3 px-4 rounded-xl transition-all"
                        >
                            {casperAddress ? `Connected: ${casperAddress.slice(0, 10)}...` : 'Connect Casper Wallet'}
                        </button>
                    )}
                </div>

                {/* Swap Button */}
                <button
                    onClick={handleSwap}
                    disabled={!amount || parseFloat(amount) <= 0 || isProcessing}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 rounded-xl transition-all disabled:cursor-not-allowed shadow-lg"
                >
                    {isProcessing ? 'Processing...' : `Swap ${fromChain === 'ethereum' ? 'ETH → CSPR' : 'CSPR → ETH'}`}
                </button>

                {/* Info */}
                <div className="mt-6 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <div className="text-xs text-blue-300">
                        <div className="font-semibold mb-1">ℹ️ Important:</div>
                        <ul className="list-disc list-inside space-y-1">
                            <li>Minimum swap: {fromChain === 'ethereum' ? `${(2.5 / exchangeRate).toFixed(6)} ETH` : '2.5 CSPR'} (≈ 2.5 CSPR)</li>
                            <li>Estimated time: 30-60 seconds</li>
                            <li>Exchange rate updates every minute</li>
                            {fromChain === 'casper' && <li>Requires CSPR.click wallet extension</li>}
                        </ul>
                    </div>
                </div>


            </div>
        </div>
    );
};
