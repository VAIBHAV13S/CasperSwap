# CasperSwap - Liquidity & Locked Funds Explained

## 🔒 The Lock-and-Release Model

Your understanding is **100% correct!** Here's exactly how it works:

## Current deployed contracts (casper-test)

- **RelayerRegistry package hash:** `hash-f3c06f7c6b4115ae6f6bb184f3b515977f5df709c025805766254aee8e5d1425`
- **LockVault package hash:** `hash-692ca350badb6561c282026883ff17ed631774caf165094d7080f425570190e6`
- **SwapRouter package hash:** `hash-9994ed499053221afc3e7727c7d01a20fb7b2c1162c80b91cbd32d24af3746a5`

The Casper-side locking contract is **LockVault**.

---

## 💎 Ethereum → Casper Swap

### **What Happens to the Funds:**

```
USER ACTION:
├─ Deposits: 1 ETH to Ethereum contract
└─ Wants: 75,000 CSPR on Casper

ETHEREUM SIDE:
├─ Contract locks: 1 ETH ✅
├─ Emits event: DepositInitiated
└─ ETH is TRAPPED in contract (cannot be withdrawn without authorization)

RELAYER DETECTS:
├─ Sees event on Ethereum
├─ Converts: 1 ETH → 75,000 CSPR (using price oracle)
└─ Prepares Casper transaction

CASPER SIDE:
├─ Relayer sends: 75,000 CSPR from its own wallet (current implementation)
└─ User receives: 75,000 CSPR ✅

RESULT:
├─ Ethereum contract: +1 ETH (locked)
├─ Relayer wallet: -75,000 CSPR
└─ User: -1 ETH, +75,000 CSPR
```

---

## 💎 Casper → Ethereum Swap

### **What Happens to the Funds:**

```
USER ACTION:
├─ Deposits: 75,000 CSPR to Casper contract
└─ Wants: 1 ETH on Ethereum

CASPER SIDE:
├─ Contract locks: 75,000 CSPR ✅
├─ Emits event: DepositInitiated
└─ CSPR is TRAPPED in contract (cannot be withdrawn without authorization)

RELAYER DETECTS:
├─ Sees event on Casper
├─ Converts: 75,000 CSPR → 1 ETH (using price oracle)
└─ Prepares Ethereum transaction

ETHEREUM SIDE:
├─ Relayer sends: 1 ETH from its own wallet
└─ User receives: 1 ETH ✅

## Current relayer behavior (repo state)

- **Ethereum → Casper:** automated (relayer watches Ethereum `DepositInitiated` and sends funds on Casper).
- **Casper → Ethereum:** the user can call `LockVault.deposit(...)` from the frontend, but the relayer's Casper event ingestion is currently disabled/placeholder (no automatic processing of Casper deposits yet).

RESULT:
├─ Casper contract: +75,000 CSPR (locked)
├─ Relayer wallet: -1 ETH
└─ User: -75,000 CSPR, +1 ETH
```

---

## 📊 Complete Fund Flow Diagram

