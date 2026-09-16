import { Wallet, JsonRpcProvider, ContractFactory, ZeroAddress, formatEther, isAddress, AbiCoder } from 'ethers';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compile } from './compile.mjs';
process.loadEnvFile('.env');
const rpc='https://rpc.bohr.life';
function safeError(error) {
  let message=error.shortMessage || error.reason || 'Deployment operation failed. Inspect local configuration and network connectivity.';
  for(const name of ['PRIVATE_KEY','BLOCKSCOUT_API_KEY']) if(process.env[name]) message=message.replaceAll(process.env[name],'[REDACTED]');
  return message;
}
try {
  if(!process.env.PRIVATE_KEY) throw new Error('Missing deployment key');
  const provider=new JsonRpcProvider(rpc);
  if((await provider.getNetwork()).chainId!==968n) throw new Error('Wrong chain ID');
  const wallet=new Wallet(process.env.PRIVATE_KEY,provider);
  const randomnessProvider=process.env.LUCKYPROOF_RANDOMNESS_PROVIDER || ZeroAddress;
  if(!isAddress(randomnessProvider)) throw new Error('Invalid randomness provider address');
  if(randomnessProvider!==ZeroAddress && await provider.getCode(randomnessProvider)==='0x') throw new Error('Provider has no code on testnet');
  const artifact=await compile();
  const factory=new ContractFactory(artifact.abi,artifact.bytecode,wallet);
  const transaction=await factory.getDeployTransaction(randomnessProvider);
  const gas=await wallet.estimateGas(transaction);
  const fees=await provider.getFeeData();
  const gasPrice=fees.gasPrice;
  if(!gasPrice)throw new Error('Missing gas price');
  const gasLimit=gas*120n/100n;
  const balance=await provider.getBalance(wallet.address);
  const maxFee=gasLimit*gasPrice;
  if(balance<maxFee)throw new Error('Insufficient test BOT');
  console.log(JSON.stringify({chainId:968,deployer:wallet.address,randomnessProvider,estimatedGas:gas.toString(),maxFeeBOT:formatEther(maxFee),balanceBOT:formatEther(balance)},null,2));
  if(!process.argv.includes('--broadcast')) { console.log('Preflight passed. No transaction sent.'); }
  else {
    await mkdir('deployments',{recursive:true});
    const contract=await factory.deploy(randomnessProvider,{gasLimit,gasPrice,type:0});
    const tx=contract.deploymentTransaction();
    const address=await contract.getAddress();
    const record={chainId:968,rpcUrl:rpc,explorerUrl:'https://scan.bohr.life',address,deployer:wallet.address,randomnessProvider,transactionHash:tx.hash,compilerVersion:artifact.compilerVersion,constructorArguments:AbiCoder.defaultAbiCoder().encode(['address'],[randomnessProvider]).slice(2),status:'submitted',submittedAt:new Date().toISOString()};
    await writeFile('deployments/botchain-testnet.json',JSON.stringify(record,null,2)+'\n');
    console.log('Deployment submitted: '+tx.hash);
    const receipt=await tx.wait(1,180000);
    if(receipt.status!==1 || await provider.getCode(address)==='0x')throw new Error('Deployment receipt failed');
    record.status='deployed';record.deploymentBlock=receipt.blockNumber;record.gasUsed=receipt.gasUsed.toString();
    await writeFile('deployments/botchain-testnet.json',JSON.stringify(record,null,2)+'\n');
    let env=await readFile('.env','utf8');
    const values={LUCKYPROOF_CONTRACT_ADDRESS:address,LUCKYPROOF_DEPLOYMENT_BLOCK:String(receipt.blockNumber),BOTCHAIN_CHAIN_ID:'968',BOTCHAIN_RPC_URL:rpc,BOTCHAIN_EXPLORER_URL:'https://scan.bohr.life'};
    for(const [name,value] of Object.entries(values)){const regex=new RegExp('^\\s*'+name+'\\s*=.*$','m');env=regex.test(env)?env.replace(regex,name+'='+value):env.trimEnd()+'\n'+name+'='+value+'\n';}
    await writeFile('.env',env);
    console.log(JSON.stringify({address,deploymentBlock:receipt.blockNumber,transactionHash:tx.hash,status:record.status},null,2));
  }
} catch(error) { console.error(safeError(error));process.exitCode=1; }
