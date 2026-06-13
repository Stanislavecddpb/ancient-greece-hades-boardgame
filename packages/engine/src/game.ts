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
  applyPlaceCornucopia,
  advanceTurn,
  endCycle,
} from './actions';
import { metropolisCount, islandsOf, log } from './helpers';
import { applyPlaceMetropolis } from './metropolis';
import { applyBuyCreature, applyCycleCreatures, expireBoardCreatures, applySellUnits, applyChimeraReplay, endChimera, applySatyrSteal, endSatyr, applyCyclopsReplace, endCyclops } from './creatures';
import { startFleetMove, hopFleet, endFleetMove, applyTroopMove, applyCombatRound, applyCombatRetreat, applySylphStep, endSylph, applyPushFleet, endPolyphemus, applyPegasusMove, endPegasus } from './movement';
import { dieFromRandom } from './combat';
import { advanceHadesTrack, applyRecruitUndead, applyBuildNecropolis } from './hades';
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

  setup: ({ ctx, random }) => setupGame(ctx, random),

  phases: {
    // 0. Лобби: ждём, пока хост нажмёт «Начать игру» (когда все за столом).
    // Здесь же случайно определяется очерёдность первого аукциона.
    lobby: {
      start: true,
      next: 'auction',
      endIf: ({ G }) => G.started,
      moves: {
        startGame: ({ G, ctx, random, playerID }) => {
          if (playerID !== '0' || G.started) return INVALID_MOVE;
          G.started = true;
          G.startIndex = random.Die(ctx.numPlayers) - 1; // случайный первый игрок
          log(G, 'Игра началась. Очерёдность хода определена.');
        },
      },
    },

    // 1. Аукцион богов. Каждый цикл начинается с начисления дохода, затем игроки
    // по очереди делают подношения богам.
    auction: {
      next: 'actions',
      onBegin: ({ G, ctx, random }) => {
        applyIncome(G);
        // Модуль 2: в начале цикла бросаем 2 кубика и двигаем колонну Аида.
        if (G.modules.hades) advanceHadesTrack(G, random.Die(6), random.Die(6));
        setupAuction(G, ctx);
      },
      endIf: ({ G, ctx }) => auctionComplete(G, ctx),
      onEnd: ({ G, ctx }) => {
        resolveAuction(G, ctx);
        // Первый выбравший Аполлона ставит рог изобилия (если владеет островом).
        const firstApollo = G.auction?.apollo[0] ?? null;
        G.pendingCornucopia =
          firstApollo && islandsOf(G, firstApollo).length > 0 ? firstApollo : null;
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
        if (!currentTurn(G) && !G.pendingCornucopia) {
          // Никто не взял конкурентного бога и нет рога к установке — цикл закрыт.
          endCycle(G, ctx);
          G.actions = null;
        }
      },
      endIf: ({ G }) => G.actions === null,
      turn: {
        // В начале активации игрока снимаем его фигуры существ, поставленные в прошлый цикл.
        onBegin: ({ G }) => {
          const pid = G.pendingCornucopia ?? activePlayerId(G);
          if (pid) expireBoardCreatures(G, pid);
        },
        order: {
          // Сначала ходит тот, кто ставит рог изобилия (Аполлон), затем очередь богов.
          first: ({ G, ctx }) => posOf(ctx, G.pendingCornucopia ?? activePlayerId(G)),
          next: ({ G, ctx }) => posOf(ctx, G.pendingCornucopia ?? activePlayerId(G)),
        },
      },
      moves: {
        recruit: ({ G, playerID }, targetId?: TerritoryId) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID || turn.isHades) return INVALID_MOVE;
          const err = applyRecruit(G, playerID!, turn.god, targetId);
          if (err) return INVALID_MOVE;
        },

        build: ({ G, playerID }, islandId: TerritoryId) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID || turn.isHades) return INVALID_MOVE;
          const err = applyBuild(G, playerID!, turn.god, islandId);
          if (err) return INVALID_MOVE;
        },

        // Аид: наём одной Нежити (Войско/Флотилия) — до 5 за активацию (1 бесплатно).
        recruitUndead: ({ G, playerID }, kind: 'troop' | 'fleet', targetId?: TerritoryId) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID || !turn.isHades) return INVALID_MOVE;
          if (applyRecruitUndead(G, playerID!, kind, targetId)) return INVALID_MOVE;
        },

        // Аид: постройка Некрополя на месте Метрополии своего острова.
        buildNecropolis: ({ G, playerID }, islandId: TerritoryId) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID || !turn.isHades) return INVALID_MOVE;
          if (applyBuildNecropolis(G, playerID!, islandId)) return INVALID_MOVE;
        },

        // Установка Метрополии на выбранный остров (после авто-триггера: 4 философа / 4 здания).
        placeMetropolis: ({ G, playerID }, islandId: TerritoryId) => {
          if (applyPlaceMetropolis(G, playerID!, islandId)) return INVALID_MOVE;
        },

        // Посейдон: начать приказ флоту (1🪙 на первом переходе).
        startFleetMove: ({ G, playerID }, seaId: TId) => {
          const turn = currentTurn(G);
          if (G.combat || !turn || turn.playerId !== playerID || turn.god !== 'poseidon' || turn.isHades) return INVALID_MOVE;
          if (startFleetMove(G, playerID!, seaId)) return INVALID_MOVE;
        },

        // Посейдон: один переход приказа (ведём take кораблей в соседнюю клетку).
        hopFleet: ({ G, playerID }, toId: TId, take: number) => {
          if (G.combat) return INVALID_MOVE;
          if (hopFleet(G, playerID!, toId, take)) return INVALID_MOVE;
        },

        // Посейдон: завершить приказ флоту досрочно.
        endFleetMove: ({ G, playerID }) => {
          if (endFleetMove(G, playerID!)) return INVALID_MOVE;
        },

        // Арес: перемещение войск по «мосту» из флотов (с возможным сухопутным боем).
        moveTroops: ({ G, playerID }, fromId: TId, toId: TId, count: number) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID || turn.god !== 'ares' || turn.isHades) return INVALID_MOVE;
          if (applyTroopMove(G, playerID!, fromId, toId, count)) return INVALID_MOVE;
        },

        // Один раунд текущего боя (бросок костей).
        combatRound: ({ G, playerID, random }) => {
          if (applyCombatRound(G, playerID!, dieFromRandom(random))) return INVALID_MOVE;
        },

        // Отступление атакующего: выжившие возвращаются назад.
        combatRetreat: ({ G, playerID }) => {
          if (applyCombatRetreat(G, playerID!)) return INVALID_MOVE;
        },

        // Покупка мифического существа с рынка (одно за активацию любого бога).
        buyCreature: ({ G, playerID }, slotIndex: number, targetId?: TId) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID) return INVALID_MOVE;
          if (applyBuyCreature(G, playerID!, slotIndex, targetId)) return INVALID_MOVE;
        },

        // Зевс: прокрутить колоду существ за 1 золото.
        cycleCreatures: ({ G, playerID }) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || !turn || turn.playerId !== playerID || turn.god !== 'zeus' || turn.isHades) return INVALID_MOVE;
          if (applyCycleCreatures(G, playerID!)) return INVALID_MOVE;
        },

        // Сфинкс: распродажа выбранного числа юнитов.
        sellUnits: ({ G, playerID }, fleets: number, troops: number, priests: number, philosophers: number) => {
          if (applySellUnits(G, playerID!, fleets, troops, priests, philosophers)) return INVALID_MOVE;
        },

        // Сильфида: шаг движения флота (1 корабль в соседнюю клетку).
        sylphStep: ({ G, playerID }, fromId: TId, toId: TId) => {
          if (applySylphStep(G, playerID!, fromId, toId)) return INVALID_MOVE;
        },
        // Сильфида: завершить движение досрочно.
        endSylph: ({ G, playerID }) => {
          if (endSylph(G, playerID!)) return INVALID_MOVE;
        },

        // Полифем: отодвинуть соседний флот от острова.
        pushFleet: ({ G, playerID }, fromId: TId, toId: TId) => {
          if (applyPushFleet(G, playerID!, fromId, toId)) return INVALID_MOVE;
        },
        // Полифем: завершить отталкивание досрочно.
        endPolyphemus: ({ G, playerID }) => {
          if (endPolyphemus(G, playerID!)) return INVALID_MOVE;
        },

        // Пегас: переброска войск со своего острова на другой свой остров.
        pegasusMove: ({ G, playerID }, fromId: TId, toId: TId, count: number) => {
          if (applyPegasusMove(G, playerID!, fromId, toId, count)) return INVALID_MOVE;
        },
        // Пегас: отменить переброску.
        endPegasus: ({ G, playerID }) => {
          if (endPegasus(G, playerID!)) return INVALID_MOVE;
        },

        // Химера: разыграть существо из сброса (с целью, если нужно).
        chimeraReplay: ({ G, playerID }, creatureId: string, targetId?: TId) => {
          if (applyChimeraReplay(G, playerID!, creatureId, targetId)) return INVALID_MOVE;
        },
        // Химера: отказаться разыгрывать (просто перетасовать сброс в колоду).
        endChimera: ({ G, playerID }) => {
          if (endChimera(G, playerID!)) return INVALID_MOVE;
        },

        // Сатир: украсть философа у выбранного соперника.
        satyrSteal: ({ G, playerID }, victimId: string) => {
          if (applySatyrSteal(G, playerID!, victimId)) return INVALID_MOVE;
        },
        endSatyr: ({ G, playerID }) => {
          if (endSatyr(G, playerID!)) return INVALID_MOVE;
        },

        // Циклоп: заменить выбранное здание острова на здание другого типа.
        cyclopsReplace: ({ G, playerID }, buildingIndex: number, type: any) => {
          if (applyCyclopsReplace(G, playerID!, buildingIndex, type)) return INVALID_MOVE;
        },
        endCyclops: ({ G, playerID }) => {
          if (endCyclops(G, playerID!)) return INVALID_MOVE;
        },

        // Аполлон: первый выбравший кладёт рог изобилия на свой остров.
        placeCornucopia: ({ G, ctx, playerID, events }, islandId: TerritoryId) => {
          if (applyPlaceCornucopia(G, playerID!, islandId)) return INVALID_MOVE;
          if (!currentTurn(G)) {
            // Конкурентных богов никто не взял — после установки рога цикл закрыт.
            endCycle(G, ctx);
            G.actions = null;
          } else {
            events.endTurn();
          }
        },

        endGod: ({ G, ctx, playerID, events }) => {
          const turn = currentTurn(G);
          if (G.combat || G.fleetMove || G.metropolisPlace || !turn || turn.playerId !== playerID) return INVALID_MOVE;
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
