import { readFile, writeFile, mkdir } from 'node:fs/promises';
import solc from 'solc';
const file = 'contracts/LuckyProof.sol';
export async function compile() {
  const input = { language:'Solidity', sources:{ [file]:{ content:await readFile(file,'utf8') } }, settings:{ optimizer:{ enabled:true, runs:200 }, evmVersion:'paris', outputSelection:{ '*':{ '*':['abi','evm.bytecode.object','evm.deployedBytecode.object','metadata'] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors?.filter(error=>error.severity==='error') || [];
  if(errors.length) throw new Error(errors.map(error=>error.formattedMessage).join('\n'));
  const compiled = output.contracts[file].LuckyProof;
  const artifact = { contractName:'contracts/LuckyProof.sol:LuckyProof', compilerVersion:solc.version().split('.Emscripten')[0], input, abi:compiled.abi, bytecode:'0x'+compiled.evm.bytecode.object, deployedBytecode:'0x'+compiled.evm.deployedBytecode.object };
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/LuckyProof.json',JSON.stringify(artifact,null,2)+'\n');
  console.log('Compiled LuckyProof with Solidity '+artifact.compilerVersion+' (Paris, optimizer 200 runs).');
  return artifact;
}
if(process.argv[1]?.endsWith('compile.mjs')) await compile();
