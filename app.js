import { ABI, isAddress, shortAddress, protectedPage, winnerMatches, errorMessage } from './chain.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let account = '', wallet = null, provider = null, contract = null, ethers = null, config = null;
let draws = [], loaded = false, filter = 'all', page = null, epoch = 0, loading = false, connecting = false, transactionPending = false, randomnessReady = false;
const discovered = new Map();
window.addEventListener('eip6963:announceProvider', event => { const detail = event.detail; if (detail?.info?.uuid && detail.provider?.request) discovered.set(detail.info.uuid, detail); });
window.dispatchEvent(new Event('eip6963:requestProvider'));
// Retire all old browser-generated draw data. No local draw records are read or written.
localStorage.removeItem('luckyproof.draws.v1');
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 5000); }
function modal(title, body) { if (!account) return; $('#dialog-body').innerHTML = `<div class="modal-top"><h2>${escape(title)}</h2><button class="close" aria-label="Close dialog">×</button></div>${body}`; $('#dialog .close').onclick = () => $('#dialog').close(); if (!$('#dialog').open) $('#dialog').showModal(); }
function clearData() { epoch++; draws = []; loaded = false; randomnessReady = false; contract = null; provider = null; loading = false; transactionPending = false; if ($('#dialog').open) $('#dialog').close(); render(); }
function route() {
  page = protectedPage(location.hash, Boolean(account));
  if (location.hash.startsWith('#/app') && !page) { history.replaceState(null, '', '#/'); }
  $('#landing').hidden = Boolean(page); $('#workspace-app').hidden = !page;
  if (!page) return;
  const title = { overview:'Overview', draws:'All draws', history:'Draw history', verify:'Verify a result' }[page];
  $('#page-title').innerHTML = `${title}<span class="title-dot">.</span>`; $('#crumb').textContent = title;
  filter = page === 'history' || page === 'verify' ? 'completed' : 'all';
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  render();
}
function updateWallet() {
  $('#wallet-address').textContent = shortAddress(account); $('#wallet-address').title = account; $('#sidebar-address').textContent = shortAddress(account);
  document.querySelectorAll('[data-connect]').forEach(button => { button.disabled = connecting; button.textContent = connecting ? 'Connecting…' : account ? 'Open workspace ↗' : 'Connect wallet ↗'; });
}
async function chooseWallet() {
  const options = [...discovered.values()];
  if (options.length === 1) return options[0].provider;
  if (options.length > 1) {
    $('#dialog-body').innerHTML = `<div class="modal-top"><h2>Connect your wallet</h2><button class="close" aria-label="Close dialog">×</button></div><p class="modal-copy">Choose an installed wallet.</p>${options.map((item,i) => `<button class="field" style="margin:6px 0;text-align:left" data-wallet="${i}">${escape(item.info.name)}</button>`).join('')}`;
    $('#dialog').showModal();
    return new Promise(resolve => { let done = false; const finish = value => { if(done)return; done=true; $('#dialog').removeEventListener('close', cancel); $('#dialog').close(); resolve(value); }; const cancel = () => finish(null); $('#dialog').addEventListener('close', cancel); $('#dialog .close').onclick = cancel; document.querySelectorAll('[data-wallet]').forEach(button => button.onclick = () => finish(options[Number(button.dataset.wallet)].provider)); });
  }
  if (window.ethereum?.request) return window.ethereum;
  throw new Error('No EVM wallet detected. Install a browser wallet or open this site in your wallet’s browser.');
}
async function connect() {
  if (account) { location.hash = '#/app/overview'; return; }
  if (connecting) return;
  connecting = true; updateWallet();
  try {
    const selected = await chooseWallet(); if (!selected) return;
    const accounts = await selected.request({ method:'eth_requestAccounts' });
    if (!isAddress(accounts?.[0])) throw new Error('The wallet did not provide an account.');
    wallet = selected; account = accounts[0];
    wallet.on?.('accountsChanged', accountsChanged); wallet.on?.('chainChanged', chainChanged); wallet.on?.('disconnect', walletDisconnected);
    $('#connect-status').textContent = `Connected: ${account}`; updateWallet(); location.hash = '#/app/overview'; route(); await loadChain();
  } catch (error) { $('#connect-status').textContent = errorMessage(error); toast(errorMessage(error)); }
  finally { connecting = false; updateWallet(); }
}
function removeWalletListeners() { wallet?.removeListener?.('accountsChanged', accountsChanged); wallet?.removeListener?.('chainChanged', chainChanged); wallet?.removeListener?.('disconnect', walletDisconnected); }
function endSession() { removeWalletListeners(); account = ''; wallet = null; clearData(); location.hash = '#/'; route(); updateWallet(); $('#connect-status').textContent = 'Wallet disconnected. Connect to access your workspace.'; }
async function disconnect() { const selected = wallet; endSession(); toast('Wallet disconnected.'); try { await selected?.request({ method:'wallet_revokePermissions', params:[{ eth_accounts:{} }] }); } catch { /* Some wallets do not support permission revocation; app access is already cleared. */ } }
function walletDisconnected() { endSession(); }
function accountsChanged(accounts) { if (!isAddress(accounts?.[0])) return endSession(); account = accounts[0]; clearData(); updateWallet(); route(); loadChain(); }
function chainChanged() { if (!account) return; clearData(); loadChain(); }
async function getConfig() { const response = await fetch('/api/config', { cache:'no-store' }); if (!response.ok) throw new Error('Unable to load chain configuration.'); const data = await response.json(); if (![968,677].includes(data.chainId) || !Number.isSafeInteger(data.deploymentBlock) || data.deploymentBlock < 0) throw new Error('Invalid chain configuration.'); return data; }
async function eventLogs(instance, eventFilter, from, to, token) { const events=[]; for(let block=from;block<=to;block+=2000){ if(token!==epoch || !account) throw new Error('Wallet session changed.'); events.push(...await instance.queryFilter(eventFilter, block, Math.min(block+1999,to))); } return events; }
async function loadChain() {
  if (!account || loading) return;
  clearData(); loading = true; const token = epoch; $('#chain-status').textContent = 'Reading connected network and contract…'; render();
  try {
    config = await getConfig(); if (token !== epoch) return;
    const chainId = Number(BigInt(await wallet.request({ method:'eth_chainId' }))); if(token!==epoch)return;
    $('#network-name').textContent = chainId === config.chainId ? config.chainName : `Connected chain: ${chainId}`;
    $('#switch-network').hidden = chainId === config.chainId;
    if (chainId !== config.chainId) throw new Error(`Switch to ${config.chainName} to read draws and submit transactions.`);
    if (!config.contractAddress) throw new Error('LuckyProof contract is not configured. No on-chain draws can be loaded yet.');
    if (!isAddress(config.contractAddress)) throw new Error('The configured contract address is invalid.');
    ethers ||= await import('/vendor/ethers.js');
    const currentProvider = new ethers.BrowserProvider(wallet); const signer = await currentProvider.getSigner(account);
    if (await currentProvider.getCode(config.contractAddress) === '0x') throw new Error('No contract is deployed at the configured address on this network.');
    const currentContract = new ethers.Contract(config.contractAddress, ABI, signer);
    const block = await currentProvider.getBlockNumber(); const options = { blockTag:block };
    const configuredProvider = await currentContract.provider(options);
    const count = Number(await currentContract.drawCount(options)); if (!Number.isSafeInteger(count) || config.deploymentBlock > block) throw new Error('Invalid contract count or deployment block.');
    const events = count ? await eventLogs(currentContract, currentContract.filters.DrawCreated(), config.deploymentBlock, block, token) : [];
    const titles = new Map(events.map(event => [event.args.id.toString(), event.args.title]));
    const records = [];
    for(let start=1;start<=count;start+=10){
      if(token!==epoch)return;
      const batch = await Promise.all(Array.from({length:Math.min(10,count-start+1)},async(_,offset)=>{ const id=String(start+offset); const [d, participants]=await Promise.all([currentContract.draws(id,options),currentContract.getParticipants(id,options)]); if(!titles.has(id)) throw new Error('Draw creation logs are missing. Check the configured deployment block.'); return {id,title:titles.get(id),creator:d.creator,deadline:Number(d.deadline)*1000,state:Number(d.state),winner:d.winner,randomWord:d.randomWord.toString(),participants:Array.from(participants),status:Number(d.state)===2?'completed':'active'}; }));
      records.push(...batch);
    }
    if(token!==epoch)return; provider=currentProvider; contract=currentContract; draws=records; loaded=true; randomnessReady=configuredProvider!==ethers.ZeroAddress;
    $('#chain-status').innerHTML = `Connected to ${escape(config.chainName)}. Contract: <a class="contract-link" href="${explorer('address',config.contractAddress)}" target="_blank" rel="noopener noreferrer">${escape(shortAddress(config.contractAddress))} ↗</a>${randomnessReady?'':'<br>Draw creation and registration are live. Winner selection is disabled until a real randomness provider is configured.'}`;
    $('#draw-source').textContent = `On-chain snapshot at block ${block.toLocaleString()}`;
    const shared = new URLSearchParams(location.hash.split('?')[1] || '').get('draw'); if(shared && draws.some(d=>d.id===shared)) openDraw(shared);
  } catch(error) { if(token===epoch){ $('#chain-status').textContent = errorMessage(error); $('#draw-source').textContent = 'On-chain data unavailable'; } }
  finally { if(token===epoch){loading=false; render();} }
}
function explorer(kind,value) { try { const base = new URL(config.explorerUrl); if(!['https:','http:'].includes(base.protocol))return '#'; return escape(new URL(`${kind}/${value}`,base.href.replace(/\/?$/,'/')).href); } catch { return '#'; } }
async function switchNetwork() { if(!account)return; try{config ||= await getConfig();const chainId='0x'+config.chainId.toString(16);try{await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}catch(error){if(error.code!==4902)throw error;await wallet.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:config.chainName,nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:[config.rpcUrl],blockExplorerUrls:[config.explorerUrl]}]});await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}if(!loading)await loadChain();}catch(error){toast(errorMessage(error));} }
function render() {
  const active=draws.filter(d=>d.state!==2).length, complete=draws.length-active;
  for(const [selector,value] of [['#total-stat',draws.length],['#active-stat',active],['#participants-stat',draws.reduce((n,d)=>n+d.participants.length,0)],['#verified-stat',complete],['#nav-count',draws.length],['#draw-count',draws.length],['#all-tab-count',draws.length],['#active-tab-count',active],['#completed-tab-count',complete]]) $(selector).textContent=loaded?value.toLocaleString():'—';
  $('#create-button').disabled=!account||!loaded||loading||transactionPending; $('#refresh').disabled=!account||loading||transactionPending;
  document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('selected',button.dataset.filter===filter));
  if(!loaded){$('#draw-grid').innerHTML=`<div class="chain-empty"><h3>${loading?'Loading on-chain draws…':'On-chain data unavailable'}</h3><p>${loading?'Reading the deployed contract through your wallet.':'Draws and totals will appear once a valid contract is configured and the correct network is connected.'}</p></div>`;return;}
  const list=draws.filter(d=>(filter==='all'||d.status===filter)&&d.title.toLowerCase().includes($('#search').value.toLowerCase())).sort((a,b)=>$('#sort').value==='participants'?b.participants.length-a.participants.length:$('#sort').value==='oldest'?Number(a.id)-Number(b.id):Number(b.id)-Number(a.id));
  $('#draw-grid').innerHTML=list.length?list.map(d=>`<article class="draw-card"><div class="card-art"><span class="status ${d.status}">${d.state===2?'✓ Completed':d.state===1?'Randomness pending':'Registration '+(Date.now()<d.deadline?'open':'closed')}</span><span class="art-symbol">✦</span><span class="free-tag">FREE PARTICIPATION</span></div><div class="card-body"><div class="card-category">DRAW #${d.id}</div><h4>${escape(d.title)}</h4><p class="card-description">Created by ${escape(shortAddress(d.creator))}</p><div class="card-meta"><span><strong>${d.participants.length}</strong> entries</span><span>${new Date(d.deadline).toLocaleDateString()}</span></div><div class="card-bottom"><span class="winner-label">${d.state===2?'Winner '+escape(shortAddress(d.winner)):'One entry per wallet'}</span><button class="card-button" data-open="${d.id}">${page==='verify'?'Verify result':'View '+(d.state===2?'result':'draw')} ↗</button></div></div></article>`).join(''):'<div class="chain-empty"><h3>No draws found.</h3><p>'+ (draws.length?'Try another filter or search.':'There are no draws in this deployed contract yet. Create the first one.')+'</p></div>';
  document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>{openDraw(button.dataset.open);if(page==='verify')verifyDraw(button.dataset.open);});
}
async function ensureSession() { if(!account||!contract||!loaded)throw new Error('Connect your wallet and load the contract first.');const token=epoch,selected=wallet,currentAccount=account;const accounts=await selected.request({method:'eth_accounts'});const chain=Number(BigInt(await selected.request({method:'eth_chainId'})));if(token!==epoch||currentAccount!==account||!accounts?.some(a=>a.toLowerCase()===currentAccount.toLowerCase())||chain!==config.chainId)throw new Error('Wallet account or network changed. Reconnect and retry.'); }
async function transact(send,success) { if(transactionPending)return; const token=epoch; transactionPending=true;render();try{await ensureSession();if(token!==epoch)return;toast('Confirm the transaction in your wallet.');const tx=await send(contract);if(token!==epoch)return;toast('Transaction submitted. Waiting for confirmation…');if($('#dialog').open)$('#dialog-body').innerHTML=`<div class="modal-top"><h2>Transaction pending</h2><button class="close" aria-label="Close dialog">×</button></div><p class="modal-copy">Waiting for blockchain confirmation.</p><a class="tx-link" href="${explorer('tx',tx.hash)}" target="_blank" rel="noopener noreferrer">View transaction ↗</a>`;if($('#dialog .close'))$('#dialog .close').onclick=()=>$('#dialog').close();const receipt=await tx.wait();if(token!==epoch)return;if(receipt.status!==1)throw new Error('Transaction reverted.');$('#dialog').close();toast(success);transactionPending=false;await loadChain();}catch(error){if(token===epoch)toast(errorMessage(error));}finally{if(token===epoch){transactionPending=false;render();}} }
function createDraw() { if(!account||!loaded)return;modal('Create a draw',`<p class="modal-copy">Create a free draw on ${escape(config.chainName)}. Your wallet will confirm the transaction; network gas fees apply.</p><form id="create-form"><label class="form-label" for="draw-name">Draw name</label><input class="field" id="draw-name" required maxlength="80"><label class="form-label" for="deadline">Registration deadline</label><input class="field" id="deadline" type="datetime-local" required><div class="modal-actions"><button class="primary">Create on-chain draw ↗</button></div></form>`);const date=new Date(Date.now()+86400000);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());$('#deadline').value=date.toISOString().slice(0,16);$('#create-form').onsubmit=e=>{e.preventDefault();const title=$('#draw-name').value.trim(),deadline=Math.floor(new Date($('#deadline').value).getTime()/1000);if(!title||!Number.isFinite(deadline)||deadline<=Date.now()/1000)return toast('Enter a draw name and future deadline.');transact(c=>c.createDraw(title,deadline),'Draw confirmed on-chain.');}; }
function openDraw(id) {
  if(!account||!loaded)return;const d=draws.find(x=>x.id===id);if(!d)return;
  const joined=d.participants.some(p=>p.toLowerCase()===account.toLowerCase());
  modal(d.title,`<div class="detail-pills"><span>Draw #${d.id}</span><span>${d.participants.length} entries</span><span>Free participation</span></div><p class="modal-copy">Creator: <span class="participant-address">${escape(d.creator)}</span><br>Registration deadline: ${new Date(d.deadline).toLocaleString()}</p>${d.state===2?`<div class="result">RECORDED WINNER<strong class="address-result">${escape(d.winner)}</strong></div><button class="primary" id="verify-proof">◇ Verify result</button> <button class="text-button" id="share-result">Share result ↗</button><div id="verification"></div>`:d.state===1?'<p class="notice">The contract is awaiting fulfillment from its configured randomness provider. Refresh to check for a winner.</p>':Date.now()<d.deadline?`<p class="modal-copy">Register ${escape(shortAddress(account))}. One entry per wallet. Network gas fees apply.</p><button class="primary" id="join-draw" ${joined?'disabled':''}>${joined?'Already registered':'Register wallet ↗'}</button>`:`<p class="notice">Registration is closed. Request randomness to select a winner through the contract’s provider.</p><div class="modal-actions"><button class="primary" id="select-winner" ${!d.participants.length||!randomnessReady?'disabled':''}>Request winner selection ↗</button></div>${!d.participants.length?'<p class="modal-copy">No participants registered. A winner cannot be selected.</p>':''}`}<div class="section-heading" style="margin-top:25px"><h3>On-chain participant list</h3><button class="text-button" id="export-list">CSV ↓</button></div><ul class="participant-list">${d.participants.map((p,i)=>`<li><span class="participant-address">${escape(p)}</span><small>#${i+1}</small></li>`).join('')||'<li>No registered wallets.</li>'}</ul><a class="tx-link" href="${explorer('address',config.contractAddress)}" target="_blank" rel="noopener noreferrer">View contract on explorer ↗</a>`);
  if($('#join-draw'))$('#join-draw').onclick=()=>transact(c=>c.register(id),'Registration confirmed on-chain.');
  if($('#select-winner'))$('#select-winner').onclick=()=>transact(c=>c.selectWinner(id),'Randomness requested. Awaiting provider fulfillment.');
  if($('#verify-proof'))$('#verify-proof').onclick=()=>verifyDraw(id);
  if($('#share-result'))$('#share-result').onclick=async()=>{const url=`${location.origin}/#/app/history?draw=${id}`;const text=`LuckyProof — ${d.title}\nWinner: ${d.winner}\n${url}\nContract: ${config.contractAddress}\nChain ID: ${config.chainId}`;try{await navigator.clipboard.writeText(text);toast('On-chain result link copied.');}catch{download(`draw-${id}-result.txt`,text,'text/plain');}};
  $('#export-list').onclick=()=>download(`draw-${id}-participants.csv`,'Index,Wallet\n'+d.participants.map((p,i)=>`${i+1},${p}`).join('\n'),'text/csv');
}
async function verifyDraw(id) {
  const token=epoch;try{await ensureSession();$('#verification').innerHTML='<p class="modal-copy">Checking live contract state and recorded randomness…</p>';const current=contract,block=await provider.getBlockNumber(),options={blockTag:block};const [d,participants,contractValid,randomnessProvider]=await Promise.all([current.draws(id,options),current.getParticipants(id,options),current.verifyWinner(id,options),current.provider(options)]);const record={state:Number(d.state),randomWord:d.randomWord.toString(),winner:d.winner,participants:Array.from(participants)};const valid=contractValid&&winnerMatches(record);const events=await eventLogs(current,current.filters.WinnerRecorded(id),config.deploymentBlock,block,token);const event=events.at(-1);const eventValid=event&&event.args.winner.toLowerCase()===d.winner.toLowerCase()&&event.args.randomWord===d.randomWord&&event.args.index===d.randomWord%BigInt(participants.length);if(token!==epoch||!$('#verification'))return;$('#verification').innerHTML=`<p class="notice ${valid&&eventValid?'verified':''}">${valid&&eventValid?'✓ Winner matches the on-chain randomness, participant list, and recording event.':'Winner verification failed.'}</p><div class="proof-code">Chain ID: ${config.chainId}<br>Contract: ${escape(config.contractAddress)}<br>Block: ${block}<br>Randomness provider: ${escape(randomnessProvider)}<br>Random word: ${d.randomWord}<br>Winner index (zero based): ${participants.length?d.randomWord%BigInt(participants.length):'Unavailable'}<br>Recorded winner: ${escape(d.winner)}</div><p class="modal-copy">This verifies the recorded outcome. Randomness provenance depends on the deployed provider’s proof and implementation.</p>${event?`<a class="tx-link" href="${explorer('tx',event.transactionHash)}" target="_blank" rel="noopener noreferrer">View winner transaction ↗</a>`:''}<button class="text-button" id="export-proof">Download on-chain result JSON ↓</button>`;$('#export-proof').onclick=()=>download(`draw-${id}-result.json`,JSON.stringify({chainId:config.chainId,contract:config.contractAddress,id,block,randomnessProvider,...record,winnerTransaction:event?.transactionHash,verified:Boolean(valid&&eventValid)},null,2),'application/json');}catch(error){if(token===epoch)toast(errorMessage(error));}
}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.addEventListener('hashchange',route);
document.querySelectorAll('[data-connect]').forEach(button=>button.onclick=connect);
document.querySelectorAll('[data-disconnect]').forEach(button=>button.onclick=disconnect);
document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{if(account)location.hash=`#/app/${button.dataset.page}`;});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{if(!account)return;filter=button.dataset.filter;render();});
$('#search').oninput=render;$('#sort').onchange=render;$('#create-button').onclick=createDraw;$('#refresh').onclick=loadChain;$('#switch-network').onclick=switchNetwork;
$('#how-button').onclick=()=>modal('How draws work','<p class="modal-copy">Create a draw with a wallet transaction. Register before the deadline. When registration closes, request randomness from the configured contract provider. Once fulfilled, the contract records the winner. Verify the winner against the on-chain participant list and random word.</p>');
$('#dialog').onclick=event=>{if(event.target===$('#dialog'))$('#dialog').close();};
document.addEventListener('keydown',event=>{if(account&&page&&event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('#search').focus();}});
updateWallet();route();render();
