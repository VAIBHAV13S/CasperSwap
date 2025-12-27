# CasperSwap - Cross-Chain Swap Platform

A decentralized cross-chain swap platform connecting Ethereum and Casper networks.

## Project Structure

```
CasperSwap/
├── contracts/          # Casper smart contracts (Odra framework)
├── ethereum/          # Ethereum smart contracts (Solidity)
├── frontend/          # React frontend application
├── relayer/           # Off-chain relayer service
├── scripts/           # Deployment scripts
└── keys/             # Casper wallet keys
```

## Prerequisites

- **Rust** (nightly-2024-06-15)
- **Node.js** (v18+)
- **Cargo** with `wasm32-unknown-unknown` target
- **wasm-opt** (`cargo install wasm-opt`)
- **casper-client** v5 (`cargo install casper-client`)

## Casper Contract Deployment

### 1. Build and Deploy

```bash
cd contracts
cargo +nightly-2024-06-15 odra build
```

Deploy using `casper-client put-deploy` (required on casper-test with casper-client v5):

```bash
casper-client put-deploy \
  --node-address https://node.testnet.casper.network \
  --chain-name casper-test \
  --secret-key ./keys/secret_key.pem \
  --session-path ./wasm/RelayerRegistry.wasm \
  --session-entry-point call \
  --payment-amount 300000000000 \
  --session-arg "odra_cfg_package_hash_key_name:string='relayer_registry_package_hash'" \
  --session-arg "odra_cfg_allow_key_override:bool='true'" \
  --session-arg "odra_cfg_is_upgradable:bool='false'" \
  --session-arg "odra_cfg_is_upgrade:bool='false'"
```

Deploy `BridgeController`, then deploy `LockVault` with the controller/admin address passed to `LockVault.init(controller)`.

After deployment, the controller/admin must allowlist the relayer address on `LockVault` via `LockVault.add_relayer(relayer)`.

Testnet hashes (current):

- **LockVault contract hash:** `contract-0ddc0291717a1913e67fe4e1d5b020396051e0ed37aba939860c1b781c02a1c0`
- **LockVault package hash:** `hash-bf65af020bd90f2dd1e5b1ebc82dd98cdddc4472ea4555b6deb62f0df605530c`
- **BridgeController contract hash:** `contract-52b48d05520586e765fa95636d99eb73ba73c9b66b05e7a19c7e0be711802fef`
- **BridgeController package hash:** `hash-ced81afd58566c1840cfe6d6774e2643c90f4515ae4af9ed9c61914b7611494d`

If you want upgrades later, deploy `LockVault` as **upgradeable** (set `odra_cfg_is_upgradable:bool='true'`) so state can be preserved across upgrades.

### 2. Verify Deployment

Check your deployment on the Casper Testnet Explorer:
https://testnet.cspr.live/

### 3. Update Configuration

After deployment, update `.env`/`relayer/.env`/`frontend/.env` with the installed contract hashes.
The frontend and relayer use `LOCK_VAULT_CONTRACT_HASH` / `VITE_CASPER_CONTRACT_HASH` for calling `deposit` and `release`.

## Frontend Development

```bash
cd frontend
npm install
npm run dev
```

## Relayer Service

```bash
cd relayer
npm install
npm run dev
```

## Ethereum Contracts

