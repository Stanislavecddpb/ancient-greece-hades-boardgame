import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { CycladesGame } from './game';
import type { CycladesState } from './types';

/** Запускает локального клиента (singleplayer) и возвращает его. */
function makeClient(numPlayers = 2) {
  const client = Client<CycladesState>({ game: CycladesGame, numPlayers });
  client.start();
  return client;
}

describe('интеграция фаз через boardgame.io', () => {
  it('после setup доход начисляется и игра входит в фазу аукциона', () => {
    const client = makeClient(2);
    const { G, ctx } = client.getState()!;
    expect(ctx.phase).toBe('auction');
    // Доход уже начислен: 5 стартовых + 2 prosperity = 7.
    expect(G.players['0'].gold).toBe(7);
    expect(G.auction).not.toBeNull();
    expect(G.auction!.toAct).toBe(ctx.currentPlayer);
  });

  it('полный проход аукциона передаёт ход в фазу действий', () => {
    const client = makeClient(2);
    // Оба игрока уходят к Аполлону — простейший путь закрыть аукцион.
    client.moves.chooseApollo();
    client.moves.chooseApollo();
    const { ctx, G } = client.getState()!;
    // Конкурентных богов никто не взял → фаза действий мгновенно закрывает цикл,
    // и игра возвращается к доходу/аукциону следующего цикла.
    expect(G.cycle).toBe(2);
    expect(ctx.phase === 'auction' || ctx.phase === 'income').toBe(true);
  });

  it('победитель аукциона исполняет действия и завершает свой ход', () => {
    const client = makeClient(2);
    // '0' берёт Ареса, '1' уходит к Аполлону → в очереди действий только '0'.
    client.moves.bidGod('ares', 1);
    client.moves.chooseApollo();

    let s = client.getState()!;
    expect(s.ctx.phase).toBe('actions');
    expect(s.G.actions!.queue).toHaveLength(1);
    expect(s.ctx.currentPlayer).toBe('0');

    // '0' строит крепость на домашнем острове и завершает активацию.
    client.moves.build('home_n');
    s = client.getState()!;
    const home0 = s.G.territories['home_n'];
    expect(home0.kind === 'island' && home0.buildings.some((b) => b.type === 'fortress')).toBe(true);

    client.moves.endGod();
    s = client.getState()!;
    // Цикл закрылся, перешли к следующему.
    expect(s.G.cycle).toBe(2);
  });
});
