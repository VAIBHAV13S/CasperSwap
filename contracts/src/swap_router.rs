use odra::casper_event_standard;
use odra::prelude::*;
use odra::casper_types::U256;

#[odra::module]
pub struct SwapRouter {
    pub owner: Var<Address>,
}

#[derive(odra::Event, PartialEq, Eq, Debug)]
pub struct SwapExecuted {
    pub sender: Address,
    pub token_in: Address,
    pub amount_in: U256,
    pub amount_out: U256, 
    pub recipient: Address,
}

#[odra::module]
impl SwapRouter {
    #[odra(init)]
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
    }

    pub fn swap(&mut self, token_in: Address, amount_in: U256, amount_out: U256, recipient: Address) {
        // Mock swap execution logic
        // In reality, this would call transfer on token_in (sender -> pool) and token_out (pool -> recipient)

        self.env().emit_event(SwapExecuted {
            sender: self.env().caller(),
            token_in,
            amount_in,
            amount_out,
            recipient,
        });
    }
}
