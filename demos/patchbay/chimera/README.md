# chimera.wasm

The engine of [CHIMERA](https://github.com/jamesondh/chimera-vocal-synth) by Jameson Hodge
(MIT, see `LICENSE`): a physical-modelling voice. Lungs, vocal folds and a branched airway are
simulated in Rust and compiled to WebAssembly with no imports. The Patchbay sings `chant
engine=tract` lines on it (`tract-worklet.js` plays them; `tractNote` in `src.html` plans them).

This build is the one deployed at chimera-vocal-synth.vercel.app on 2026-11-09 (gesture layout
version 1, crate 0.1.0; the repo was at 092b16c). To rebuild it from source:

```sh
git clone https://github.com/jamesondh/chimera-vocal-synth && cd chimera-vocal-synth
rustup target add wasm32-unknown-unknown
cargo build -p chimera-wasm --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/chimera_wasm.wasm <otoji>/demos/patchbay/chimera/chimera.wasm
```

If the gesture layout version changes, `tract-worklet.js` must follow it
(`crates/chimera-wasm/src/lib.rs`).
