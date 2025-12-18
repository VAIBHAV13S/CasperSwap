import { WalletProvider } from './providers/WalletProvider';
import { SwapInterface } from './components/SwapInterface';

function App() {
    return (
        <WalletProvider>
            <div className="min-h-screen bg-background text-white p-4">
                <SwapInterface />
            </div>
        </WalletProvider>
    );
}

export default App;
