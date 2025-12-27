use odra::prelude::*;

#[odra::module]
pub struct BridgeController {
    pub admin: Var<Address>,
    pub relayers: Mapping<Address, bool>,
}

#[derive(Debug, PartialEq, Eq, Copy, Clone)]
pub enum Error {
    NotAdmin = 1,
}

#[odra::module]
impl BridgeController {
    #[odra(init)]
    pub fn init(&mut self) {
        self.admin.set(self.env().caller());
    }

    pub fn admin(&self) -> Address {
        self.admin.get().unwrap()
    }

    pub fn is_relayer(&self, address: Address) -> bool {
        self.relayers.get(&address).unwrap_or(false)
    }

    pub fn add_relayer(&mut self, relayer: Address) {
        let admin = self.admin.get().unwrap();
        if self.env().caller() != admin {
            panic!("NotAdmin");
        }
        self.relayers.set(&relayer, true);
    }

    pub fn remove_relayer(&mut self, relayer: Address) {
        let admin = self.admin.get().unwrap();
        if self.env().caller() != admin {
            panic!("NotAdmin");
        }
        self.relayers.set(&relayer, false);
    }

    pub fn set_admin(&mut self, new_admin: Address) {
        let admin = self.admin.get().unwrap();
        if self.env().caller() != admin {
            panic!("NotAdmin");
        }
        self.admin.set(new_admin);
    }
}
