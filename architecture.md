# CasperChainSwap — Full Architecture

> A complete, hackathon-ready architecture for a cross-chain swap protocol built on the Casper network. Designed to win the Interoperability and Main Track at Casper Hackathon 2026.

---

## Executive summary

CasperChainSwap is a cross-chain swap protocol that lets users swap tokens between Casper (CSPR & native Casper assets) and external chains (ERC-20 on Ethereum-compatible chains or tokens on other testnets) in a secure, demo-ready way. The architecture balances hackathon speed (deliverable MVP) and security (reasonable constraints for a testnet prototype). It uses a hybrid on-chain/off-chain relayer model: Casper smart contracts handle custody, swap execution, and state tracking; an off-chain Relayer watches events, verifies cross-chain confirmations, and executes counterpart actions.

## Current deployment (casper-test)

These are the contracts currently deployed/installed on Casper testnet and used by the frontend/relayer.

**RelayerRegistry**

* Package hash: `hash-f3c06f7c6b4115ae6f6bb184f3b515977f5df709c025805766254aee8e5d1425`
* Contract hash: `a95275d34078924db9719d84df7bfb1d0727e85a55c39a1846b55f44b76a622b`

**LockVault**

* Package hash: `hash-692ca350badb6561c282026883ff17ed631774caf165094d7080f425570190e6`
* Contract hash: `76f1c326539d21277212e15397f1a95d10e41d9b0e2259309b2221f0930c6e8f`

**SwapRouter**

* Package hash: `hash-9994ed499053221afc3e7727c7d01a20fb7b2c1162c80b91cbd32d24af3746a5`
* Contract hash: `dc8195e7ff44c28cdafb9f99a66b2119dfb68d47611cdefa7d8cc250dccd3fb3`

Configured via `.env` / `frontend/.env` / `relayer/.env`.

---

## Goals & constraints

**Primary goals (hackathon-focused)**

* Produce a working Testnet prototype on Casper that demonstrates real on-chain swap flows.
* Qualify for Interoperability and Main Track and maximize community-vote appeal.
* Keep the security model simple and explain trust assumptions clearly.

**Constraints**

* No time to build a full trustless light-client — use a Relayer model with cryptographic receipts or trusted oracle integration.
* MVP must be deployable in 4–6 weeks.
* Use Odra / Casper Rust SDK for contracts.

---

## High-level architecture (components)

1. **On-chain Casper Contracts (Odra / Rust)**

   * `LockVault` (Custody)
   * `SwapRouter` (Swap logic + routing)
   * `sCSPR/Wrapper` (optional wrapped token for native assets)
   * `RelayerRegistry` (manage relayer keys & slashing stake)
   * `OracleInterface` (optional — for verifying external chain data)

2. **Off-chain Relayer Service (stateless workers + queue)**

   * Event watcher (Casper testnet) and external chain watchers
   * Verification & signer component
   * Execution worker (calls Casper contracts)
   * Admin dashboard & key management

3. **Frontend (React + Tailwind)**

   * Swap UI + connect wallet (CSPR.click / Casper Signer)
   * Status tracker for pending swaps
   * Explorer view of swap events

4. **Auxiliary services**

   * Backend API for optional UX features (swap history, notifications)
   * Database (Postgres) to persist swap state and relayer queue
   * Monitoring / logging / metrics

5. **CI/CD & Testnet deployment scripts**

   * Automated deploy to Casper testnet
   * Integration tests generating on-chain txs

---

## Smart contract design (detailed)

### 1) LockVault (Custody contract)

**Responsibilities:**

* Hold user tokens (CSPR & native Casper tokens) or minted wrapped tokens.
* Emit events when deposits are made.
* Release funds on verified unlock events.

**Key functions:**

* `deposit(to_chain: String, token: Address, recipient: String, amount: U256) -> u64`

  * Locks tokens and emits `DepositInitiated` event with `swap_id`.
* `release(swap_id: u64, recipient: Address, amount: U256)`

  * Validates relayer signature / oracle proof and releases tokens.
