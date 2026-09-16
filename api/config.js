export default function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const chainId = Number(process.env.BOTCHAIN_CHAIN_ID || 968);
  if (![968, 677].includes(chainId)) return res.status(500).json({ error: 'Invalid chain configuration' });
  const testnet = chainId === 968;
  const contractAddress = process.env.LUCKYPROOF_CONTRACT_ADDRESS || (testnet ? '0xAf9e1820f44b9d98011687c23755cB4E134C543B' : '');
  const deploymentBlock = Number(process.env.LUCKYPROOF_DEPLOYMENT_BLOCK || (testnet && contractAddress.toLowerCase() === '0xaf9e1820f44b9d98011687c23755cb4e134c543b' ? 23600118 : 0));
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) return res.status(500).json({ error: 'Invalid deployment block' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    chainId, contractAddress, deploymentBlock,
    chainName: testnet ? 'BOT Chain Testnet' : 'BOT Chain Mainnet',
    rpcUrl: process.env.BOTCHAIN_RPC_URL || (testnet ? 'https://rpc.bohr.life' : 'https://rpc.botchain.ai'),
    explorerUrl: process.env.BOTCHAIN_EXPLORER_URL || (testnet ? 'https://scan.bohr.life' : 'https://scan.botchain.ai')
  });
}
