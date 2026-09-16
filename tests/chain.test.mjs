import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protectedPage, winnerMatches, isAddress } from '../chain.js';
test('every app route requires a connected wallet', () => {
  for (const page of ['overview', 'draws', 'history', 'verify']) {
    assert.equal(protectedPage(`#/app/${page}`, false), null);
    assert.equal(protectedPage(`#/app/${page}`, true), page);
  }
  assert.equal(protectedPage('#/app/history?draw=1', true), 'history');
  assert.equal(protectedPage('#/app/unknown', true), null);
});
test('winner verification rejects changed outcomes and handles full uint256 words', () => {
  const participants = ['0x'+'1'.repeat(40), '0x'+'2'.repeat(40), '0x'+'3'.repeat(40)];
  const randomWord = (2n**256n-1n).toString();
  const winner = participants[Number(BigInt(randomWord)%3n)];
  const draw = { state: 2, participants, randomWord, winner };
  assert.equal(winnerMatches(draw), true);
  assert.equal(winnerMatches({...draw, winner:participants[1]}), false);
  assert.equal(winnerMatches({...draw, state:1}), false);
  assert.equal(winnerMatches({...draw, participants:[]}), false);
  assert.equal(isAddress(winner), true);
  assert.equal(isAddress('Guest explorer'), false);
});
