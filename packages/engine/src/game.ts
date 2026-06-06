import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { CycladesState, TerritoryId, GodName } from './types';
import { METROPOLIS_TO_WIN } from './types';
import { setupGame } from './setup';
import { applyIncome } from './income';
import {
  setupAuction,
  auctionComplete,
  resolveAuction,
  applyBid,
  applyApollo,
  isSettled,
} from './auction';
import {
  startActionsPhase,
  currentTurn,
  activePlayerId,
  applyRecruit,
  applyBuild,
  advanceTurn,
  endCycle,
} from './actions';
import { metropolisCount } from './helpers';
import { applyFleetMove, applyTroopMove } from './movement';
import { dieFromRandom } from './combat';
import type { TerritoryId as TId } from './types';

export const GAME_ID = 'cyclades';

/** Позиция игрока pid в ctx.playOrder (с безопасным фолбэком). */
function posOf(ctx: Ctx, pid: string | null | undefined): number {
  if (pid == null) return ctx.playOrderPos;
  const i = ctx.playOrder.indexOf(pid);
  return i >= 0 ? i : ctx.playOrderPos;
}

export const CycladesGame: Game<CycladesState> = {
  name: GAME_ID,

  setup: ({ ctx }) => setupGame(ctx),

  phases: {
    // 1. Аукцион богов. Каждый цикл начинается с начисления дохода, затем игроки
    // по очереди делают подношения богам.
    auction: {
      start: true,
      next: 'actions',
      onBegin: ({ G, ctx }) => {
        applyIncome(G);
        setupAuction(G, ctx);
      },
      endIf: ({ G, ctx }) => auctionComplete(G, ctx),
      onEnd: ({ G, ctx }) => {
        resolveAuction(G, ctx);
        startActionsPhase(G);
        G.auction = null;
      },
      turn: {
        order: {
          first: ({ G, ctx }) => posOf(ctx, G.auction?.toAct),
          next: ({ G, ctx }) => posOf(ctx, G.auction?.toAct),
        },
      },
      moves: {
        // Ставка на конкурентного бога (занять свободного или перебить чужого).
        bidGod: ({ G, ctx, playerID, events }, god: GodName, amount: number) => {
          if (applyBid(G, ctx, playerID!, god, amount)) return INVALID_MOVE;
          if (!auctionComplete(G, ctx)) events.endTurn();
        },

        // Уйти под покровительство Аполлона (бесплатно, без вытеснения).
        chooseApollo: ({ G, ctx, playerID, events }) => {
          if (applyApollo(G, ctx, playerID!)) return INVALID_MOVE;
          if (!auctionComplete(G, ctx)) events.endTurn();
        },
      },
    },

    // 2. Действия — победители активируют богов в каноническом порядке.
    actions: {
      next: 'auction',
      onBegin: ({ G, ctx }) => {
        if (!currentTurn(G)) {
          // Никто не взял конкурентного бога (все ушли к Аполлону) — цикл закрыт.
          endCycle(G, ctx);
          G.actions = null;
        }
      },
      endIf: ({ G }) => G.actions === null,
      turn: {
        order: {
          first: ({ G, ctx }) => posOf(ctx, activePlayerId(G)),
          next: ({ G, ctx }) => posOf(ctx, activePlayerId(G)),
        },
      },
      moves: {
        recruit: ({ G, playerID }, targetId?: TerritoryId) => {
          const turn = currentTurn(G);
          if (!turn || turn.playerId !== playerID) return INVALID_MOVE;
          const err = applyRecruit(G, playerID!, turn.god, targetId);
          if (err) return INVALID_MOVE;
        },

        build: ({ G, playerID }, islandId: TerritoryId) => {
          const turn = currentTurn(G);
          if (!turn || turn.playerId !== playerID) return INVALID_MOVE;
          const err = applyBuild(G, playerID!, turn.god, islandId);
          if (err) return INVALID_MOVE;
        },

        // Посейдон: перемещение флота (с возможным морским боем).
        moveFleet: ({ G, playerID, random }, fromId: TId, toId: TId) => {
          const turn = currentTurn(G);
          if (!turn || turn.playerId !== playerID || turn.god !== 'poseidon') return INVALID_MOVE;
          if (applyFleetMove(G, playerID!, fromId, toId, dieFromRandom(random))) return INVALID_MOVE;
        },

        // Арес: перемещение войск по «мосту» из флотов (с возможным сухопутным боем).
        moveTroops: ({ G, playerID, random }, fromId: TId, toId: TId, count: number) => {
          const turn = currentTurn(G);
          if (!turn || turn.playerId !== playerID || turn.god !== 'ares') return INVALID_MOVE;
          if (applyTroopMove(G, playerID!, fromId, toId, count, dieFromRandom(random))) return INVALID_MOVE;
        },

        endGod: ({ G, ctx, playerID, events }) => {
          const turn = currentTurn(G);
          if (!turn || turn.playerId !== playerID) return INVALID_MOVE;
          const done = advanceTurn(G);
          if (done) {
            endCycle(G, ctx);
            // фаза закроется через endIf (G.actions === null)
          } else {
            events.endTurn();
          }
        },
      },
    },
  },

  // Победа: 2 Метрополии, проверяется на стыке циклов (когда фаза действий не идёт).
  endIf: ({ G, ctx }) => {
    if (G.actions !== null) return;
    const contenders = ctx.playOrder
      .filter((pid) => !G.players[pid].isEliminated)
      .map((pid) => ({ pid, metro: metropolisCount(G, pid), gold: G.players[pid].gold }))
      .filter((c) => c.metro >= METROPOLIS_TO_WIN);
    if (contenders.length === 0) return;
    contenders.sort((a, b) => b.metro - a.metro || b.gold - a.gold);
    return { winner: contenders[0].pid };
  },
};

// Реэкспорт для краткости в тестах.
export { isSettled };
