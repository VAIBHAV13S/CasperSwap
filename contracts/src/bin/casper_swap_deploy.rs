#![no_std]
#![no_main]

#[cfg(target_arch = "wasm32")]
extern crate alloc;

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn call() {
    // Entrypoint required by Casper VM.
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {}
