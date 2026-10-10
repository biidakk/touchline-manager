// Visual play-by-play for the live match. The engine decides what happens in
// a minute (who has the ball, how far they get, shots and their outcome); this
// module turns that into a believable sequence on the pitch: tackles, short
// passes that progress towards the target zone, dribbles, the final ball to
// the shooter and the shot itself, with both teams keeping their shape and
// shifting with the ball.
//
// Coordinates are percentages of the pitch: x 0..100 (left goal to right
// goal), y 0..100 (top touchline to bottom).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 0.66); // pitch is wider than tall

function weightedPick(items, w) {
  let total = 0;
  for (const it of items) total += w(it);
  let r = Math.random() * total;
  for (const it of items) {
    r -= w(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export class MatchAnim {
  constructor(game, m, formations) {
    this.g = game;
    this.m = m;
    this.F = formations;
    this.ball = { x: 50, y: 50 };
    this.holder = null; // { side, id }
    this.noise = new Map();
  }

  // Attacking direction of a side: +1 = towards the right-hand goal.
  // Teams change ends at half-time.
  dir(side) {
    const second = ['2H', 'ET2'].includes(this.m.period) || this.m.period === 'FT';
    return (side === 0 ? 1 : -1) * (second ? -1 : 1);
  }

  goalX(side) { return this.dir(side) > 0 ? 100 : 0; }

  base(side, slot) {
    const s = this.m.sides[side];
    const [, fx, fy] = this.F[s.formation][slot];
    const depth = (100 - fy) / 100; // keeper ~0.07 .. striker ~0.85
    const d = this.dir(side);
    const x = d > 0 ? 3 + depth * 62 : 97 - depth * 62;
    const y = d > 0 ? 8 + fx * 0.84 : 92 - fx * 0.84;
    return { x, y };
  }

  onPitch(side) {
    const s = this.m.sides[side];
    return s.slots.map((id, slot) => ({ id, slot, gk: s.slotPos[slot] === 'G' })).filter((p) => p.id);
  }

  jitter(key) {
    let n = this.noise.get(key);
    if (!n) { n = { x: 0, y: 0 }; this.noise.set(key, n); }
    n.x = clamp(n.x + (Math.random() - 0.5) * 2, -3, 3);
    n.y = clamp(n.y + (Math.random() - 0.5) * 2, -3, 3);
    return n;
  }

  // Positions of every player for the current ball and holder.
  shape(withNoise = false) {
    if (this.sp) return this.setPieceShape(withNoise);
    const out = new Map();
    const { x: bx, y: by } = this.ball;
    const poss = this.holder ? this.holder.side : -1;
    for (const side of [0, 1]) {
      const d = this.dir(side);
      // How far the ball is into this side's attacking half (-1 own goal .. +1 their goal).
      const adv = ((bx - 50) / 50) * d;
      for (const p of this.onPitch(side)) {
        const b = this.base(side, p.slot);
        let x;
        let y;
        if (p.gk) {
          x = b.x + d * Math.max(0, adv) * 6;
          y = 50 + (by - 50) * 0.25;
        } else {
          // The block slides with the ball; the team in possession pushes up, the other drops.
          x = b.x + (bx - 50) * 0.33 + (poss === side ? d * 7 : -d * 3);
          y = b.y + (by - 50) * 0.22;
          if (poss !== side) y = 50 + (y - 50) * 0.85; // defending side narrows
        }
        if (withNoise) {
          const n = this.jitter(`${side}-${p.id}`);
          x += n.x;
          y += n.y;
        }
        out.set(`${side}-${p.id}`, { x: clamp(x, 2, 98), y: clamp(y, 5, 95) });
      }
    }
    if (this.holder) {
      const d = this.dir(this.holder.side);
      out.set(`${this.holder.side}-${this.holder.id}`, { x: clamp(bx - d * 1.3, 1, 99), y: clamp(by, 4, 96) });
      // The nearest opponent closes the ball carrier down.
      const opp = 1 - this.holder.side;
      let best = null;
      for (const p of this.onPitch(opp)) {
        if (p.gk) continue;
        const pos = out.get(`${opp}-${p.id}`);
        const dd = dist(pos, this.ball);
        if (!best || dd < best.d) best = { key: `${opp}-${p.id}`, pos, d: dd };
      }
      if (best && best.d < 22) {
        const k = best.d < 6 ? 0.3 : 0.55;
        out.set(best.key, { x: best.pos.x + (bx + d * 2 - best.pos.x) * k, y: best.pos.y + (by - best.pos.y) * k });
      }
    }
    return out;
  }

  nearest(side, point, { noGk = true } = {}) {
    const pos = this.shape();
    let best = null;
    for (const p of this.onPitch(side)) {
      if (noGk && p.gk) continue;
      const dd = dist(pos.get(`${side}-${p.id}`), point);
      if (!best || dd < best.d) best = { id: p.id, d: dd };
    }
    return best ? best.id : null;
  }

  keeper(side) {
    const k = this.onPitch(side).find((p) => p.gk);
    return k ? k.id : this.nearest(side, { x: 100 - this.goalX(1 - side), y: 50 }, { noGk: false });
  }

  // Next receiver: a team-mate at a sensible passing distance, preferring
  // those who move the ball towards targetX.
  receiver(side, targetX) {
    const pos = this.shape();
    const d = this.dir(side);
    const from = this.ball;
    const cands = this.onPitch(side).filter((p) => !this.holder || p.id !== this.holder.id);
    const pick = weightedPick(cands, (p) => {
      const q = pos.get(`${side}-${p.id}`);
      const len = dist(q, from);
      const progress = (q.x - from.x) * d;
      let w = Math.exp(-(((len - 16) / 12) ** 2));
      w *= Math.exp(-Math.abs(q.x - targetX) / 30);
      if (progress < -12) w *= 0.35;
      if (p.gk) w *= (targetX - 50) * d < -20 ? 0.6 : 0.05;
      if (p.id === this.lastPasser) w *= 0.2; // avoid endless one-twos
      return w + 1e-6;
    });
    this.lastPasser = this.holder ? this.holder.id : null;
    return { id: pick.id, at: pos.get(`${side}-${pick.id}`) };
  }

  // ---- planning ----

  snapshot() { return { ball: { ...this.ball }, holder: this.holder ? { ...this.holder } : null, sp: this.sp || null }; }

  stepTo(steps, kind, ball, holder, extra = {}) {
    this.ball = { x: clamp(ball.x, -1, 101), y: clamp(ball.y, 2, 98) };
    this.holder = holder;
    steps.push({ kind, ...this.snapshot(), ...extra });
  }

  // 0 = own goal line .. 1 = opponent's goal line, for `side`.
  progress(side, x) { return this.dir(side) > 0 ? x / 100 : 1 - x / 100; }

  // Gives the ball to `side` if the other team has it: the keeper kicks long
  // and the ball is won in midfield, otherwise a pass is intercepted or the
  // carrier is tackled.
  winBall(steps, side) {
    if (this.holder && this.holder.side === side) return;
    if (!this.holder) {
      const id = this.nearest(side, this.ball);
      if (id) this.stepTo(steps, 'loose', this.ball, { side, id });
      return;
    }
    const other = this.holder.side;
    const od = this.dir(other);
    const os = this.m.sides[other];
    const hs = os.slots.indexOf(this.holder.id);
    const isKeeper = hs >= 0 && os.slotPos[hs] === 'G';
    let point;
    if (isKeeper) {
      point = { x: this.ball.x + od * (35 + Math.random() * 15), y: 25 + Math.random() * 50 };
    } else if (Math.random() < 0.6) {
      const r = this.receiver(other, this.ball.x + od * 15);
      const t = 0.4 + Math.random() * 0.3;
      point = { x: this.ball.x + (r.at.x - this.ball.x) * t, y: this.ball.y + (r.at.y - this.ball.y) * t };
    } else {
      point = { ...this.ball };
    }
    this.ball = point;
    const id = this.nearest(side, point);
    if (id) this.stepTo(steps, isKeeper ? 'header' : 'tackle', point, { side, id });
  }

  // Passing move for `side`. Without a forced target the team works the ball
  // forwards from where it is, and recycles it once it reaches the final third.
  buildUp(steps, side, forcedTarget, passes) {
    this.winBall(steps, side);
    const d = this.dir(side);
    for (let k = 0; k < passes; k++) {
      const adv = this.progress(side, this.ball.x);
      const targetX = forcedTarget ?? (adv > 0.78
        ? this.ball.x - d * (8 + Math.random() * 10)
        : this.ball.x + d * (4 + Math.random() * 20));
      if (Math.random() < 0.3 && this.holder && adv < 0.8) {
        // Carry the ball forward a few metres.
        const nx = this.ball.x + d * (5 + Math.random() * 8);
        this.stepTo(steps, 'dribble', { x: nx, y: this.ball.y + (Math.random() - 0.5) * 8 }, this.holder);
        continue;
      }
      const r = this.receiver(side, targetX);
      this.stepTo(steps, 'pass', r.at, { side, id: r.id });
    }
  }

  // ---- shots and set pieces ----

  // Where the shot ends up, and who has the ball afterwards.
  outcome(steps, e) {
    const side = e.side;
    const d = this.dir(side);
    const gx = this.goalX(side);
    const opp = 1 - side;
    if (e.type === 'goal') {
      this.stepTo(steps, 'goal', { x: gx + d * 0.8, y: 46 + Math.random() * 8 }, null, { sp: this.sp, ev: e });
      this.sp = null;
      this.stepTo(steps, 'reset', { x: 50, y: 50 }, { side: opp, id: this.kicker(opp) }, { hold: true });
    } else if (e.type === 'save' || (e.type === 'penmiss' && Math.random() < 0.6)) {
      const gk = this.keeper(opp);
      this.stepTo(steps, 'save', { x: gx - d * 1.5, y: 42 + Math.random() * 16 }, gk ? { side: opp, id: gk } : null, { sp: this.sp, ev: e });
      this.sp = null;
    } else {
      const wide = Math.random() < 0.5 ? -1 : 1;
      const y = e.post ? 50 + wide * 5.5 : 50 + wide * (9 + Math.random() * 10);
      this.stepTo(steps, 'miss', { x: gx + d * 1.5, y }, null, { sp: this.sp, ev: e });
      this.sp = null;
      const gk = this.keeper(opp);
      if (gk) this.stepTo(steps, 'goalkick', { x: gx - d * 5, y: 50 }, { side: opp, id: gk });
    }
  }

  // Open-play shot: a short move, the final ball, then the shot.
  openPlayShot(steps, e, maxSteps) {
    const d = this.dir(e.side);
    const gx = this.goalX(e.side);
    const budget = Math.max(1, maxSteps - 2 - (e.type === 'goal' ? 1 : 0));
    this.buildUp(steps, e.side, gx - d * 22, Math.min(budget, 1 + Math.floor(Math.random() * 3)));
    if (!this.holder || this.holder.id !== e.playerId) {
      const at = { x: gx - d * (8 + Math.random() * 12), y: 50 + (Math.random() - 0.5) * 34 };
      this.stepTo(steps, 'pass', at, { side: e.side, id: e.playerId });
    }
    this.outcome(steps, e);
  }

  // Corner: the ball goes behind, is placed at the flag, the box fills up,
  // then the cross. `header` is the headed chance that follows, if any.
  cornerKick(steps, e, header) {
    const side = e.side;
    const d = this.dir(side);
    const gx = this.goalX(side);
    const top = Math.random() < 0.5;
    this.stepTo(steps, 'out', { x: gx + d * 0.5, y: top ? 30 : 70 }, null);
    this.sp = { type: 'corner', side, flag: { x: gx - d * 0.6, y: top ? 1.5 : 98.5 } };
    this.stepTo(steps, 'corner', this.sp.flag, { side, id: e.playerId || this.kicker(side) }, { sp: this.sp, hold: true, ev: e });
    if (header) {
      const pos = this.shape();
      const at = pos.get(`${side}-${header.playerId}`) || { x: gx - d * 8, y: 50 };
      this.stepTo(steps, 'cross', at, { side, id: header.playerId }, { sp: this.sp });
      this.outcome(steps, header);
    } else {
      // Headed clear by a defender.
      const at = { x: gx - d * (6 + Math.random() * 5), y: 40 + Math.random() * 20 };
      const def = this.nearest(1 - side, at);
      this.stepTo(steps, 'cross', at, def ? { side: 1 - side, id: def } : null, { sp: this.sp });
      this.sp = null;
      const clear = { x: gx - d * (25 + Math.random() * 15), y: 20 + Math.random() * 60 };
      const who = this.nearest(Math.random() < 0.5 ? side : 1 - side, clear);
      this.stepTo(steps, 'clear', clear, who ? { side: this.sideOf(who), id: who } : null);
    }
  }

  // Direct free kick: the ball is placed, the wall lines up, then the shot.
  freeKickShot(steps, e, shot) {
    const side = e.side;
    const d = this.dir(side);
    const gx = this.goalX(side);
    const spot = { x: gx - d * (19 + Math.random() * 9), y: 28 + Math.random() * 44 };
    this.sp = { type: 'freekick', side, spot };
    this.stepTo(steps, 'foul', spot, { side, id: e.playerId }, { sp: this.sp, hold: true, ev: e });
    this.stepTo(steps, 'setup', spot, { side, id: e.playerId }, { sp: this.sp, hold: true });
    if (shot) this.outcome(steps, shot);
    else this.sp = null;
  }

  // Penalty: foul in the box, everyone out of the area, shot from the spot.
  penaltyKick(steps, e, shot) {
    const side = e.side;
    const d = this.dir(side);
    const gx = this.goalX(side);
    const foulAt = { x: gx - d * (7 + Math.random() * 6), y: 35 + Math.random() * 30 };
    this.stepTo(steps, 'foul', foulAt, { side, id: e.playerId }, { hold: true, ev: e });
    const spot = { x: gx - d * 10.5, y: 50 };
    this.sp = { type: 'penalty', side, spot };
    this.stepTo(steps, 'spot', spot, { side, id: e.playerId }, { sp: this.sp, hold: true });
    if (shot) this.outcome(steps, shot);
    else this.sp = null;
  }

  sideOf(id) { return this.m.sides[0].slots.includes(id) ? 0 : 1; }

  kicker(side) {
    const fwd = this.onPitch(side).filter((p) => this.m.sides[side].slotPos[p.slot] === 'F');
    return (fwd[0] || this.onPitch(side).find((p) => !p.gk) || this.onPitch(side)[0]).id;
  }

  // Player positions while a set piece is being taken.
  setPieceShape(withNoise) {
    const out = new Map();
    const sp = this.sp;
    const att = sp.side;
    const def = 1 - att;
    const d = this.dir(att);
    const gx = this.goalX(att);
    const put = (side, id, x, y) => {
      let px = x;
      let py = y;
      if (withNoise) { const n = this.jitter(`${side}-${id}`); px += n.x * 0.4; py += n.y * 0.4; }
      out.set(`${side}-${id}`, { x: clamp(px, 2, 97.5), y: clamp(py, 4, 96) });
    };
    const attackers = this.onPitch(att).filter((p) => !p.gk);
    const defenders = this.onPitch(def).filter((p) => !p.gk);
    const aGk = this.onPitch(att).find((p) => p.gk);
    const dGk = this.onPitch(def).find((p) => p.gk);
    if (aGk) put(att, aGk.id, this.base(att, aGk.slot).x, 50);
    if (dGk) put(def, dGk.id, gx - d * 1.2, 50);
    const taker = this.holder && this.holder.side === att ? this.holder.id : null;
    const posOf = (p, s) => this.m.sides[s].slotPos[p.slot];

    if (sp.type === 'penalty') {
      // Everyone on the edge of the area (both teams mixed), the taker at the spot.
      const a = attackers.filter((p) => p.id !== taker).map((p) => [att, p]);
      const b = defenders.map((p) => [def, p]);
      const all = [];
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        if (b[k]) all.push(b[k]);
        if (a[k]) all.push(a[k]);
      }
      // Two staggered rows outside the area, spread across its whole width.
      const rows = [[], []];
      all.forEach((x, k) => rows[k % 2].push(x));
      rows.forEach((row, r) => row.forEach(([s, p], k) => {
        const t = row.length > 1 ? k / (row.length - 1) : 0.5;
        const arc = Math.sin(t * Math.PI) * 3; // further out in the middle, like the D
        put(s, p.id, gx - d * (18 + r * 7 + arc), 10 + t * 80 + r * 3);
      }));
      if (taker) put(att, taker, sp.spot.x - d * 1.2, sp.spot.y);
      return out;
    }

    // Corner or free kick: tall players go forward, the rest hold.
    const inBox = attackers.filter((p) => p.id !== taker)
      .sort((a, b) => (posOf(b, att) === 'D' || posOf(b, att) === 'F') - (posOf(a, att) === 'D' || posOf(a, att) === 'F'))
      .slice(0, 5);
    inBox.forEach((p, k) => put(att, p.id, gx - d * (5 + (k % 3) * 4), 36 + k * 7));
    attackers.filter((p) => p.id !== taker && !inBox.includes(p)).forEach((p, k) => {
      const back = posOf(p, att) === 'D';
      put(att, p.id, back ? 50 + d * 5 : gx - d * (24 + k * 3), back ? 30 + k * 20 : 30 + k * 15);
    });
    let k = 0;
    const markers = defenders.slice();
    if (sp.type === 'freekick') {
      // A four-man wall 9.15 m from the ball, on the line to goal.
      const vx = (gx - sp.spot.x) * 1.05; // to metres
      const vy = (50 - sp.spot.y) * 0.68;
      const len = Math.hypot(vx, vy) || 1;
      const wx = sp.spot.x + ((vx / len) * 9.15) / 1.05;
      const wy = sp.spot.y + ((vy / len) * 9.15) / 0.68;
      const px = -vy / len;
      const py = vx / len;
      const wall = markers.splice(0, 4);
      wall.forEach((p, j) => {
        const off = (j - 1.5) * 2.4; // metres apart (shirts are drawn larger than life)
        put(def, p.id, wx + (px * off) / 1.05, wy + (py * off) / 0.68);
      });
    }
    // Defenders mark the attackers in the box, the rest guard the edge.
    for (const p of markers) {
      const target = inBox[k];
      if (target) {
        const tp = out.get(`${att}-${target.id}`);
        put(def, p.id, tp.x + d * 1.5, tp.y + 1.5);
      } else put(def, p.id, gx - d * (18 + (k % 2) * 3), 25 + (k * 11) % 50);
      k++;
    }
    if (taker) {
      const at = sp.type === 'corner' ? sp.flag : sp.spot;
      put(att, taker, at.x - d * 1.2, at.y);
    }
    return out;
  }

  // Plans the animation for one engine minute. Returns a list of steps; the
  // current state is restored, and apply() then replays the steps in turn.
  plan(events, maxSteps) {
    const start = this.snapshot();
    const steps = [];
    const m = this.m;
    if (this.holder && !m.sides[this.holder.side].slots.includes(this.holder.id)) this.holder = null;

    const kickoff = events.find((e) => e.type === 'kickoff');
    if (kickoff) {
      const side = ['2H', 'ET2'].includes(m.period) ? 1 : 0;
      this.stepTo(steps, 'kickoff', { x: 50, y: 50 }, { side, id: this.kicker(side) }, { hold: true, ev: kickoff });
    }
    const isShot = (e) => e && ['goal', 'save', 'miss', 'penmiss'].includes(e.type);
    let acted = false;
    for (let k = 0; k < events.length; k++) {
      const e = events[k];
      const next = events[k + 1];
      if (e.type === 'corner') {
        const header = isShot(next) && next.header && next.side === e.side ? next : null;
        // The corner comes after the shot that caused it, so the move is already on screen.
        this.cornerKick(steps, e, header);
        if (header) k++;
        acted = true;
      } else if (e.type === 'freekick') {
        const shot = isShot(next) && next.freekick ? next : null;
        this.freeKickShot(steps, e, shot);
        if (shot) k++;
        acted = true;
      } else if (e.type === 'penalty') {
        const shot = isShot(next) && next.penalty ? next : null;
        this.penaltyKick(steps, e, shot);
        if (shot) k++;
        acted = true;
      } else if (isShot(e)) {
        this.openPlayShot(steps, e, maxSteps);
        acted = true;
      }
    }
    if (!acted && !events.some((e) => ['half', 'full', 'fulltime90'].includes(e.type))) {
      const side = m.ball.side;
      this.buildUp(steps, side, null, Math.max(1, maxSteps - (this.holder && this.holder.side !== side ? 1 : 0)));
    }
    if (events.some((e) => e.type === 'yellow' || e.type === 'red' || e.type === 'injury')) {
      steps.push({ kind: 'stoppage', ...this.snapshot(), hold: true });
    }

    this.ball = start.ball;
    this.holder = start.holder;
    this.sp = start.sp;
    return steps;
  }

  apply(step) {
    this.ball = { ...step.ball };
    this.holder = step.holder ? { ...step.holder } : null;
    this.sp = step.sp || null;
  }

  // Half-time / new period: back to the formation, ball on the spot.
  reset() {
    this.ball = { x: 50, y: 50 };
    this.holder = null;
    this.sp = null;
  }
}
