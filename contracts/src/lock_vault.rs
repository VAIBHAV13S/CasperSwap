use odra::casper_event_standard;
use odra::prelude::*;
use odra::casper_types::U256;
use odra::casper_types::{U512, URef};
use casper_contract::contract_api::{runtime, system};
use casper_contract::contract_api::account::get_main_purse;
use odra::casper_types::{account::AccountHash, ApiError};

const MAX_TO_CHAIN_LEN: usize = 32;
const MAX_RECIPIENT_LEN: usize = 128;

#[odra::module]
pub struct LockVault {
    pub deposits: Mapping<u64, Deposit>,
    pub next_swap_id: Var<u64>,
    pub controller: Var<Address>,
    pub relayers: Mapping<Address, bool>,
    pub vault_purse: Var<URef>,
    pub released: Mapping<u64, bool>,
    pub timeout_ms: Var<u64>,
}

#[odra::odra_type]
pub struct Deposit {
    pub depositor: Address,
    pub amount: U256,
    pub to_chain: String,
    pub recipient: String,
    pub token: Address,
    pub deposit_time_ms: u64,
}

#[derive(odra::Event, PartialEq, Eq, Debug)]
pub struct DepositInitiated {
    pub swap_id: u64,
    pub depositor: Address,
    pub amount: U256,
    pub to_chain: String,
    pub recipient: String,
    pub token: Address,
}

#[derive(odra::Event, PartialEq, Eq, Debug)]
pub struct ReleaseExecuted {
    pub swap_id: u64,
    pub recipient: Address,
    pub amount: U256,
}

#[derive(odra::Event, PartialEq, Eq, Debug)]
pub struct RefundExecuted {
    pub swap_id: u64,
    pub recipient: Address,
    pub amount: U256,
}

#[derive(Debug, PartialEq, Eq, Copy, Clone)]
pub enum Error {
    NotRelayer = 1,
    DepositNotFound = 2,
    InvalidAmount = 3,
}

#[odra::module]
impl LockVault {
    #[odra(init)]
    pub fn init(&mut self, controller: Address) {
        self.controller.set(controller);
        self.next_swap_id.set(0);

        let vault_purse = system::create_purse();
        self.vault_purse.set(vault_purse);

        // Default: 1 hour.
        self.timeout_ms.set(3_600_000);
    }

    #[odra(payable)]
    pub fn deposit(&mut self, to_chain: String, token: Address, recipient: String, amount: U256) -> u64 {
        if amount == 0.into() {
            panic!("InvalidAmount");
        }
        if to_chain.is_empty() || to_chain.len() > MAX_TO_CHAIN_LEN {
            panic!("InvalidToChain");
        }
        if recipient.is_empty() || recipient.len() > MAX_RECIPIENT_LEN {
            panic!("InvalidRecipient");
        }

        let swap_id = self.next_swap_id.get_or_default();
        let depositor = self.env().caller();
        let amount_u64 = amount.as_u64();
        if U256::from(amount_u64) != amount {
            runtime::revert(ApiError::InvalidArgument);
        }

        let attached = self.env().attached_value();
        let amount_u512 = U512::from(amount_u64);
        if attached != amount_u512 {
            runtime::revert(ApiError::InvalidArgument);
        }

        // Move the attached funds into the vault purse (real escrow).
        let vault_purse = match self.vault_purse.get() {
            Some(purse) => purse,
            None => runtime::revert(ApiError::InvalidPurse),
        };
        system::transfer_from_purse_to_purse(get_main_purse(), vault_purse, amount_u512, None)
            .unwrap_or_else(|_| runtime::revert(ApiError::InvalidPurse));

        let deposit = Deposit {
            depositor,
            amount,
            to_chain: to_chain.clone(),
            recipient: recipient.clone(),
            token,
            deposit_time_ms: runtime::get_blocktime().into(),
        };
        self.deposits.set(&swap_id, deposit);
        self.next_swap_id.set(swap_id + 1);
        self.released.set(&swap_id, false);

        self.env().emit_event(DepositInitiated {
            swap_id,
            depositor,
            amount,
            to_chain,
            recipient,
            token,
        });

        swap_id
    }

