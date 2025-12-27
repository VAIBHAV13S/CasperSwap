# CasperSwap Upgrade Plan (Trust-Minimized, Upgradeable, RWA/DAO-Ready Yield Bridge)

This document is the **authoritative upgrade roadmap** for evolving this repo from a relayed cross-chain swap into a **trust-minimized escrow bridge** with:

- Casper as the **control plane** (governance, upgrades, compliance hooks)
- Ethereum as the **liquidity plane** (escrowed ETH/ERC-20)
- Relayer as a **replaceable robot** executing what contracts dictate

It is written to be implementable in this codebase (contracts + ethereum + relayer + frontend).

---

## 0) Current State (as of this repo)

### What works
- **Ethereum -> Casper**
  - User deposits ETH into `ethereum/contracts/EthLockVault.sol`.
  - Relayer watches `DepositInitiated` and calls Casper `LockVault.release()`.
- **Casper -> Ethereum**
  - Frontend calls Casper `LockVault.deposit()` with `attached_value`.
  - Relayer reads Casper CES events from `__events` and pays ETH by calling `EthLockVault.release(...)` with an off-chain signature.

### What prevents a “trust-minimized + governance-ready” story
- **Casper side has no governance/controller contract** (roles + config + upgrade authority are not centralized).
- **Casper LockVault is not deployed as upgradeable** (Odra upgradable mode is not enabled in deploy docs).
- **Release authorization on Casper is wrong**: `LockVault.release()` currently checks `caller == relayer_registry_address` (it should check registry membership).
- **No swapId hashing / replay protection**: both chains use sequential IDs; cross-chain replay and collisions are not handled.
- **No refunds/timeouts**: funds can get stuck with no on-chain exit.
- **Ethereum contract is not upgradeable via proxy**.
- **Relayer is still the “trust center”** for execution rules (proofs not stored/checked; settlement finality not enforced).
- **Frontend does not show architecture/state**: no swap history, explorer links, governance/upgrades, or yield narrative.

---

## 1) Target Architecture (What we will build)

### On Casper
1. **LockVault (Upgradeable Escrow)**
   - Holds CSPR (purse) and later CEP-18 tokens.
   - Emits CES events: `DepositInitiated`, `ReleaseExecuted`, `RefundExecuted`.
   - Enforces:
     - swapId uniqueness / replay protection
     - role-gated release/refund/config
     - escrowed on-chain releases

2. **BridgeController (Governance / Control Plane)**
   - Single “source of truth” for:
     - admin/governance key
     - relayer allowlist
     - fees + slippage config
     - upgrade authority (calls Odra upgrade entrypoints)

3. **(Optional) Compliance Adapter (RWA/ERC-3643 hook)**
   - `isEligible(user, assetId) -> bool` backed by a whitelist mapping.
   - LockVault checks eligibility when bridging specific assets.

### On Ethereum
4. **EthLockVault (Escrow + Proxy Upgradeable)**
   - Upgradeable via **UUPS** or **Transparent Proxy**.
   - Holds ETH (and optionally ERC-20).
   - Emits Deposit events with deterministic swapId.
   - Supports `release` and `refund` with role gating.

### Off-chain
5. **Relayer cluster** (stateless executors, DB for coordination)
   - Watches both chains.
   - Executes release calls on vault contracts (never pays principal from its own wallet).
   - Idempotent DB transitions and finality confirmation.

6. **Frontend dApp (React)**
   - Makes architecture explicit.
   - Shows swap lifecycle + explorer links.
   - Shows yield simulation & “upgrade demo”.

---

## 2) Deterministic `swapId` (Core invariant)

### Why
Sequential IDs on two chains are not globally unique. We need a deterministic swap identifier that:

- prevents replay
- links the source-chain deposit to the destination release
- can be recomputed off-chain

### Standard
Define:

```
swapId = keccak256(
  version,
  srcChainId,
  dstChainId,
  srcVaultAddress,
  depositor,
  token,
  amount,
  recipient,
  nonce
)
```

- **Ethereum**: compute in Solidity and emit as `bytes32 swapId`.
- **Casper**: compute in Rust (hash) and store as `SwapId` bytes.

**Nonce** is user-controlled (frontend generates), stored in the deposit record, and included in events.

---

## 3) Phase Plan (Implementation Roadmap)

### Phase A — Casper becomes a real escrow + correct authorization (must-have)
**Outcome**: relayer instructs vaults to release locked funds; Casper side is no longer “event-only”.

