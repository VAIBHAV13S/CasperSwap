use odra::prelude::*;

#[odra::module]
pub struct RelayerRegistry {
    pub admin: Var<Address>,
    pub relayers: Mapping<Address, bool>,
}

#[derive(Debug, PartialEq, Eq, Copy, Clone)]
pub enum Error {
    NotAdmin = 1,
    AlreadyRelayer = 2,
    NotRelayer = 3,
}

#[odra::module]
impl RelayerRegistry {
    #[odra(init)]
    pub fn init(&mut self) {
        self.admin.set(self.env().caller());
    }

    pub fn add_relayer(&mut self, relayer: Address) {
        let admin = self.admin.get().unwrap();
        if self.env().caller() != admin {
            panic!("NotAdmin");
        }
        if self.relayers.get(&relayer).unwrap_or(false) {
            return;
        }
        self.relayers.set(&relayer, true);
    }

    pub fn remove_relayer(&mut self, relayer: Address) {
        let admin = self.admin.get().unwrap();
        if self.env().caller() != admin {
            panic!("NotAdmin");
        }
        if !self.relayers.get(&relayer).unwrap_or(false) {
            return;
        }
        self.relayers.set(&relayer, false);
    }

    pub fn is_relayer(&self, address: Address) -> bool {
        self.relayers.get(&address).unwrap_or(false)
    }
}
