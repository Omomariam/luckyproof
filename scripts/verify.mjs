import { readFile,writeFile } from 'node:fs/promises';
process.loadEnvFile('.env');
const api='https://scan.bohr.life/api';
async function request(parameters) {
  const response=await fetch(api,{method:'POST',body:new URLSearchParams({...parameters,apikey:process.env.BLOCKSCOUT_API_KEY || ''}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Explorer HTTP '+response.status);
  return response.json();
}
try {
  const record=JSON.parse(await readFile('deployments/botchain-testnet.json','utf8'));
  if(record.status!=='deployed'||record.chainId!==968)throw new Error('Confirmed testnet deployment required');
  const artifact=JSON.parse(await readFile('artifacts/LuckyProof.json','utf8'));
  const result=record.verification?.guid ? {status:'1',result:record.verification.guid} : await request({module:'contract',action:'verifysourcecode',codeformat:'solidity-standard-json-input',contractaddress:record.address,contractname:artifact.contractName,compilerversion:'v'+artifact.compilerVersion,sourceCode:JSON.stringify(artifact.input),constructorArguements:record.constructorArguments,autodetectConstructorArguments:'false'});
  if(result.status!=='1')throw new Error('Verification submission rejected: '+JSON.stringify(result));
  record.verification={status:'submitted',guid:result.result};await writeFile('deployments/botchain-testnet.json',JSON.stringify(record,null,2)+'\n');
  console.log('Verification submitted for '+record.address+'.');
  for(let attempt=0;attempt<24;attempt++){
    const status=await request({module:'contract',action:'checkverifystatus',guid:result.result});
    if(status.status==='1' && !/pending|queue|progress/i.test(status.result || '')){
      const source=await request({module:'contract',action:'getsourcecode',address:record.address});
      if(source.status!=='1'||!source.result?.[0]?.SourceCode)throw new Error('Source verification response has no verified source');
      record.verification={status:'verified',guid:result.result,verifiedAt:new Date().toISOString(),compilerVersion:source.result[0].CompilerVersion};await writeFile('deployments/botchain-testnet.json',JSON.stringify(record,null,2)+'\n');
      console.log('Verified: https://scan.bohr.life/address/'+record.address+'?tab=contract');process.exit(0);
    }
    if(!/pending|queue|progress|not found/i.test(status.result || ''))throw new Error('Verification failed: '+JSON.stringify(status));
    console.log('Verification pending ('+(attempt+1)+').');await new Promise(resolve=>setTimeout(resolve,5000));
  }
  throw new Error('Verification remains pending; retry status later.');
} catch(error) { let message=error.message || 'Verification failed';for(const name of ['PRIVATE_KEY','BLOCKSCOUT_API_KEY'])if(process.env[name])message=message.replaceAll(process.env[name],'[REDACTED]');console.error(message);process.exitCode=1; }