#### A1. Fix LockVault release authorization
- **Current**: `caller == relayer_registry_address`.
- **Target**: `RelayerRegistry.is_relayer(caller)` OR role gating via BridgeController.

Repo impact:
- `contracts/src/lock_vault.rs`
- `contracts/src/relayer_registry.rs`

#### A2. Make LockVault upgradeable
- Enable upgradable deployment (Odra upgradable support).

Repo impact:
- Casper deployment docs (README + scripts)
- Casper deploy session args should set `odra_cfg_is_upgradable=true` for LockVault.

#### A3. Add `refund()` + timeouts
- Store `deposit_time` and `timeout_seconds`.
- `refund(swapId)` allowed after timeout by depositor OR admin.

Repo impact:
- `contracts/src/lock_vault.rs`
- Relayer should handle refund stories (manual recovery).

#### A4. Events: add `RefundExecuted`
- Casper CES events used for indexing and UI.

---

### Phase B — Introduce Casper BridgeController (governance/control plane)
**Outcome**: Casper is the governance + upgrades authority.

#### B1. New contract: `BridgeController`
Responsibilities:
- admin key (future DAO/multisig)
- relayer allowlist
- config: fee_bps, max_slippage_bps, allowed destination chains
- calls into LockVault config + upgrade

Repo impact:
- `contracts/src/bridge_controller.rs` (new)
- `contracts/src/lib.rs` export
- `Odra.toml` add contract

#### B2. LockVault depends on BridgeController
- Store controller address.
- Gate admin-only operations by `controller`.

---

### Phase C — Ethereum vault becomes upgradeable escrow via proxy
**Outcome**: “Upgradeable on both sides” story is real.

#### C1. Replace EthLockVault with proxy pattern
- Use OpenZeppelin upgradeable contracts.
- Store relayer set / governance.
- Track `locked[swapId]`, `released[swapId]`, `refunded[swapId]`.

Repo impact:
- `ethereum/contracts/EthLockVault.sol` rework
- Add deploy script for proxy deployment

#### C2. Align events to include `bytes32 swapId`
- `DepositInitiated(bytes32 swapId, ...)`.

Relayer changes:
- parse new event signature
- store swapId as primary key

---

### Phase D — Relayer hardening (trust-minimized execution)
**Outcome**: relayer is replaceable; DB is coordination not truth.

#### D1. Finality checks
- Ethereum: wait N confirmations before acting.
- Casper: wait deploy execution result.

#### D2. Idempotent state machine
Recommended statuses:
- `PENDING_SOURCE`
- `SOURCE_FINAL`
- `RELEASE_SUBMITTED`
- `RELEASE_FINAL`
- `REFUNDED`
- `FAILED_RETRYABLE`

Repo impact:
- `relayer/database/schema.sql` (migration)
- `relayer/src/core/SwapProcessor.ts`
- `relayer/src/core/Executor.ts`

#### D3. Proof storage (hackathon-grade)
- For ETH->CSPR: store `source_tx_hash` and `log_index` as proof in Casper `mark_fulfilled(swapId, proof)`.
- For CSPR->ETH: store Casper deploy hash as proof in Ethereum release call or DB.

---

### Phase E — Oracle + Yield layer (demo-grade but architecture-ready)
**Outcome**: “Bridge & Earn” narrative with layered services.

#### E1. RateOracle service (simple)
- A small HTTP service used by relayer + frontend.
- Caches CoinGecko and rate-limits.

Repo impact options:
- Either extend `relayer` with `/rates` endpoint, or add a small service under `services/rate-oracle/`.

#### E2. Yield simulation module
- For demo: `effective = principal * (1 + r * t)`.
- Store `deposit_time` and compute yield in frontend and/or relayer.

Optional:
- mint a mock receipt token on Casper (future cbCSPR).

---

### Phase F — Frontend: make the architecture obvious
**Outcome**: judges instantly understand the system.

Deliverables:
- Two explicit flows:
  - ETH -> CSPR
  - CSPR -> ETH
- Swap history table (from relayer DB API OR direct chain queries)
- Explorer links for source + destination tx
- “Upgrade demo” section (fee changed via governance)
- “Compliance demo” toggle (eligible/ineligible) if adapter enabled

Repo impact:
- `frontend/src/components/SwapInterface.tsx` (refactor into pages/components)
- Add `SwapHistory` UI component
- Add minimal API client for relayer/rate oracle

