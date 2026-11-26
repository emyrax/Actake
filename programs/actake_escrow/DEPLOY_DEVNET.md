# Deploying `actake_escrow` to Solana Devnet

The Actake web app works out of the box in **Devnet Ed25519 + Memo Broadcast Mode** (transactions are signed via MWA / WalletConnect and broadcast live on Solana Devnet). When you are ready to switch to the full PDA token-vault escrow contract, deploy this Anchor program in 4 steps:

## Prerequisites
- Rust + Cargo (`rustup`)
- Solana CLI (`solana --version`) configured for Devnet:
  ```bash
  solana config set --url devnet
  solana airdrop 2
  ```
- Anchor CLI (`anchor --version` >= 0.30.1)

## 1. Build & Sync Program ID
```bash
cd programs/actake_escrow
anchor build
anchor keys list
```
Copy the generated `actake_escrow` public key into:
1. `programs/actake_escrow/programs/actake_escrow/src/lib.rs` (`declare_id!("...")`)
2. `programs/actake_escrow/Anchor.toml` (`[programs.devnet]`)

Rebuild after updating the ID:
```bash
anchor build
```

## 2. Deploy to Solana Devnet
```bash
anchor deploy --provider.cluster devnet
```

## 3. Configure Actake Environment Secrets
Open **Settings -> Devnet Setup & Escrow Diagnostics** in the Actake web app to copy your persistent `ORACLE_PUBLIC_KEY_HEX` (generated from `ORACLE_PRIVATE_KEY_HEX`), then set these variables in AI Studio Secrets:

- `ORACLE_PRIVATE_KEY_HEX`: Your persistent 64-character hex Ed25519 seed
- `VITE_ACTAKE_ESCROW_PROGRAM_ID`: Your newly deployed Devnet Program ID
- `SOLANA_RPC_URL`: Optional dedicated Devnet RPC (e.g., Helius or QuickNode)
- `VITE_WALLETCONNECT_PROJECT_ID`: Your Reown / WalletConnect v2 Project ID

Once `VITE_ACTAKE_ESCROW_PROGRAM_ID` is set, Actake automatically encodes Anchor instruction discriminators, derives real PDAs (`["pool", pool_id]`, `["vault", pool]`, `["participant", pool, user]`), and submits `Ed25519Program` introspection instructions directly to your deployed program.
