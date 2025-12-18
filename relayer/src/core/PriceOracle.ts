import axios from 'axios';

export class PriceOracle {
    private ethPrice: number = 0;
    private csprPrice: number = 0;
    private lastUpdate: number = 0;
    private updateInterval: number = 60000; // Update every 60 seconds
    private lastErrorLogAt: number = 0;

    constructor() {
        this.updatePrices();
        // Auto-update prices every minute
        setInterval(() => this.updatePrices(), this.updateInterval);
    }

    private async updatePrices() {
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

            console.log('📊 Price Update:');
            console.log(`   ETH: $${this.ethPrice.toFixed(2)}`);
            console.log(`   CSPR: $${this.csprPrice.toFixed(4)}`);
            console.log(`   Rate: 1 ETH = ${this.getExchangeRate().toFixed(2)} CSPR`);
        } catch (err: any) {
            const now = Date.now();
            if (now - this.lastErrorLogAt > 60000) {
                const status = err?.response?.status;
                const details = status ? `${err.message} (status ${status})` : err.message;
                console.error('⚠️  Price update failed:', details);
                this.lastErrorLogAt = now;
            }

            if (this.ethPrice === 0) this.ethPrice = 3000;
            if (this.csprPrice === 0) this.csprPrice = 0.0046;
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
