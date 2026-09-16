export const ABI = [
  'function drawCount() view returns (uint256)',
  'function provider() view returns (address)',
  'function draws(uint256) view returns (address creator,uint64 deadline,uint8 state,address winner,uint256 randomWord)',
  'function getParticipants(uint256) view returns (address[])',
  'function registered(uint256,address) view returns (bool)',
  'function createDraw(string,uint64) returns (uint256)',
  'function register(uint256)',
  'function selectWinner(uint256)',
  'function verifyWinner(uint256) view returns (bool)',
  'event DrawCreated(uint256 indexed id,address indexed creator,uint64 deadline,string title)',
  'event RandomnessRequested(uint256 indexed id,uint256 indexed requestId,bytes32 participantHash)',
  'event WinnerRecorded(uint256 indexed id,address indexed winner,uint256 randomWord,uint256 index)'
];
export function isAddress(value) { return /^0x[0-9a-fA-F]{40}$/.test(value || ''); }
export function shortAddress(address) { return address ? `${address.slice(0,6)}…${address.slice(-4)}` : ''; }
export function protectedPage(hash, connected) {
  const match = /^#\/app\/(overview|draws|history|verify)(?:\?.*)?$/.exec(hash);
  return match && connected ? match[1] : null;
}
export function winnerMatches(draw) {
  if (draw.state !== 2 || !draw.participants.length) return false;
  const index = Number(BigInt(draw.randomWord) % BigInt(draw.participants.length));
  return draw.participants[index].toLowerCase() === draw.winner.toLowerCase();
}
export function errorMessage(error) {
  if (error.code === 4001 || error.code === 'ACTION_REJECTED') return 'Wallet request declined.';
  return error.shortMessage || error.reason || error.message || 'Wallet request failed. Please retry.';
}
