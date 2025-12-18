import React from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { ClickProvider } from '@make-software/csprclick-react';
import '@rainbow-me/rainbowkit/styles.css';

// Wagmi Config
const config = getDefaultConfig({
    appName: 'CasperChainSwap',
    projectId: 'YOUR_PROJECT_ID',
    chains: [sepolia],
    transports: {
        [sepolia.id]: http(),
    },
});

const queryClient = new QueryClient();

const clickOptions = {
    appName: 'CasperSwap',
    appId: 'csprclick-template',
    contentMode: 'iframe',
    providers: [
        'casper-wallet',
        'casper-signer',
        'ledger',
        'metamask-snap'
    ]
};

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <ClickProvider options={clickOptions}>
            <WagmiProvider config={config}>
                <QueryClientProvider client={queryClient}>
                    <RainbowKitProvider>
                        {children}
                    </RainbowKitProvider>
                </QueryClientProvider>
            </WagmiProvider>
        </ClickProvider>
    );
};
