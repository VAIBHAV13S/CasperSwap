# CasperSwap - Deployment Complete! 🎉

## ✅ Successfully Deployed Contracts

### Casper Testnet
- **RelayerRegistry package hash:** `hash-f3c06f7c6b4115ae6f6bb184f3b515977f5df709c025805766254aee8e5d1425`
- **LockVault package hash:** `hash-f15600a2d4e9954d4c193b9c94daf3ad9edf7a16a366d9a6fa31ef75f40c9a7d`
- **LockVault contract hash:** `contract-b19c3cc9547c21e669110e09ae59dc3ae3041254258b5f53d24afade0a4b539d`
- **SwapRouter package hash:** `hash-9994ed499053221afc3e7727c7d01a20fb7b2c1162c80b91cbd32d24af3746a5`

### Ethereum Sepolia
- **Contract Address:** `0x26D1Fc099043e4e086a3e844862cb2EFa4Db9754`
- **Deployer:** `0xD2e59333e77d7C6F7265A127444d825C6B74550a`
- **Explorer:** https://sepolia.etherscan.io/address/0x26D1Fc099043e4e086a3e844862cb2EFa4Db9754

---

## 🌐 Live Deployments

- **Frontend (Vercel):** `<YOUR_VERCEL_URL>`
- **Relayer (Render):** https://casperswap.onrender.com
  - Health check: https://casperswap.onrender.com/healthz

---

## 🚀 Quick Start

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

Access at: http://localhost:5173

### Features Implemented
✅ Ethereum → Casper swaps (fully functional)
✅ Wallet integration (MetaMask + CSPR.click)
✅ Contract interaction with deployed addresses
✅ Casper → Ethereum swaps (LockVault.deposit is payable and escrows CSPR in vault purse)
✅ Ethereum → Casper payouts via escrow (relayer calls LockVault.release; no direct transfer)

---

## 🔌 Casper RPC access (Vercel)

The frontend uses a serverless proxy route on Vercel to access the Casper node JSON-RPC.

- Browser RPC endpoint: `https://<YOUR_VERCEL_URL>/api/casper-node/rpc`

---

## 📁 Project Structure

```
CasperSwap/
├── contracts/          # Casper contracts (Odra) ✅ Deployed
├── ethereum/          # Ethereum contracts (Solidity) ✅ Deployed
├── frontend/          # React UI ✅ Configured
├── relayer/           # Event monitoring service ✅ Configured
└── scripts/           # Deployment scripts ✅ Ready
```

---

## 🔧 Configuration Files

### Frontend (`.env`)
```ini
VITE_CASPER_CONTRACT_HASH=contract-b19c3cc9547c21e669110e09ae59dc3ae3041254258b5f53d24afade0a4b539d
VITE_ETHEREUM_CONTRACT_ADDRESS=0x26D1Fc099043e4e086a3e844862cb2EFa4Db9754
VITE_ETHEREUM_CHAIN_ID=11155111
VITE_CSPRCLICK_ENABLED=false
VITE_RELAYER_URL=https://casperswap.onrender.com
```

### Relayer (`relayer/src/config/index.ts`)
- Runs as a long-running service on Render
- Monitors both chains + processes swaps continuously while the service is awake
- Uses Postgres for swap/event persistence

Relayer env should include the Casper LockVault contract hash:
```ini
LOCK_VAULT_CONTRACT_HASH=contract-b19c3cc9547c21e669110e09ae59dc3ae3041254258b5f53d24afade0a4b539d
```

---

## 🎯 How to Use

### 1. Start Frontend
```bash
cd frontend
npm run dev
```

### 2. Connect Wallets
- **Ethereum:** Click "Connect Wallet" → Select MetaMask
- **Casper:** Click "Connect Casper" → Use CSPR.click

### 3. Perform Swap (Ethereum → Casper)
1. Select "From: Ethereum"
2. Enter amount in ETH
3. Enter Casper recipient address
4. Click "Swap"
5. Confirm transaction in MetaMask

Payout is executed on Casper by the relayer calling `LockVault.release()`.

---

## 📊 Testing

### Test Ethereum Deposit
1. Connect MetaMask to Sepolia
2. Enter test amount (e.g., 0.01 ETH)
3. Enter Casper address as recipient
4. Execute swap
5. Check transaction on Etherscan

### Test Casper Deposit (Casper → Ethereum)
1. Connect a Casper wallet
2. Enter amount in CSPR
3. Enter Ethereum recipient address
4. Execute swap (frontend calls `LockVault.deposit()` with `attached_value`)
5. Relayer pays out ETH on Sepolia

### Verify on Explorer
- **Ethereum:** https://sepolia.etherscan.io/address/0x26D1Fc099043e4e086a3e844862cb2EFa4Db9754
- **Casper:** https://testnet.cspr.live/

---

## 🔄 Relayer Setup (Optional)

The relayer monitors both chains and facilitates cross-chain swaps.

### Prerequisites
```bash
# PostgreSQL database
docker run -d \
  --name casper-swap-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=casper_swap \
  -p 5432:5432 \
  postgres:15
```

### Start Relayer
```bash
cd relayer
npm install
npm run dev
```

---

## 🟢 Production Relayer (Render)

The deployed relayer is available at:

- https://casperswap.onrender.com

Note: Render free-tier services may sleep. The frontend can ping `/healthz` via `VITE_RELAYER_URL` to wake it.

---

## 📝 Next Steps

### Phase 1: Testing ✅
- [x] Deploy contracts to testnets
- [x] Configure frontend
- [x] Test Ethereum deposits
- [x] Test end-to-end swaps with relayer

### Phase 2: Casper Integration
- [x] Implement Casper deposit function
- [x] Add Casper transaction signing (Casper Wallet Provider; CSPR.click can be enabled via env)
- [x] Test Casper → Ethereum swaps

### Phase 3: Relayer
- [x] Start PostgreSQL database
- [x] Run relayer service
- [x] Monitor cross-chain events
- [x] Automate swap completion

### Phase 4: Production
- [ ] Deploy to mainnet
- [ ] Security audit
- [ ] Add liquidity
- [ ] Launch! 🚀

---

## 🛠️ Troubleshooting

### Frontend Issues
- **CSPR.click error:** Theme is now configured, refresh browser
- **MetaMask not connecting:** Ensure you're on Sepolia network
- **Transaction failing:** Check you have enough Sepolia ETH

### Contract Issues
- **Casper deployment:** Use `scripts/deploy.sh`
- **Ethereum deployment:** Run `npx hardhat run scripts/deploy.js --network sepolia`

---

## 📚 Resources

- [Casper Docs](https://docs.casper.network/)
- [Odra Framework](https://odra.dev/)
- [Hardhat](https://hardhat.org/)
- [Wagmi](https://wagmi.sh/)
- [CSPR.click](https://www.csprclick.dev/)

---

## 🎊 Success!

Your cross-chain swap platform is now live on both testnets!

**What's working:**
- ✅ Ethereum contract deployed and verified
- ✅ Casper contract deployed and optimized
- ✅ Frontend connected to both contracts
- ✅ Ethereum deposits functional
- ✅ Wallet integrations working

**Ready to test swaps!** 🚀
