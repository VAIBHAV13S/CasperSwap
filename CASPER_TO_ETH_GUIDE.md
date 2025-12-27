# Casper → Ethereum Swap Guide

## 📦 Prerequisites

### 1. Install CSPR.click Wallet
- **Chrome/Brave:** https://chrome.google.com/webstore/detail/csprclick/mdjjlkdkdgdlkjlkjlkjlkjlkjlkjlkj
- **Firefox:** https://addons.mozilla.org/en-US/firefox/addon/cspr-click/

### 2. Create/Import Wallet
1. Click the CSPR.click extension icon
2. Create a new wallet or import existing
3. Save your seed phrase securely
4. Set a password

### 3. Get Testnet CSPR
1. Go to: https://testnet.cspr.live/tools/faucet
2. Enter your Casper address (from CSPR.click)
3. Request testnet CSPR
4. Wait for confirmation

---

## 🔄 How to Swap CSPR → ETH

### Step 1: Open CasperSwap
Navigate to your frontend: `http://localhost:5173`

### Step 2: Select Swap Direction
- Click the swap direction button (arrows icon)
- Or select "Casper (Testnet)" from the dropdown
- Destination should show "Ethereum (Sepolia)"

### Step 3: Connect Casper Wallet
- Click "Connect Casper Wallet" button
- CSPR.click popup will appear
- Click "Connect" to authorize
- Your address will show: "Connected: 014e5be56..."

### Step 4: Enter Swap Details
```
Amount: 100 CSPR (minimum 2.5 CSPR)
Recipient: 0xYourEthereumAddress
```

### Step 5: Review Exchange Rate
```
Exchange Rate: 1 ETH ≈ 75,000 CSPR
You send: 100 CSPR
You receive: ~0.00133 ETH
```

### Step 6: Initiate Swap
- Click "Swap CSPR → ETH" button
- CSPR.click will open for signing
- Review the deploy details:
  - Contract: LockVault (`VITE_CASPER_CONTRACT_HASH`)
  - Entry Point: deposit
  - Payment: 3 CSPR (gas)
- Click "Sign" to approve

### Step 7: Wait for Confirmation
```
✅ Swap initiated!
Deploy hash: a97466ba29859dc4f3832e2dcc0f91d4c8676339a2c1622001a4b272b8184a27

Your ETH will arrive in 30-60 seconds.
```

### Step 8: Track Your Swap
- **Casper Explorer:** https://testnet.cspr.live/deploy/[DEPLOY_HASH]
- **Relayer Logs:** Watch for "Processing Swap" message
- **Ethereum Explorer:** https://sepolia.etherscan.io/tx/[TX_HASH]

---

## 🔍 What Happens Behind the Scenes

```
1. User signs deploy with CSPR.click
   ↓
2. Deploy sent to Casper network
   ↓
3. LockVault escrows the deposited CSPR in a vault purse
   ↓
4. Contract emits DepositInitiated event
   ↓
5. Relayer detects event (polling every 30s)
   ↓
6. Relayer converts: 100 CSPR → 0.00133 ETH
   ↓
7. Relayer sends 0.00133 ETH to recipient
   ↓
8. User receives ETH on Ethereum!
```

---

## ⚠️ Troubleshooting

### "Please install CSPR.click wallet extension"
- Install from: https://cspr.click
- Refresh the page after installation

### "Failed to connect Casper wallet"
- Make sure CSPR.click is unlocked
- Try disconnecting and reconnecting
- Check browser console for errors

### "Minimum swap amount: 2.5 CSPR"
- Casper requires minimum 2.5 CSPR for transfers
- Increase your swap amount

### "Deploy failed"
- Check your CSPR balance (need amount + 3 CSPR for gas)
- Verify `VITE_CASPER_CONTRACT_HASH` in `frontend/.env` (current: `contract-0ddc0291717a1913e67fe4e1d5b020396051e0ed37aba939860c1b781c02a1c0`)
- Check Casper network status

### Swap not processing
- Wait up to 60 seconds (relayer polls every 30s)
- Check relayer logs for errors
- Verify deploy on Casper explorer

---

## 📊 Gas Costs

**Casper Side:**
- Contract call: ~3 CSPR
- Total cost: Amount + 3 CSPR

**Ethereum Side:**
- Relayer pays gas (no cost to user)
- Typical: ~0.001 ETH gas fee

---

## 🎯 Example Swap

```
Scenario: Swap 100 CSPR for ETH

Input:
- Amount: 100 CSPR
- Recipient: 0xD2e59333e77d7C6F7265A127444d825C6B74550a
- Exchange Rate: 1 ETH = 75,000 CSPR

Calculation:
- 100 CSPR ÷ 75,000 = 0.00133 ETH

Costs:
- Casper gas: 3 CSPR
- Total deducted: 103 CSPR

Result:
- Casper contract: +100 CSPR (locked)
- User receives: 0.00133 ETH
- Time: ~45 seconds
```

---

## ✅ Success Checklist

Before swapping, ensure:
- [ ] CSPR.click wallet installed and unlocked
- [ ] Wallet has sufficient CSPR (amount + 3 CSPR for gas)
- [ ] Correct Ethereum recipient address
- [ ] Amount ≥ 2.5 CSPR
- [ ] Relayer service is running
- [ ] Frontend is connected to correct network

---

## 🔗 Useful Links

- **CSPR.click:** https://cspr.click
- **Casper Testnet Faucet:** https://testnet.cspr.live/tools/faucet
- **Casper Explorer:** https://testnet.cspr.live
- **Ethereum Sepolia Explorer:** https://sepolia.etherscan.io
- **Casper Explorer:** https://testnet.cspr.live

---

**Your Casper → Ethereum swaps are now fully functional!** 🎉