---

## 4) File-Level Checklist (Repo map)

### Casper contracts (Odra)
- Update:
  - `contracts/src/lock_vault.rs`
  - `contracts/src/relayer_registry.rs`
- Add:
  - `contracts/src/bridge_controller.rs`
  - `contracts/src/compliance_adapter.rs` (optional)
- Update:
  - `contracts/src/lib.rs`
  - `Odra.toml`

### Ethereum
- Update:
  - `ethereum/contracts/EthLockVault.sol`
  - `ethereum/scripts/deploy.js` (proxy deploy)
  - `ethereum/hardhat.config.js` if needed for upgrades

### Relayer
- Update:
  - `relayer/database/schema.sql` (swapId, statuses, proof fields)
  - `relayer/src/watchers/EventWatcher.ts` (new event schema)
  - `relayer/src/watchers/CasperContractWatcher.ts` (decode new CES schema)
  - `relayer/src/core/Executor.ts` (call new entrypoints)
  - `relayer/src/core/SwapProcessor.ts` (state machine)

### Frontend
- Update:
  - `frontend/src/components/SwapInterface.tsx`
  - `frontend/src/lib/contracts.ts` (new ABI / addresses)

### Docs
- Add:
  - `UPGRADE.md` (this file)
- Update:
  - `README.md`
  - `DEPLOYMENT.md`
  - `CASPER_TO_ETH_GUIDE.md` (fix incorrect statement “contract locks 100 CSPR” if not true in code)

---

## 5) Demo Script (What to show judges)

### Demo 1 — Trust-minimized escrow (both sides)
- ETH -> CSPR:
  - Show ETH is locked in EthLockVault.
  - Relayer triggers Casper vault release.
  - Show Casper vault balance decreases.

- CSPR -> ETH:
  - Show CSPR escrowed in Casper vault purse.
  - Relayer triggers Ethereum vault release.

### Demo 2 — Upgrade live without redeploying state
- Before:
  - Fee = X bps
- Execute governance action (BridgeController): update fee
- After:
  - New fee applies to new swaps; old deposits still release correctly.

### Demo 3 — Compliance hook (optional)
- User not eligible: deposit rejected for regulated asset
- Add to whitelist: deposit succeeds

### Demo 4 — Yield simulation
- Lock longer -> “earned yield” (simulated) displayed and logged

---

## 6) Acceptance Criteria (Definition of Done)

### Casper
- LockVault is deployed **upgradeable** and retains state across an upgrade.
- `deposit` escrows funds, emits CES, stores record keyed by deterministic swapId.
- `release/mark_fulfilled/refund` are role-gated and idempotent.

### Ethereum
- EthLockVault is proxy-upgradeable.
- Deterministic `swapId` emitted and tracked.
- `release/refund` role gated.

### Relayer
- Relayer does not pay principal from its own wallet (only gas).
- Finality checks implemented.
- DB state machine prevents double execution.

### Frontend
- Users can execute both flows.
- Swap history and explorer links available.
- UI communicates “Casper control plane / Ethereum liquidity plane”.

---

## 7) Open Questions (You should decide early)

- Do we use **UUPS** or **Transparent Proxy** on Ethereum?
- For Casper swapId hashing: do we standardize on `blake2b` (Casper-native) or `keccak256` for cross-chain symmetry?
- Do you want a minimal “DAO stub” now (single admin key) or a multisig-like module?

---

## 8) Next Action

Phase A + B have been implemented in this repo and deployed to Casper testnet.

Deployed Casper testnet hashes (current):

- **LockVault contract hash:** `contract-0ddc0291717a1913e67fe4e1d5b020396051e0ed37aba939860c1b781c02a1c0`
- **LockVault package hash:** `hash-bf65af020bd90f2dd1e5b1ebc82dd98cdddc4472ea4555b6deb62f0df605530c`
- **BridgeController contract hash:** `contract-52b48d05520586e765fa95636d99eb73ba73c9b66b05e7a19c7e0be711802fef`
- **BridgeController package hash:** `hash-ced81afd58566c1840cfe6d6774e2643c90f4515ae4af9ed9c61914b7611494d`

Next implementation work:
1. Proceed with **Phase C** (Ethereum proxy upgradeability).
2. Proceed with **Phase D** (relayer hardening: finality checks + stronger idempotent state machine).
3. Proceed with **Phase F** (frontend swap history + explorer links + clearer architecture UI).
