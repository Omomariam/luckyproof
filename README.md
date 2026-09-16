# LuckyProof

Random selection, verifiably fair.

Free community draws with a public landing page and an EVM wallet connected workspace. No sample draws, invented users, browser-generated winners, or simulated chain activity are used. Previous local demo draw storage is removed on startup.

## Run

Requires Node.js 22 or newer (the server loads `.env` using `process.loadEnvFile`).

```sh
npm install
npm run dev
```

Open http://localhost:3000. Connect an installed EVM browser wallet using the landing page. Multiple wallets are discovered using EIP-6963 when supported. A connected wallet is required to enter Overview, All draws, Draw history, and Verify a result. Disconnect immediately clears the app session and returns to the landing page. The app attempts wallet permission revocation where supported. Reloading requires connecting again; wallet permissions themselves may persist in your wallet.

## Deployment configuration

LuckyProof is deployed and source-verified on BOT Chain testnet (chain ID 968).

- Contract: [0xAf9e1820f44b9d98011687c23755cB4E134C543B](https://scan.bohr.life/address/0xAf9e1820f44b9d98011687c23755cB4E134C543B?tab=contract)
- Deployment transaction: [0x53aa1da494333336aaabbc3a2253f33de52fa253c4fcf7d03e7cb0bc94576f28](https://scan.bohr.life/tx/0x53aa1da494333336aaabbc3a2253f33de52fa253c4fcf7d03e7cb0bc94576f28)
- Deployment block: 23600118
- Compiler: Solidity 0.8.24, Paris EVM, optimizer 200 runs.

The local environment is configured for this deployment. The public deployment record is in `deployments/botchain-testnet.json`. No sample draws or participants were created. Draw creation and registration are live. Winner selection remains disabled until a real randomness provider is configured. The deployment administrator can call `configureProvider(address)` exactly once; the provider cannot be replaced afterward. No simulated provider is deployed.

If the contract configuration is absent or unavailable, the workspace displays unavailable data and disables creation. There is no browser-local fallback.

Copy the values in `.env.example` into `.env`, then set:

- `LUCKYPROOF_CONTRACT_ADDRESS`: deployed contract implementing `contracts/LuckyProof.sol`.
- `LUCKYPROOF_DEPLOYMENT_BLOCK`: contract deployment block for event queries.
- `BOTCHAIN_CHAIN_ID`: 968 for testnet, or 677 for mainnet.
- `BOTCHAIN_RPC_URL` and `BOTCHAIN_EXPLORER_URL`: matching network endpoints.

Restart the server after configuration changes. The supplied guide provides the default BOT Chain network values. The testnet RPC chain ID and Blockscout API were verified during deployment. Deployment and verification use the local scripts below; private keys and API keys are never exposed through public configuration.

The server exposes only explicitly allowed public assets and a whitelist of public chain configuration values; `.env`, source contracts, test fixtures, and arbitrary filesystem paths are not served.

## Real contract flows

The app reads draw creation events, deadlines, states, participants, randomness, and winners from the configured contract through the connected wallet. Reads are pinned to a block snapshot. A failed read clears displayed data rather than substituting or retaining stale records.

Creation, participant registration, and randomness requests use wallet transactions and wait for confirmed receipts. Participation does not require a ticket payment; network gas fees apply. Randomness requests remain pending until the configured provider fulfills them. The app never generates random winners.

Verification checks the contract's `verifyWinner` response, recomputes `randomWord % participantCount` using full integer precision, and matches the winner recording event. The interface links the real contract, provider, and winner transaction and supports participant CSV and on-chain result JSON export. Result sharing uses a draw deep link; recipients must connect a wallet and use the same configured deployment.

## Contract and access limits

`contracts/LuckyProof.sol` accepts an optional provider at deployment, or a one-time administrator configuration afterward. Winner requests revert until a provider is configured. A provider must be a deployed, independently verified contract implementing `IRandomnessProvider`; no production provider is bundled. Review and provider-specific tests are required before enabling winner selection. Provider outages leave requests pending. One wallet per entry does not prevent multiple-wallet participation. Verification of winner arithmetic does not independently establish the provider's randomness provenance.

Wallet connection gates the frontend workspace; it is not signed authentication and does not conceal publicly accessible blockchain data. Contract permissions enforce blockchain actions. No private backend resources exist in this app.

## Checks

```sh
npm run check
node --test tests/chain.test.mjs
npx playwright test
```

Browser tests use installed Microsoft Edge. Wallet doubles exist exclusively in tests to exercise account removal, declined requests, and disconnect behavior; they do not ship in served app code. Fonts use Google Fonts with system fallback.

## Deployment scripts

```sh
npm run compile:contract
node scripts/deploy.mjs           # estimate only; no broadcast
npm run deploy:testnet            # deploy another instance; spends test BOT
npm run verify:testnet            # submit or resume source verification
node scripts/check-deployment.mjs # read-only deployed contract checks
```

Deployment and verification load `PRIVATE_KEY` and `BLOCKSCOUT_API_KEY` directly from `.env`. Deployment is fixed to chain ID 968 and refuses another network. The deploy script saves the public transaction record before awaiting confirmation, and configures the app only after a successful receipt. Do not rerun deployment to retry verification.
