import axios from 'axios';

export class PriceOracle {
    private ethPrice: number = 0;
    private csprPrice: number = 0;
    private lastUpdate: number = 0;
    private updateInterval: number = 60000; // Update every 60 seconds
    private lastErrorLogAt: number = 0;
    private isUpdating: boolean = false;
    private consecutiveFailures: number = 0;
    private nextAllowedUpdateAt: number = 0;

    constructor() {
        this.updatePrices();
        // Auto-update prices every minute
        setInterval(() => this.updatePrices(), this.updateInterval);
    }

    private async updatePrices() {
        const now = Date.now();
        if (this.isUpdating) return;
        if (now < this.nextAllowedUpdateAt) return;

        this.isUpdating = true;
        try {
            const response = await axios.get(
                'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,casper-network&vs_currencies=usd'
            );

            const ethUsd = Number(response.data?.ethereum?.usd);
            const csprUsd = Number(response.data?.['casper-network']?.usd);

            if (!Number.isFinite(ethUsd) || !Number.isFinite(csprUsd) || csprUsd <= 0) {
                throw new Error('Invalid price data');
            }

            this.ethPrice = ethUsd;
            this.csprPrice = csprUsd;

            this.lastUpdate = Date.now();
            this.consecutiveFailures = 0;
            this.nextAllowedUpdateAt = 0;

            console.log('📊 Price Update:');
            console.log(`   ETH: $${this.ethPrice.toFixed(2)}`);
            console.log(`   CSPR: $${this.csprPrice.toFixed(4)}`);
            console.log(`   Rate: 1 ETH = ${this.getExchangeRate().toFixed(2)} CSPR`);
        } catch (err: any) {
            const status = err?.response?.status;

            // Exponential backoff (with jitter) for rate-limit / transient failures.
            // Don't spam CoinGecko if we're being throttled.
            const isRateLimit = status === 429;
            const isTransient = isRateLimit || (typeof status === 'number' && status >= 500) || !status;

            if (isTransient) {
                this.consecutiveFailures += 1;
                const baseDelay = 30_000; // 30s
                const maxDelay = 10 * 60_000; // 10m
                const expDelay = Math.min(maxDelay, baseDelay * Math.pow(2, Math.min(this.consecutiveFailures, 6)));
                const jitter = Math.floor(Math.random() * 5_000);
                this.nextAllowedUpdateAt = Date.now() + expDelay + jitter;
            }

            const now2 = Date.now();
            if (now2 - this.lastErrorLogAt > 60000) {
                const status = err?.response?.status;
                const details = status ? `${err.message} (status ${status})` : err.message;
                console.error('⚠️  Price update failed:', details);
                if (this.nextAllowedUpdateAt > 0) {
                    const waitSec = Math.max(0, Math.round((this.nextAllowedUpdateAt - Date.now()) / 1000));
                    console.error(`   Next price update attempt in ~${waitSec}s`);
                }
                this.lastErrorLogAt = now2;
            }

            if (this.ethPrice === 0) this.ethPrice = 3000;
            if (this.csprPrice === 0) this.csprPrice = 0.0046;
        } finally {
            this.isUpdating = false;
        }
    }

    public getExchangeRate(): number {
        // Calculate how many CSPR equals 1 ETH
        if (this.csprPrice === 0) return 1; // Fallback to 1:1
        return this.ethPrice / this.csprPrice;
    }

    public convertEthToCspr(ethAmount: string): string {
        const ethAmountNum = parseFloat(ethAmount);
        const rate = this.getExchangeRate();
        const csprAmount = ethAmountNum * rate;

        // Convert to motes (9 decimals)
        const motes = BigInt(Math.floor(csprAmount * 1e9));
        return motes.toString();
    }

    public convertCsprToEth(csprAmount: string): string {
        const csprAmountNum = parseFloat(csprAmount);
        const rate = this.getExchangeRate();
        const ethAmount = csprAmountNum / rate;

        // Convert to Wei (18 decimals)
        const wei = BigInt(Math.floor(ethAmount * 1e18));
        return wei.toString();
    }

    public getPrices() {
        return {
            eth: this.ethPrice,
            cspr: this.csprPrice,
            rate: this.getExchangeRate(),
            lastUpdate: new Date(this.lastUpdate).toISOString()
        };
    }
}
