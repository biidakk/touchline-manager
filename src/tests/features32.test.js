import { test, assert, assertEq } from './harness.js';
import { hasTip, showTip, tipsOn, setTips } from '../ui/tips.js';

// A stand-in for the app: records the dialogs it is asked to show.
function fakeCtx(tips) {
  const shown = [];
  return {
    shown,
    game: { tips },
    dialog: async (html, buttons, { title }) => { shown.push({ title, buttons: buttons.map((b) => b.key) }); return 'ok'; },
    toast: () => {},
  };
}

test('tips: the new screens and the player card have one', () => {
  for (const k of ['hub', 'myteam', 'player', 'stadium', 'training', 'market', 'tables', 'schedule', 'cup', 'otherteams', 'preseason']) assert(hasTip(k), k);
  assert(!hasTip('saves') && !hasTip(undefined));
});

test('tips: shown once; ? shows them again, even with tips off', async () => {
  const ctx = fakeCtx({ off: false, seen: {} });
  await showTip(ctx, 'stadium');
  await showTip(ctx, 'stadium');
  assertEq(ctx.shown.length, 1, 'once');
  assertEq(ctx.shown[0].buttons.join(), 'off,ok');
  setTips(ctx.game, false);
  assert(!tipsOn(ctx.game));
  await showTip(ctx, 'player');
  assertEq(ctx.shown.length, 1, 'off');
  await showTip(ctx, 'player', { force: true });
  assertEq(ctx.shown.length, 2, 'the ? button');
  assertEq(ctx.shown[1].buttons.join(), 'ok', 'no "No more tips" when asked for');
  const old = fakeCtx(undefined); // a career from before v2.8
  await showTip(old, 'hub', { force: true });
  assertEq(old.shown.length, 1);
});
