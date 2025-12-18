use odra::casper_event_standard;
use odra::prelude::*;
use odra::casper_types::U256;

const MAX_TO_CHAIN_LEN: usize = 32;
const MAX_RECIPIENT_LEN: usize = 128;

#[odra::module]
pub struct LockVault {
    pub deposits: Mapping<u64, Deposit>,
    pub next_swap_id: Var<u64>,
    pub relayer_registry: Var<Address>,
}

#[odra::odra_type]
pub struct Deposit {
    pub depositor: Address,
    pub amount: U256,
    pub to_chain: String,
    pub recipient: String,
    pub token: Address,
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

#[derive(Debug, PartialEq, Eq, Copy, Clone)]
pub enum Error {
    NotRelayer = 1,
    DepositNotFound = 2,
    InvalidAmount = 3,
}

#[odra::module]
impl LockVault {
    #[odra(init)]
    pub fn init(&mut self, relayer_registry: Address) {
        self.relayer_registry.set(relayer_registry);
        self.next_swap_id.set(0);
    }

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

        let deposit = Deposit {
            depositor,
            amount,
            to_chain: to_chain.clone(),
            recipient: recipient.clone(),
            token,
        };
        self.deposits.set(&swap_id, deposit);
        self.next_swap_id.set(swap_id + 1);

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
        let registry_addr = self.relayer_registry.get().unwrap();

        if self.env().caller() != registry_addr {
            panic!("NotRelayer");
        }

        if amount == 0.into() {
            panic!("InvalidAmount");
        }

        self.env().emit_event(ReleaseExecuted {
            swap_id,
            recipient,
            amount,
        });
    }
}