```bash
cd ethereum
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

## Architecture

- **Casper Contracts**: Odra contracts deployed on Casper testnet (LockVault holds escrow; controller/admin manages configuration)
- **Ethereum Contracts**: Solidity contract on Sepolia used to accept deposits (locks ETH in the contract)
- **Relayer**: Off-chain service that watches both chains, stores events/swaps in Postgres (Neon), and executes payouts
- **Frontend**: React UI that initiates deposits on either chain

## How the system works (end-to-end)

This project currently behaves like a **relayed bridge**:

- A user deposits/locks funds on the **source chain**.
- The relayer observes that deposit event and records a swap in the database.
- The relayer pays the user on the **destination chain**.

Important: the Casper-side `LockVault` is an escrow contract for CSPR deposits and supports relayer-gated release and user refunds after a timeout.

### Components and responsibilities

#### 1) Ethereum: `EthLockVault` (Sepolia)

- **User action**: call `deposit(toChain, recipient)` and send `msg.value` (ETH).
- **What is locked**: the ETH is held by the `EthLockVault` contract.
- **Event emitted**: `DepositInitiated(swapId, depositor, amount, toChain, recipient)`.
- **How it is used**:
  - The relayer reads `amount` (Wei) from the event.
  - For `toChain == "casper"`, the relayer computes the CSPR payout amount using its price oracle and then executes a Casper payout.

#### 2) Casper: `LockVault` (testnet, Odra)

- **User action**: call `deposit(to_chain="ethereum", token, recipient, amount)`.
- **Event emitted**: `DepositInitiated(swap_id, depositor, amount, to_chain, recipient, token)` using Casper Event Standard (CES) stored under `__events`.
- **Current behavior**:
  - `deposit` records deposit metadata and transfers attached CSPR into a vault purse (escrow).
  - `release` is relayer-gated via `LockVault.is_relayer(caller)` and transfers escrowed funds to the recipient.
  - `refund` allows the depositor to reclaim escrowed funds after a configurable timeout.

#### 3) Relayer (Node/TS)

The relayer is the “brain” that makes this bidirectional flow work.

- **Database**: Postgres (Neon) stores:
  - observed events
  - swaps
  - a persistent cursor (`relayer_state`) for Casper event index processing

- **Ethereum watcher**:
  - Polls/backfills events from `EthLockVault`.
  - Realtime listener is intentionally disabled for stability (some providers can return filter errors).

- **Casper watcher (direct node RPC, no indexer)**:
  - Discovers the `__events` dictionary seed URef from the LockVault contract named keys.
  - Reads `__events_length` and iterates `__events[i]`.
  - Decodes CES payload bytes into structured events (e.g. `DepositInitiated`).
  - Inserts decoded events/swaps into the DB idempotently.
  - Persists `next` index in `relayer_state` to avoid reprocessing.

- **Swap processor**:
  - Periodically queries for `PENDING` swaps.
  - Executes the payout on the destination chain.

#### 4) Price oracle

- Both the relayer and the frontend use CoinGecko to estimate the ETH↔CSPR conversion.
- Conversion formula used:
  - `rate = ethUsd / csprUsd`  (CSPR per 1 ETH)
- The relayer converts:
  - ETH→CSPR payout amount: `cspr = eth * rate` then `motes = floor(cspr * 1e9)`.
  - CSPR→ETH payout amount: `eth = cspr / rate` then `wei = floor(eth * 1e18)`.

## Bidirectional swap flows

### Flow A: Ethereum → Casper

1. User deposits ETH into `EthLockVault.deposit("casper", recipient)`.
2. Relayer detects `DepositInitiated` on Ethereum and stores it as a `PENDING` swap.
3. Relayer calculates payout amount in motes using the price oracle.
4. Relayer pays the Casper recipient by calling `LockVault.release(swap_id, recipient, amount)`.
5. Swap is marked `COMPLETED` in the database.

### Flow B: Casper → Ethereum

1. User calls `LockVault.deposit(to_chain="ethereum", ...)` on Casper.
2. Relayer reads and decodes the CES `DepositInitiated` event from `__events` via Casper node RPC.
3. Relayer stores it as a `PENDING` swap.
4. Relayer calculates payout amount in Wei using the price oracle.
5. Relayer pays the Ethereum recipient by sending an ETH transaction.
6. Swap is marked `COMPLETED` in the database.

## What “the locked amount” means (and how it is used)

### On Ethereum deposits

- The amount is **actually locked on-chain** inside the `EthLockVault` contract.
- The relayer uses that locked amount to decide how much to pay out on Casper.

### On Casper deposits

- The amount is currently **recorded and emitted as an event**, but it is not escrowed by the contract.
- The relayer uses that event amount to decide how much ETH to pay out on Ethereum.

### Where do payouts come from?

- **Casper payouts** come from the relayer’s Casper account purse (native transfer).
- **Ethereum payouts** come from the relayer’s Ethereum account.

This means the system is currently **not trustless**: the relayer must be funded and is responsible for honoring swaps.

## Known limitations (current behavior)

- **Relayer is still trusted for correctness**: it decides when to release based on off-chain observation, and must be operated responsibly.
- **Swaps are marked completed immediately after broadcast** (not after finality confirmation).
- **Price oracle depends on CoinGecko** and can be rate-limited (429). The code keeps last known prices, but this is still an external dependency.
- **Security model is relayer-based**: the relayer can pay (or not pay). This is fine for a demo/prototype but not a trust-minimized bridge.

## Improvements (recommended next steps)

### 1) Make Casper side a real escrow

- Extend escrow beyond CSPR to support CEP-18 token transfers.
- If desired, make `LockVault` consume `BridgeController` relayer allowlist via cross-contract calls.

### 2) Add confirmation/finality checks

- Ethereum: wait N confirmations before paying out.
- Casper: wait for deploy execution and/or confirmations before paying out.
- Mark swap `COMPLETED` only after confirmation.

### 3) Quote locking + slippage controls

- Store `quoted_rate` and `quoted_output` at deposit time.
- Enforce max slippage (or require user confirmation if payout changes).

### 4) Improve price oracle robustness

- Use a single CoinGecko request (already done) and exponential backoff.
- Add alternate providers or an on-chain oracle.
- Add caching/shared API endpoint so frontend doesn’t hit CoinGecko directly.

### 5) Operational hardening

- Better structured logging.
- Metrics + alerting (swap lag, failures, pending backlog).
- Idempotent execution with stronger DB constraints and retry-safe state transitions.

## License

MIT