    pub fn release(&mut self, swap_id: u64, recipient: Address, amount: U256) {
        if !self.is_relayer(self.env().caller()) {
            panic!("NotRelayer");
        }

        if amount == 0.into() {
            panic!("InvalidAmount");
        }

        if self.released.get(&swap_id).unwrap_or(false) {
            runtime::revert(ApiError::InvalidArgument);
        }

        let amount_u64 = amount.as_u64();
        if U256::from(amount_u64) != amount {
            runtime::revert(ApiError::InvalidArgument);
        }
        let amount_u512 = U512::from(amount_u64);

        let vault_purse = match self.vault_purse.get() {
            Some(purse) => purse,
            None => runtime::revert(ApiError::InvalidPurse),
        };

        let recipient_account: AccountHash = match recipient.as_account_hash() {
            Some(a) => *a,
            None => runtime::revert(ApiError::InvalidArgument),
        };

        system::transfer_from_purse_to_account(vault_purse, recipient_account, amount_u512, None)
            .unwrap_or_else(|_| runtime::revert(ApiError::InvalidPurse));

        self.released.set(&swap_id, true);

        self.env().emit_event(ReleaseExecuted {
            swap_id,
            recipient,
            amount,
        });
    }

    pub fn refund(&mut self, swap_id: u64) {
        let deposit = self
            .deposits
            .get(&swap_id)
            .unwrap_or_else(|| runtime::revert(ApiError::MissingArgument));

        if self.released.get(&swap_id).unwrap_or(false) {
            runtime::revert(ApiError::InvalidArgument);
        }

        let now_ms: u64 = runtime::get_blocktime().into();
        let timeout_ms = self.timeout_ms.get_or_default();
        if now_ms < deposit.deposit_time_ms.saturating_add(timeout_ms) {
            runtime::revert(ApiError::InvalidArgument);
        }

        // Only depositor can refund for now (admin/controller-based refund can be added later).
        if self.env().caller() != deposit.depositor {
            runtime::revert(ApiError::PermissionDenied);
        }

        let amount_u64 = deposit.amount.as_u64();
        if U256::from(amount_u64) != deposit.amount {
            runtime::revert(ApiError::InvalidArgument);
        }
        let amount_u512 = U512::from(amount_u64);

        let vault_purse = match self.vault_purse.get() {
            Some(purse) => purse,
            None => runtime::revert(ApiError::InvalidPurse),
        };

        let recipient_account: AccountHash = match deposit.depositor.as_account_hash() {
            Some(a) => *a,
            None => runtime::revert(ApiError::InvalidArgument),
        };

        system::transfer_from_purse_to_account(vault_purse, recipient_account, amount_u512, None)
            .unwrap_or_else(|_| runtime::revert(ApiError::InvalidPurse));

        self.released.set(&swap_id, true);

        self.env().emit_event(RefundExecuted {
            swap_id,
            recipient: deposit.depositor,
            amount: deposit.amount,
        });
    }

    pub fn set_timeout_ms(&mut self, timeout_ms: u64) {
        let controller = self.controller.get().unwrap();
        if self.env().caller() != controller {
            runtime::revert(ApiError::PermissionDenied);
        }
        self.timeout_ms.set(timeout_ms);
    }

    pub fn add_relayer(&mut self, relayer: Address) {
        let controller = self.controller.get().unwrap();
        if self.env().caller() != controller {
            runtime::revert(ApiError::PermissionDenied);
        }
        self.relayers.set(&relayer, true);
    }

    pub fn remove_relayer(&mut self, relayer: Address) {
        let controller = self.controller.get().unwrap();
        if self.env().caller() != controller {
            runtime::revert(ApiError::PermissionDenied);
        }
        self.relayers.set(&relayer, false);
    }

    pub fn is_relayer(&self, relayer: Address) -> bool {
        self.relayers.get(&relayer).unwrap_or(false)
    }
}
