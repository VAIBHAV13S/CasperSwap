import { useEffect, useRef } from 'react';
import { WalletProvider } from './providers/WalletProvider';
import { SwapInterface } from './components/SwapInterface';

function App() {
    const didWakeRef = useRef(false);

    useEffect(() => {
        if (didWakeRef.current) return;
        didWakeRef.current = true;

        const base = import.meta.env.VITE_RELAYER_URL as string | undefined;
        if (!base) return;

        const url = `${base.replace(/\/$/, '')}/healthz`;
        fetch(url, { method: 'GET', mode: 'no-cors', keepalive: true }).catch(() => {});
    }, []);

    return (
        <WalletProvider>
            <main className="relative min-h-screen w-full overflow-hidden flex flex-col items-center justify-center">
                {/* Background ambient effects */}
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 rounded-full blur-[120px] animate-pulse-slow delay-1000 pointer-events-none" />

                <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center">
                    <SwapInterface />
                </div>
            </main>
        </WalletProvider>
    );
}

export default App;