* `cancel(swap_id)`

  * Allow users to cancel after timeout if not processed.

**Events:**

* `DepositInitiated(swap_id, depositor, amount, to_chain, recipient, token)`
* `ReleaseExecuted(swap_id, recipient, amount)`

**Security:**

* Use nonces or swap_id derived from depositor + nonce.
* Ensure reentrancy protection and proper ownership checks.

### 2) SwapRouter (Optional aggregator)

**Responsibilities:**

* Route swaps through liquidity sources (fixed-rate or AMM pools) on Casper testnet.
* Compute exchange amounts and fees.

**Key functions:**

* `quote(input_token, output_token, amount) -> Quote`
* `swap(swap_id, path[], min_out, receiver)`
* `add_liquidity/remove_liquidity` (for on-chain pools)

**Notes:**

* For hackathon MVP, implement a simple fixed-price swap or use a single liquidity pool to avoid building complex AMM logic.

### 3) RelayerRegistry

**Responsibilities:**

* Register trusted relayer public keys.
* Allow governance to add/remove relayers.
* (Optional) Bonding / slashing mechanism to incentivize correct behavior.

**Key functions:**

* `add_relayer(relayer: Address)`
* `remove_relayer(relayer: Address)`
* `is_relayer(address: Address) -> bool`

### 4) OracleInterface (Optional)

**Use case:** If you want higher trustless assurances, integrate with an oracle (e.g., NodeOps or a simple multi-relayer signature).

---

## Swap flow (happy path)

1. User connects wallet (MetaMask / CSPR.click) on frontend.
2. User selects direction (Ethereum → Casper or Casper → Ethereum).
3. Ethereum → Casper: user calls `deposit()` on the Ethereum contract; relayer observes `DepositInitiated` on Ethereum and sends funds to Casper.
4. Casper → Ethereum: user calls `LockVault.deposit(to_chain='ethereum', ...)` on Casper.
5. Current relayer implementation:
   * Ethereum watcher is active and processes Ethereum → Casper swaps.
   * Casper watcher is currently disabled/placeholder (no Casper deposit ingestion), so Casper → Ethereum automation is not complete yet.

**Important:** For two-way swaps (CSPR ↔ ERC-20), you will run a symmetric flow with a counterpart contract on the external chain (can be simulated or demonstrated via mock).

---

## Relayer architecture (off-chain)

### Components

* **Event Watcher:** Subscribes to Ethereum events. Casper event stream ingestion is currently disabled (requires local event stream or separate indexing).
* **Verifier:** Validates events and optionally receives cryptographic proofs from external chain (or trusts multiple relayers or an oracle).
* **Signer/Executor:** Signs and sends transactions to Casper contracts to perform releases or minting.
* **Queue & DB:** Persist swap state: `swap_id, status, deposit_tx, relayer_tx, retries, timeout`.
* **Admin UI:** For ops to see pending swaps, force replays, manage relayer keys.

### Key design decisions (hackathon-friendly)

* **Single Relayer vs Multi-Relayer:** Start with a single relayer for MVP. For security, support multi-signer aggregation or simple multi-sig in the future.
* **Proof model:** For hackathon, use signed relayer receipts + event logs. Document this trust assumption clearly.
* **Idempotency & retries:** Worker should mark tasks and use idempotent contract calls.

### Security & key handling

* Store relayer private keys in an HSM-like system (use environment vault for hackathon, e.g., HashiCorp Vault or encrypted files).
* Rate-limit & alert on unusual activity.

---

## Frontend & UX

**Stack:** React + Vite + TypeScript + Tailwind
**Wallets:** CSPR.click / Casper Signer integration for Casper; (optional) MetaMask for demonstrating counterpart chain.

**Pages:**

* Home (quick swap UI)
* Advanced (routing options)
* Swap Status / Explorer (show DepositInitiated, ReleaseExecuted)
* Admin (relayer status)

**UX Notes:**