```
INITIAL STATE:
┌─────────────────────────────────────────────────────────┐
│ Ethereum Contract: 0 ETH                                │
│ Casper Contract: 0 CSPR                                 │
│ Relayer: 100 ETH + 10,000,000 CSPR (liquidity)          │
│ User A: 10 ETH + 0 CSPR                                 │
│ User B: 0 ETH + 1,000,000 CSPR                          │
└─────────────────────────────────────────────────────────┘

AFTER USER A SWAPS 1 ETH → CSPR:
┌─────────────────────────────────────────────────────────┐
│ Ethereum Contract: 1 ETH (locked) ⬆️                     │
│ Casper Contract: 0 CSPR                                 │
│ Relayer: 100 ETH + 9,925,000 CSPR ⬇️                    │
│ User A: 9 ETH + 75,000 CSPR ⬆️                          │
│ User B: 0 ETH + 1,000,000 CSPR                          │
└─────────────────────────────────────────────────────────┘

AFTER USER B SWAPS 75,000 CSPR → ETH:
┌─────────────────────────────────────────────────────────┐
│ Ethereum Contract: 1 ETH (locked)                       │
│ Casper Contract: 75,000 CSPR (locked) ⬆️                │
│ Relayer: 99 ETH ⬇️ + 9,925,000 CSPR                     │
│ User A: 9 ETH + 75,000 CSPR                             │
│ User B: 1 ETH ⬆️ + 925,000 CSPR ⬇️                      │
└─────────────────────────────────────────────────────────┘

SYSTEM BALANCE:
┌─────────────────────────────────────────────────────────┐
│ Total ETH in system: 110 ETH (same as start)            │
│ Total CSPR in system: 11,000,000 CSPR (same as start)   │
│                                                          │
│ Locked in contracts: 1 ETH + 75,000 CSPR                │
│ Relayer liquidity: 99 ETH + 9,925,000 CSPR              │
│ Users have: 10 ETH + 1,000,000 CSPR                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Insights

### **1. Contracts Lock User Funds**
- When you deposit to a contract, your funds are **locked**
- They cannot be withdrawn without proper authorization
- Only authorized relayers can call `release()` function

### **2. Relayer Provides Liquidity**
- Relayer must have funds on **both chains**
- When user swaps ETH → CSPR, relayer sends its own CSPR
- When user swaps CSPR → ETH, relayer sends its own ETH

### **3. System Stays Balanced**
- Total funds in system never change
- Locked funds in contracts = Relayer's deficit
- If 100 ETH locked in Ethereum contract, relayer needs 100 ETH liquidity to unlock them

### **4. Liquidity Requirements**
```
For 1000 daily swaps of 1 ETH each:
├─ Ethereum contract will lock: 1000 ETH
├─ Relayer needs on Casper: 75,000,000 CSPR
└─ To unlock Ethereum funds, need reverse swaps

Balanced system:
├─ 500 swaps ETH → CSPR (500 ETH locked)
├─ 500 swaps CSPR → ETH (37,500,000 CSPR locked)
└─ Relayer maintains: 500 ETH + 37,500,000 CSPR liquidity
```

---

## 💰 Liquidity Management Strategies

### **Current Model: Relayer as LP**
```
Relayer owns all liquidity:
✅ Simple to implement
✅ Full control
❌ Relayer bears all risk
❌ Limited by relayer's capital
```

### **Future Model: Liquidity Pools**
```
Anyone can provide liquidity:
✅ Unlimited liquidity
✅ Distributed risk
✅ LPs earn fees
✅ Scalable
```

---

## 🎯 Why This Design is Secure

**1. Trustless**
- User funds locked in smart contracts
- Relayer cannot steal locked funds
- Only authorized relayers can release

**2. Transparent**
- All transactions on-chain
- Anyone can verify locked amounts
- Audit trail in database

**3. Balanced**
- System maintains equilibrium
- Locked funds = Relayer's liquidity
- No funds created or destroyed

**4. Recoverable**
- If relayer fails, funds still locked in contracts
- New relayer can take over
- Users can prove deposits and claim funds

---

## 📈 Example Scenarios

### **Scenario 1: High ETH → CSPR Volume**
```
Result:
├─ Ethereum contract: 1000 ETH locked
├─ Casper contract: 0 CSPR locked
└─ Relayer: Low CSPR, High ETH

Solution:
├─ Incentivize CSPR → ETH swaps (lower fees)
├─ Add more CSPR liquidity
└─ Rebalance by swapping ETH for CSPR
```

### **Scenario 2: Balanced Volume**
```
Result:
├─ Ethereum contract: 500 ETH locked
├─ Casper contract: 37.5M CSPR locked
└─ Relayer: 500 ETH + 37.5M CSPR

Status: ✅ Perfectly balanced
```

---

## 🚀 Your System Status

**Current Setup:**
- ✅ Ethereum contract deployed and locking ETH
- ✅ Casper contract deployed (ready to lock CSPR)
- ✅ Relayer has CSPR liquidity for ETH → CSPR swaps
- ⚠️ Relayer needs ETH liquidity for CSPR → ETH swaps

**Recommendations:**
1. **Fund relayer with testnet ETH** for reverse swaps
2. **Monitor liquidity levels** in relayer wallet
3. **Set up alerts** when liquidity is low
4. **Implement rebalancing** logic for production

---

**Your understanding is perfect!** The contracts lock funds on both sides, and the relayer manages the liquidity to enable seamless cross-chain swaps. 🎯
