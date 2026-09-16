import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const chainId = Number(process.env.BOTCHAIN_CHAIN_ID || 968);
if (![968, 677].includes(chainId)) throw new Error('BOTCHAIN_CHAIN_ID must be 968 or 677');
const publicConfig = { contractAddress: process.env.LUCKYPROOF_CONTRACT_ADDRESS || '', deploymentBlock: Number(process.env.LUCKYPROOF_DEPLOYMENT_BLOCK || 0), chainId, chainName: chainId === 677 ? 'BOT Chain Mainnet' : 'BOT Chain Testnet', rpcUrl: process.env.BOTCHAIN_RPC_URL || (chainId === 677 ? 'https://rpc.botchain.ai' : 'https://rpc.bohr.life'), explorerUrl: process.env.BOTCHAIN_EXPLORER_URL || (chainId === 677 ? 'https://scan.botchain.ai' : 'https://scan.bohr.life') };
const routes = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/styles.css', 'styles.css'], ['/app.js', 'app.js'], ['/chain.js', 'chain.js'], ['/favicon.svg', 'favicon.svg'], ['/vendor/ethers.js', 'node_modules/ethers/dist/ethers.min.js']]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/config') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify(publicConfig)); return; }
    const route = routes.get(url.pathname);
    if (!route) { res.writeHead(404); res.end('Not found'); return; }
    const data = await readFile(path.join(root, route));
    res.writeHead(200, { 'Content-Type': types[path.extname(route)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT) || 3000, () => console.log('LuckyProof running at http://localhost:3000'));