* Show clear statuses: Pending → Relayer Confirmed → Completed.
* Provide a link to on-chain tx explorer for each step.
* Provide optimistic UI for instant confirmations and cancel flow for timeouts.

---

## Data model (Postgres example)

**Tables:**

* `swaps` (swap_id PK, user_address, from_chain, to_chain, token, amount, status, deposit_tx, release_tx, created_at, updated_at)
* `relayer_events` (id, swap_id, event_type, payload, processed_at)
* `relayer_keys` (id, pubkey, status, bond)

---

## Testnet deployment plan

1. Set up Casper Testnet account, install Odra.
2. Write unit tests for each contract using Odra testing harness.
3. Deploy contracts to testnet via deployment script (shell or TS helper).
4. Seed test tokens and liquidity.
5. Start relayer in a separate process; run end-to-end test: deposit → relayer → release.

---

## Security considerations & threat model

**Threats:**

* Malicious relayer steals deposits — mitigations: multi-relayer threshold, slashing, timelock fallback for user refunds.
* Replay attacks — mitigations: nonces and unique swap_id.
* Frontend phishing — use clear UX, domain verification.

**MVP trust model (explicit):**

* Relayer is trusted to read on-chain events and call release functions. The system will require relayer keys to be registered in `RelayerRegistry`. For production, move to aggregated signatures and cross-chain proofs.

---

## Monitoring & Metrics

* Track metrics: `swaps_created`, `swaps_completed`, `avg_settlement_time`, `failed_relays`.
* Integrate with Grafana/Prometheus and Sentry.
* On-chain watchers log events into DB for auditing.

---

## UX for Demo & Community Voting

* Create an attention-grabbing demo flow: "Swap 50 test USDC (ERC-20) for sCSPR in 3 steps".
* Provide live status updates and explorer links.
* Short 90-second demo video showing the entire flow.

---

## Roadmap & Milestones (6-week hackathon plan)

**Week 0 (Prep):** Local dev environment, Odra templates, Casper accounts, test tokens.
**Week 1:** Write LockVault & RelayerRegistry contracts; unit tests.
**Week 2:** Implement simple SwapRouter and deploy to testnet; build frontend minimal swap flow.
**Week 3:** Build Relayer service (watcher + executor); run E2E tests on testnet.
**Week 4:** Polish UI, add swap status tracker, add security features (nonce checks, timeouts).
**Week 5:** Integration tests, gas/fee tuning, demo recording.
**Week 6:** Final polish, docs, submission write-up, pitch deck.

---

## Hackathon submission checklist

* [ ] Project Overview (1–2 paragraphs)
* [ ] Demo Video (90–120s)
* [ ] GitHub Repository (well-structured code + README)
* [ ] Functional Prototype on Casper Testnet (links + addresses)
* [ ] On-chain activity evidence (tx hashes)
* [ ] Submission write-up (architecture + trust model)
* [ ] Community outreach (CSPR.fans link)
* [ ] Pitch deck (5–10 slides)

---

## Example swap scenario (to demonstrate in video)

1. Alice connects wallet (CSPR.click)
2. Alice deposits 100 test CSPR to swap for `TestUSDC-eth` and enters her ETH address.
3. LockVault emits `DepositInitiated`.
4. Relayer watches the event and signs a release proof for the ETH-side custodian (simulated).
5. Casper Relayer calls `release()` and logs `ReleaseExecuted`.
6. Alice receives USDC on Ethereum (simulated) and UI shows Completed.

---

## Deliverables I will provide if you want next

* Odra smart contract skeletons (Rust) for `LockVault`, `SwapRouter`, `RelayerRegistry`.
* Relayer service starter (TypeScript / Node or Python FastAPI) with watchers and executor loops.
* React frontend boilerplate with wallet integration and swap UI.
* Deployment scripts and testnet demo guide.

---

If you want, I can now generate the **Odra smart contract skeletons** (Rust) and **Relayer starter code**. Tell me which one to generate first and I will put the code in a ready-to-run template.
