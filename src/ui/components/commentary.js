// Turns engine events into short commentary lines.

import { teamOf } from '../../core/national.js';

const nm = (game, id) => (id ? game.players[id].last : '?');

export function commentary(game, m, e) {
  const club = (i) => teamOf(game, m.sides[i].clubId).short;
  switch (e.type) {
    case 'kickoff':
      return { PRE: 'Kick-off!', '1H': 'Kick-off!', '2H': 'The second half is under way.', ET1: 'Extra time begins.',
        ET2: 'The second half of extra time begins.' }[e.period] || 'Kick-off!';
    case 'corner': return `Corner to ${club(e.side)}. ${nm(game, e.playerId)} takes it...`;
    case 'freekick': return `Free kick to ${club(e.side)} in a shooting position. ${nm(game, e.playerId)} stands over it...`;
    case 'penalty': return `Penalty! ${e.foulerId ? `${nm(game, e.foulerId)} brings down ` : ''}${nm(game, e.playerId)} in the box.`;
    case 'goal': {
      const how = e.penalty ? 'from the penalty spot' : e.freekick ? 'with a superb free kick' : e.header ? 'with a header' : '';
      return `GOAL! ${nm(game, e.playerId)} scores for ${club(e.side)} ${how}${e.assistId ? ` (assist ${nm(game, e.assistId)})` : ''}`;
    }
    case 'save':
      return e.freekick ? `${nm(game, e.playerId)} curls it towards goal, ${e.gkId ? nm(game, e.gkId) : 'the keeper'} tips it away!`
        : e.header ? `${nm(game, e.playerId)} heads goalwards, ${e.gkId ? nm(game, e.gkId) : 'the keeper'} saves!`
          : `${nm(game, e.playerId)} shoots, ${e.gkId ? nm(game, e.gkId) : 'the keeper'} saves!`;
    case 'miss':
      if (e.duelLost) return `Cross into the box: ${nm(game, e.playerId)} is beaten in the air.`;
      return e.post ? `${nm(game, e.playerId)} hits the post!`
        : e.freekick ? `${nm(game, e.playerId)}'s free kick goes over the wall and wide.`
          : e.header ? `${nm(game, e.playerId)} heads over from the corner.` : `${nm(game, e.playerId)} shoots wide.`;
    case 'penmiss': return `Penalty to ${club(e.side)}... ${nm(game, e.playerId)} fails to score!`;
    case 'yellow': return `Yellow card for ${nm(game, e.playerId)} (${club(e.side)}).`;
    case 'red': return e.second ? `Second yellow! ${nm(game, e.playerId)} is sent off.` : `Red card! ${nm(game, e.playerId)} is sent off.`;
    case 'injury': return `${nm(game, e.playerId)} (${club(e.side)}) is injured.`;
    case 'sub': return `Substitution ${club(e.side)}: ${nm(game, e.playerId)} on for ${nm(game, e.otherId)}${e.reason === 'injury' ? ' (injury)' : ''}.`;
    case 'half': return 'Half-time.';
    case 'fulltime90': return m.agg ? 'Level on aggregate after 90 minutes: extra time!' : 'Level after 90 minutes: extra time!';
    case 'pens': return `${club(e.side)} win the penalty shootout ${Math.max(e.h, e.a)}:${Math.min(e.h, e.a)}.`;
    case 'full': return 'Full-time.';
    default: return null;
  }
}
