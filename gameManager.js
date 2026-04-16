// ============================================================
// gameManager.js — 游戏核心规则层（所有模式共享）
// 职责：初始状态、选牌、回合、部署、支援、战斗结算、被动效果、换位
// 不含：AI逻辑、网络通信、作弊功能、UI渲染
// ============================================================

window.GameManager = (() => {

  // ─────────────────────────────────────────────
  // 初始状态模板
  // ─────────────────────────────────────────────
  const INIT_PLAYER_STATE = () => ({
    health: 30,
    coins: 0,
    hand: [],
    battlefield: [null, null, null, null],
    buildings: [null, null, null, null],
    miracleDrawn: [30]
  });

  const INIT_STATE = () => ({
    turn: 0,
    phase: 'idle',   // idle | redDeploy | blueDeploy | redSupport | battle
    red:  INIT_PLAYER_STATE(),
    blue: INIT_PLAYER_STATE(),
    deck: [],
    miracleDeck: [],
    discardPile: [],
    initialCards: [],        // 当前选牌阶段展示的6张
    initialCardsBlue: [],    // 蓝方待选池（localGame/AI模式用）
    selectedCard: null,
    log: []
  });

  // ─────────────────────────────────────────────
  // 初始化游戏（普通洗牌）
  // ─────────────────────────────────────────────
  function initGame(allCards) {
    const regular  = allCards.filter(c => c.type !== 'miracle');
    const miracles = allCards.filter(c => c.type === 'miracle');

    const deck        = window.shuffleArray(regular.map(window.createCard));
    const miracleDeck = window.shuffleArray(miracles.map(window.createCard));

    const redSix  = deck.slice(0, 6);
    const blueSix = deck.slice(6, 12);
    const rest    = deck.slice(12);

    const mDeck = [...miracleDeck];
    const redM  = mDeck.pop();
    const blueM = mDeck.pop();

    return {
      ...INIT_STATE(),
      red:  { ...INIT_PLAYER_STATE(), hand: redM  ? [redM]  : [] },
      blue: { ...INIT_PLAYER_STATE(), hand: blueM ? [blueM] : [] },
      deck: rest,
      miracleDeck: mDeck,
      initialCards: redSix,
      initialCardsBlue: blueSix,
      log: ['游戏初始化完成！', '红蓝双方各抽取1张奇迹牌', '点击"开始选牌"进入选牌阶段']
    };
  }

  // ─────────────────────────────────────────────
  // 初始化游戏（种子洗牌，用于在线对战同步）
  // ─────────────────────────────────────────────
  function initGameWithSeed(allCards, seed) {
    function seededShuffle(arr) {
      let s = seed;
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const regular  = allCards.filter(c => c.type !== 'miracle');
    const miracles = allCards.filter(c => c.type === 'miracle');

    const deck        = seededShuffle(regular.map(window.createCard));
    const miracleDeck = seededShuffle(miracles.map(window.createCard));

    const redSix  = deck.slice(0, 6);
    const blueSix = deck.slice(6, 12);
    const rest    = deck.slice(12);

    const mDeck = [...miracleDeck];
    const redM  = mDeck.pop();
    const blueM = mDeck.pop();

    return {
      ...INIT_STATE(),
      red:  { ...INIT_PLAYER_STATE(), hand: redM  ? [redM]  : [], pickPool: redSix },
      blue: { ...INIT_PLAYER_STATE(), hand: blueM ? [blueM] : [], pickPool: blueSix },
      deck: rest,
      miracleDeck: mDeck,
      initialCards: redSix,
      log: ['🌐 在线游戏开始！', '双方各抽取1张奇迹牌', '--- 选牌阶段开始 ---']
    };
  }

  // ─────────────────────────────────────────────
  // 被动效果计算（完整版，来自localGame）
  // ─────────────────────────────────────────────
  function calculatePassiveEffects(state) {
    const newState = JSON.parse(JSON.stringify(state));

    // 第一步：重置所有卡牌到基础值（包括战场和建筑）
    ['red', 'blue'].forEach(player => {
      // 重置战场卡牌
      newState[player].battlefield.forEach((card) => {
        if (!card) return;
        if (card.baseAtk !== undefined) card.atk = card.baseAtk;
        if (card.baseHp !== undefined) {
          if (card.hp > card.baseHp) {
            card.maxHp = card.baseHp;
          } else {
            const damage = card.maxHp - card.hp;
            card.maxHp = card.baseHp;
            card.hp = Math.max(1, card.maxHp - damage);
          }
        }
        delete card._vsRaceBonus;
        delete card._vsRaceBonuses;
      });
      
      // 重置建筑卡牌
      if (newState[player].buildings) {
        newState[player].buildings.forEach((card) => {
          if (!card) return;
          if (card.baseAtk !== undefined) card.atk = card.baseAtk;
          if (card.baseHp !== undefined) {
            if (card.hp > card.baseHp) {
              card.maxHp = card.baseHp;
            } else {
              const damage = card.maxHp - card.hp;
              card.maxHp = card.baseHp;
              card.hp = Math.max(1, card.maxHp - damage);
            }
          }
          delete card._vsRaceBonus;
          delete card._vsRaceBonuses;
        });
      }
    });

    const countRaces = (player, races) => {
      let count = 0;
      newState[player].battlefield.forEach(c => {
        if (c && races.some(r => c.stRace === r || c.ndRace === r)) count++;
      });
      return count;
    };

    const countAllRaces = (races) => {
      let count = 0;
      ['red', 'blue'].forEach(p => {
        newState[p].battlefield.forEach(c => {
          if (c && races.some(r => c.stRace === r || c.ndRace === r)) count++;
        });
      });
      return count;
    };

    const getOpponent = (player) => player === 'red' ? 'blue' : 'red';

    // 第二步：应用所有被动效果
    ['red', 'blue'].forEach(player => {
      const opponent = getOpponent(player);

      newState[player].battlefield.forEach((card) => {
        if (!card || !card.id) return;
        const config = window.CardEffectConfigs?.[card.id];
        if (!config || !config.passive) return;

        const condition = config.condition;
        if (!condition) return;

        if (condition.type === 'countRace') {
          const { races, threshold, bonus } = condition;
          const count = countAllRaces(races);
          if (count >= threshold) {
            if (bonus.atk) card.atk += bonus.atk;
            if (bonus.hp) { card.hp += bonus.hp; card.maxHp += bonus.hp; }
          }
        }
        else if (condition.type === 'countSelfRace') {
          const { races, bonus } = condition;
          const count = countRaces(player, races);
          if (bonus.targetAll) {
            newState[player].battlefield.forEach(c => {
              if (c) {
                if (bonus.atk) c.atk += bonus.atk * count;
                if (bonus.hp) { c.hp += bonus.hp * count; c.maxHp += bonus.hp * count; }
              }
            });
          } else if (bonus.targetSelf) {
            if (bonus.atk) card.atk += bonus.atk * count;
            if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
          } else {
            if (bonus.atk) card.atk += bonus.atk * count;
            if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
          }
        }
        else if (condition.type === 'countOpponentRace') {
          const { races, bonus } = condition;
          const count = countRaces(opponent, races);
          if (bonus.targetAll) {
            newState[player].battlefield.forEach(c => {
              if (c) {
                if (bonus.atk) c.atk += bonus.atk * count;
                if (bonus.hp) { c.hp += bonus.hp * count; c.maxHp += bonus.hp * count; }
              }
            });
          } else {
            if (bonus.atk) card.atk += bonus.atk * count;
            if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
          }
        }
        else if (condition.type === 'countAllRace') {
          const { races, bonus } = condition;
          const count = countAllRaces(races);
          if (bonus.targetSelf) {
            if (bonus.atk) card.atk += bonus.atk * count;
            if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
          }
        }
        else if (condition.type === 'raceBonus') {
          const { races, bonus } = condition;
          newState[player].battlefield.forEach(c => {
            if (c && races.some(r => c.stRace === r || c.ndRace === r)) {
              if (bonus.atk) c.atk += bonus.atk;
              if (bonus.hp) { c.hp += bonus.hp; c.maxHp += bonus.hp; }
            }
          });
        }
        else if (condition.type === 'vsRaceBonus') {
          card._vsRaceBonus = condition;
        }
        else if (condition.type === 'multiBonus') {
          condition.bonuses.forEach(bonusConfig => {
            const { type, races, bonus } = bonusConfig;
            if (type === 'countSelfRace') {
              const count = countRaces(player, races);
              if (bonus.targetAll) {
                newState[player].battlefield.forEach(c => {
                  if (c) {
                    if (bonus.atk) c.atk += bonus.atk * count;
                    if (bonus.hp) { c.hp += bonus.hp * count; c.maxHp += bonus.hp * count; }
                  }
                });
              } else if (bonus.targetSelf) {
                if (bonus.atk) card.atk += bonus.atk * count;
                if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
              }
            }
            else if (type === 'countOpponentRace') {
              const count = countRaces(opponent, races);
              if (bonus.targetAll) {
                newState[player].battlefield.forEach(c => {
                  if (c) {
                    if (bonus.atk) c.atk += bonus.atk * count;
                    if (bonus.hp) { c.hp += bonus.hp * count; c.maxHp += bonus.hp * count; }
                  }
                });
              } else if (bonus.targetSelf) {
                if (bonus.atk) card.atk += bonus.atk * count;
                if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
              }
            }
            else if (type === 'countAllRace') {
              const count = countAllRaces(races);
              if (bonus.targetSelf) {
                if (bonus.atk) card.atk += bonus.atk * count;
                if (bonus.hp) { card.hp += bonus.hp * count; card.maxHp += bonus.hp * count; }
              }
            }
            else if (type === 'raceBonus') {
              newState[player].battlefield.forEach(c => {
                if (c && races.some(r => c.stRace === r || c.ndRace === r)) {
                  if (bonus.atk) c.atk += bonus.atk;
                  if (bonus.hp) { c.hp += bonus.hp; c.maxHp += bonus.hp; }
                }
              });
            }
            else if (type === 'conditionalRaceBonus') {
              const { checkOpponentHas, targetRaces } = bonusConfig;
              if (card._conditionalBonusApplied) return;
              const opponentHasRace = newState[opponent].battlefield.some(c =>
                c && checkOpponentHas.some(r => c.stRace === r || c.ndRace === r)
              );
              if (opponentHasRace) {
                newState[player].battlefield.forEach(c => {
                  if (c && targetRaces.some(r => c.stRace === r || c.ndRace === r)) {
                    if (bonus.atk) { c.atk += bonus.atk; c.baseAtk = (c.baseAtk || c.atk); }
                    if (bonus.hp) { c.hp += bonus.hp; c.maxHp += bonus.hp; c.baseHp = (c.baseHp || c.maxHp); }
                  }
                });
                card._conditionalBonusApplied = true;
              }
            }
            else if (type === 'vsRaceBonus') {
              if (!card._vsRaceBonuses) card._vsRaceBonuses = [];
              card._vsRaceBonuses.push(bonusConfig);
            }
          });
        }
      });
    });

    // 被动效果可能导致卡牌死亡，检查并移除
    ['red', 'blue'].forEach(player => {
      newState[player].battlefield = newState[player].battlefield.map((card) => {
        if (card && card.hp <= 0) {
          if (card._permanentSeal) { card.hp = 1; return card; }
          newState.discardPile.push(card);
          newState.log.push(`${card.name} 被击败（被动效果导致hp≤0）`);
          return null;
        }
        return card;
      });
    });

    return newState;
  }

  // ─────────────────────────────────────────────
  // 回合开始（抽牌、发金币、onTurnStart效果）
  // ─────────────────────────────────────────────
  function doStartTurn(gameState) {
    const newTurn = gameState.turn + 1;
    const coins   = Math.min(newTurn, 10);
    const logs    = [`--- 第${newTurn}回合开始 ---`, `双方获得 ${coins} 金币`];

    let deck     = [...gameState.deck];
    let discard  = [...gameState.discardPile];
    let redHand  = [...gameState.red.hand];
    let blueHand = [...gameState.blue.hand];

    if (newTurn >= 2) {
      for (let i = 0; i < 2; i++) {
        // 如果牌库为空但弃牌库有牌，则重新混入
        if (deck.length === 0 && discard.length > 0) {
          deck = window.shuffleArray(discard);
          discard = [];
          logs.push('🔄 牌库耗尽，弃牌库重新混入');
        }
        const r = deck.pop(); if (r) redHand.push(r);
        
        // 再检查一次蓝方的抽牌
        if (deck.length === 0 && discard.length > 0) {
          deck = window.shuffleArray(discard);
          discard = [];
          logs.push('🔄 牌库耗尽，弃牌库重新混入');
        }
        const b = deck.pop(); if (b) blueHand.push(b);
      }
      logs.push('双方各抽2张牌');
    } else {
      logs.push('第一回合不抽牌');
    }

    let newState = {
      ...gameState,
      turn: newTurn,
      phase: 'redDeploy',
      deck,
      discardPile: discard,
      red:  { ...gameState.red,  coins, hand: redHand },
      blue: { ...gameState.blue, coins, hand: blueHand },
      log: [...gameState.log, ...logs]
    };

    // onTurnStart 效果（第一回合不触发）
    if (newTurn >= 2) {
      ['red', 'blue'].forEach(player => {
        newState[player].battlefield.forEach((card, index) => {
          if (card && card.id) {
            const config = window.CardEffectConfigs?.[card.id];
            if (config && config.trigger === 'onTurnStart') {
              const effectContext = {
                player, card, target: card,
                logCallback: (msg) => newState.log.push(msg)
              };
              newState = window.EffectEngine.trigger(card.id, effectContext, newState);
            }
          }
        });
      });

      // 耶稣(47)：每回合额外抽一张
      ['red', 'blue'].forEach(player => {
        const hasJesus = newState[player].battlefield.some(c => c && c.id === 47);
        if (hasJesus && newState.deck.length > 0) {
          const extraCard = newState.deck.shift();
          newState[player].hand.push(extraCard);
          newState.log.push(`✨ 耶稣在场，${player === 'red' ? '红方' : '蓝方'}额外抽一张牌：${extraCard.name}`);
        }
      });

      // 天秤(10)倒计时
      ['red', 'blue'].forEach(player => {
        if (newState[player]._scalesOfFate > 0) {
          newState[player]._scalesOfFate--;
          if (newState[player]._scalesOfFate === 0) {
            delete newState[player]._scalesOfFate;
            newState.log.push(`⚖️ ${player === 'red' ? '红方' : '蓝方'}天秤效果已结束`);
          } else {
            newState.log.push(`⚖️ 天秤效果剩余 ${newState[player]._scalesOfFate} 回合`);
          }
        }
      });
    }

    // 清除护盾、减少冻结回合数
    ['red', 'blue'].forEach(player => {
      newState[player].battlefield.forEach(card => {
        if (card) {
          if (card._shield) delete card._shield;
          if (card._frozen && card._frozen > 0) {
            card._frozen--;
            if (card._frozen === 0) {
              delete card._frozen;
              newState.log.push(`${card.name} 解除冻结`);
            }
          }
        }
      });
    });

    return newState;
  }

  // ─────────────────────────────────────────────
  // 回合阶段推进（redDeploy → blueDeploy → redSupport → battle）
  // ─────────────────────────────────────────────
  function getNextPhase(currentPhase) {
    const next = {
      redDeploy:  'blueDeploy',
      blueDeploy: 'redSupport',
      redSupport: 'battle'
    };
    return next[currentPhase] || null;
  }

  const PHASE_NAMES = {
    blueDeploy: '蓝方部署阶段',
    redSupport: '红方支援阶段'
  };

  // ─────────────────────────────────────────────
  // 当前阶段归属哪方
  // ─────────────────────────────────────────────
  function getPhasePlayer(phase) {
    return (phase === 'redDeploy' || phase === 'redSupport') ? 'red' : 'blue';
  }

  // ─────────────────────────────────────────────
  // 部署战场牌 / 建筑牌
  // ─────────────────────────────────────────────
  function playCard(gameState, card, player, laneIndex, isBuilding = false) {
    const playerState = gameState[player];

    if (playerState.coins < card.cost) return { error: '金币不足！' };

    const cardIsBuilding = card.stRace === '建筑' || card.ndRace === '建筑';
    if (cardIsBuilding && !isBuilding) return { error: '建筑牌需要放置在建筑槽！' };
    if (!cardIsBuilding && isBuilding) return { error: '建筑槽只能放置建筑牌！' };

    const targetSlot = isBuilding ? playerState.buildings : playerState.battlefield;
    if (targetSlot[laneIndex] !== null) return { error: isBuilding ? '该建筑槽已有建筑！' : '该路线已有卡牌！' };

    window.SoundManager.playSound('place');

    const deployedCard = { ...card, baseAtk: card.atk, baseHp: card.hp, hp: card.hp, maxHp: card.hp || card.maxHp };
    const newSlots = [...targetSlot];
    newSlots[laneIndex] = deployedCard;

    let newState = {
      ...gameState,
      [player]: {
        ...playerState,
        ...(isBuilding ? { buildings: newSlots } : { battlefield: newSlots }),
        hand:  playerState.hand.filter(c => c.instanceId !== card.instanceId),
        coins: playerState.coins - card.cost
      },
      selectedCard: null,
      log: [...gameState.log, `${player === 'red' ? '红方' : '蓝方'}在路线${laneIndex+1}放置了${isBuilding ? '建筑' : '战场牌'} ${card.name}`]
    };

    newState = calculatePassiveEffects(newState);

    // ✅ 骑士(42)特殊效果：登场时全场贵族数量≥2则获得护盾
    if (card.id === 42) {
      let nobleCount = 0;
      ['red', 'blue'].forEach(p => {
        newState[p].battlefield.forEach(c => {
          if (c && (c.stRace === '贵族' || c.ndRace === '贵族')) nobleCount++;
        });
      });
      if (nobleCount >= 2) {
        const slot = newState[player].battlefield[laneIndex];
        if (slot) {
          slot._shield = 1;
          newState.log.push(`${card.name} 登场时贵族≥2，获得1回合护盾！`);
        }
      }
    }

    return { state: newState };
  }

  // ─────────────────────────────────────────────
  // 使用支援/奇迹牌（指定目标）
  // ─────────────────────────────────────────────
  function useCardOnTarget(gameState, card, player, targetPlayer, laneIndex) {
    const playerState = gameState[player];
    const target = gameState[targetPlayer].battlefield[laneIndex];
    if (!target) return { error: '目标位置没有单位！' };

    const cost = card.type === 'miracle' ? 0 : card.cost;
    if (playerState.coins < cost) return { error: '金币不足！' };

    let newState = {
      ...gameState,
      [player]: {
        ...playerState,
        hand:  playerState.hand.filter(c => c.instanceId !== card.instanceId),
        coins: playerState.coins - cost
      },
      discardPile: [...gameState.discardPile, card],
      selectedCard: null,
      log: [...gameState.log, `${player === 'red' ? '红方' : '蓝方'}对 ${target.name} 使用了 ${card.name}`]
    };

    // ✨ 触发卡牌效果
    if (window.EffectEngine && card.id) {
      const effectContext = {
        player: player,
        card: card,
        target: target,
        targetPlayer: targetPlayer,
        targetLane: laneIndex,
        logCallback: (msg) => { newState.log.push(msg); }
      };
      newState = window.EffectEngine.trigger(card.id, effectContext, newState);
    }

    // ✅ 效果触发后检查并移除死亡卡牌（地狱之主等修改血量的效果）
    ['red', 'blue'].forEach(p => {
      newState[p].battlefield = newState[p].battlefield.map((c) => {
        if (c && c.hp <= 0) {
          newState.discardPile.push(c);
          newState.log.push(`${c.name} 被击败（hp≤0）`);
          return null;
        }
        return c;
      });
    });

    return { state: newState };
  }

  // ─────────────────────────────────────────────
  // 使用支援/奇迹牌（无目标，直接确认）
  // ─────────────────────────────────────────────
  function confirmUse(gameState, card, player) {
    const playerState = gameState[player];
    const cost = card.type === 'miracle' ? 0 : card.cost;
    if (playerState.coins < cost) return { error: '金币不足！' };

    let newState = {
      ...gameState,
      [player]: {
        ...playerState,
        hand:  playerState.hand.filter(c => c.instanceId !== card.instanceId),
        coins: playerState.coins - cost
      },
      discardPile: [...gameState.discardPile, card],
      selectedCard: null,
      log: [...gameState.log, `${player === 'red' ? '红方' : '蓝方'}使用了 ${card.name}`]
    };

    // ✨ 触发卡牌效果
    if (window.EffectEngine && card.id) {
      const effectContext = {
        player: player,
        card: card,
        target: null,
        logCallback: (msg) => { newState.log.push(msg); }
      };
      newState = window.EffectEngine.trigger(card.id, effectContext, newState);
    }

    // ✅ 处理特殊标记

    // 1. 处决：立即胜利（_immediateVictory）
    if (newState._immediateVictory) {
      const victor = newState._immediateVictory;
      delete newState._immediateVictory;
      return { state: newState, immediateVictory: victor };
    }

    // ✅ 效果触发后检查并移除死亡卡牌（地狱之主等修改血量的效果）
    ['red', 'blue'].forEach(p => {
      newState[p].battlefield = newState[p].battlefield.map((c) => {
        if (c && c.hp <= 0) {
          newState.discardPile.push(c);
          newState.log.push(`${c.name} 被击败（hp≤0）`);
          return null;
        }
        return c;
      });
    });

    // 2. 末日：跳过当前回合直接进入下一回合（_skipToNextTurn）
    if (newState._skipToNextTurn) {
      delete newState._skipToNextTurn;
      // 立即执行 doStartTurn 推进到下一回合
      const skippedState = doStartTurn(newState);
      return { state: skippedState, skipToNextTurn: true };
    }

    return { state: newState };
  }

  // ─────────────────────────────────────────────
  // 奇迹牌里程碑抽取（内部工具）
  // ─────────────────────────────────────────────
  function _drawMiracleByHP(hp, drawn, hand, miracleDeck, logs, side) {
    const milestones = [25, 20, 15, 10, 5];
    const newMDeck = [...miracleDeck];
    let newDrawn = [...drawn];
    const triggered = milestones.filter(m => hp <= m && !drawn.includes(m));
    if (triggered.length > 0) {
      newDrawn = [...drawn, ...triggered];
      const card = newMDeck.pop();
      if (card) {
        hand.push(card);
        logs.push(`${side === 'red' ? '红方' : '蓝方'}血量降至 ${hp}，抽取奇迹牌：${card.name}`);
      }
    }
    return { drawn: newDrawn, miracleDeck: newMDeck };
  }

  // ─────────────────────────────────────────────
  // 创建战斗上下文对象（用于逐条战线结算）
  // ─────────────────────────────────────────────
  function createBattleContext(gameState) {
    return {
      redBF:       gameState.red.battlefield.map(c => c ? { ...c } : null),
      blueBF:      gameState.blue.battlefield.map(c => c ? { ...c } : null),
      redBuilding: gameState.red.buildings  ? gameState.red.buildings.map(c => c ? { ...c } : null)  : [null,null,null,null],
      blueBuilding: gameState.blue.buildings ? gameState.blue.buildings.map(c => c ? { ...c } : null) : [null,null,null,null],
      redHP:       gameState.red.health,
      blueHP:      gameState.blue.health,
      discard:     [...gameState.discardPile],
      logs:        [],
      currentLane: -1
    };
  }

  // ─────────────────────────────────────────────
  // 战斗结算（完整版，含所有卡牌特效）
  // 返回 Promise → 调用方负责 setBattleAnimation、onFinish
  // ─────────────────────────────────────────────
  async function resolveBattle(gameState, { setBattleAnimation, onLaneResolve, onFinish }) {
    const ctx = createBattleContext(gameState);

    // ── 内部工具：计算 vsRaceBonus（含乘法和加法）──
    const applyVsRaceBonus = (attacker, defender, baseAtk, logs) => {
      let atk = baseAtk;
      const applyBonus = (bonus, races) => {
        if (!races.some(r => defender.stRace === r || defender.ndRace === r)) return;
        if (bonus.atkMultiplier) {
          atk *= bonus.atkMultiplier;
          logs.push(`  ⚔️ ${attacker.name} 对 ${defender.name} 攻击力×${bonus.atkMultiplier}！`);
        }
        if (bonus.atk) {
          atk += bonus.atk;
          logs.push(`  ⚔️ ${attacker.name} 对 ${defender.name} 攻击力+${bonus.atk}！`);
        }
      };
      if (attacker._vsRaceBonus) applyBonus(attacker._vsRaceBonus.bonus, attacker._vsRaceBonus.races);
      if (attacker._vsRaceBonuses) attacker._vsRaceBonuses.forEach(vr => applyBonus(vr.bonus, vr.races));
      return atk;
    };

    // ── 内部工具：建筑抵挡伤害 ──
    const absorbWithBuilding = (damage, building, buildingArr, idx, discard, logs, side) => {
      // 只要建筑存在且有生命值，就能抵挡伤害
      if (!building || damage <= 0) return damage;
      if (building.hp === undefined || building.hp === null || building.hp <= 0) return damage;
      
      const absorbed = Math.min(damage, building.hp);
      building.hp -= absorbed;
      damage -= absorbed;
      logs.push(`  🏰 ${building.name} 为${side === 'red' ? '红方' : '蓝方'}抵挡了 ${absorbed} 点伤害！`);
      if (building.hp <= 0) {
        discard.push(building);
        buildingArr[idx] = null;
        logs.push(`  🏰 ${building.name} 被摧毁`);
      }
      return damage;
    };

    // 逐条战线计算战斗结果
    for (let i = 0; i < 4; i++) {
      ctx.currentLane = i;
      setBattleAnimation({ active: true, lane: i });
      window.SoundManager.playSound('attack');
      
      // 动画延迟：显示红方牌向上撞，蓝方牌向下撞
      await new Promise(r => setTimeout(r, 300)); // 红方动画
      await new Promise(r => setTimeout(r, 300)); // 蓝方动画
      const lineLogs = ctx.logs.length;

      const rc = ctx.redBF[i];
      const bc = ctx.blueBF[i];

      if (rc && bc) {
        // ── 双方对战 ──
        const rcFrozen = rc._frozen && rc._frozen > 0;
        const bcFrozen = bc._frozen && bc._frozen > 0;

        if (rcFrozen && bcFrozen) {
          ctx.logs.push(`路线${i+1}: ${rc.name} 和 ${bc.name} 都被冻结，无法行动`);
          continue;
        }

        if (rcFrozen) {
          // ── 半冻结：只有蓝方攻击红方战场牌 ──
          ctx.logs.push(`路线${i+1}: ${rc.name} 被冻结，无法攻击`);
          let dmg = bc.atk;
          dmg = absorbWithBuilding(dmg, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
          rc.hp -= dmg;
          ctx.logs.push(`  ${bc.name} 攻击 ${rc.name} (剩余${rc.hp}HP)`);
          if (rc.hp <= 0) {
            if (rc.id === 50 && !rc._usedAntiOneShot) { rc.hp = 1; rc._usedAntiOneShot = true; ctx.logs.push(`  ⚡ ${rc.name} 不屈之志触发！强制维持1点生命`); }
            else if (rc._permanentSeal) { rc.hp = 1; ctx.logs.push(`  🔒 ${rc.name} 被永世封印，无法被杀死`); }
            else { ctx.discard.push(rc); ctx.redBF[i] = null; ctx.logs.push(`  红方 ${rc.name} 被击败`); }
          }
          continue;
        }

        if (bcFrozen) {
          // ── 半冻结：只有红方攻击蓝方战场牌 ──
          ctx.logs.push(`路线${i+1}: ${bc.name} 被冻结，无法攻击`);
          let dmg = rc.atk;
          dmg = absorbWithBuilding(dmg, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');
          bc.hp -= dmg;
          ctx.logs.push(`  ${rc.name} 攻击 ${bc.name} (剩余${bc.hp}HP)`);
          if (bc.hp <= 0) {
            if (bc.id === 50 && !bc._usedAntiOneShot) { bc.hp = 1; bc._usedAntiOneShot = true; ctx.logs.push(`  ⚡ ${bc.name} 不屈之志触发！强制维持1点生命`); }
            else if (bc._permanentSeal) { bc.hp = 1; ctx.logs.push(`  🔒 ${bc.name} 被永世封印，无法被杀死`); }
            else { ctx.discard.push(bc); ctx.blueBF[i] = null; ctx.logs.push(`  蓝方 ${bc.name} 被击败`); }
          }
          continue;
        }

        // ── 正常双方对战 ──
        const rcHpBefore = rc.hp;
        const bcHpBefore = bc.hp;

        // vsRaceBonus（含乘法）
        let rcAtk = applyVsRaceBonus(rc, bc, rc.atk, ctx.logs);
        let bcAtk = applyVsRaceBonus(bc, rc, bc.atk, ctx.logs);

        // 刺客(45)首次攻击
        if (rc.id === 45 && !rc._hasAttacked) { rcAtk *= 2; rc._hasAttacked = true; ctx.logs.push(`  🗡️ ${rc.name} 首次攻击！攻击力×2`); }
        if (bc.id === 45 && !bc._hasAttacked) { bcAtk *= 2; bc._hasAttacked = true; ctx.logs.push(`  🗡️ ${bc.name} 首次攻击！攻击力×2`); }

        // 护盾检测
        let rcDmg = (rc._shield && rc._shield > 0) ? 0 : bcAtk;
        let bcDmg = (bc._shield && bc._shield > 0) ? 0 : rcAtk;
        if (rc._shield && rc._shield > 0) { rc._shield--; ctx.logs.push(`  🛡️ ${rc.name} 的护盾抵挡了攻击！`); }
        if (bc._shield && bc._shield > 0) { bc._shield--; ctx.logs.push(`  🛡️ ${bc.name} 的护盾抵挡了攻击！`); }

        // 建筑抵挡伤害
        rcDmg = absorbWithBuilding(rcDmg, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
        bcDmg = absorbWithBuilding(bcDmg, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');

        rc.hp -= rcDmg;
        bc.hp -= bcDmg;

        // 屠龙勇士(50)不屈之志
        if (rc.id === 50 && rc.hp <= 0 && !rc._usedAntiOneShot) { rc.hp = 1; rc._usedAntiOneShot = true; ctx.logs.push(`  ⚡ ${rc.name} 不屈之志触发！强制维持1点生命`); }
        if (bc.id === 50 && bc.hp <= 0 && !bc._usedAntiOneShot) { bc.hp = 1; bc._usedAntiOneShot = true; ctx.logs.push(`  ⚡ ${bc.name} 不屈之志触发！强制维持1点生命`); }

        ctx.logs.push(`路线${i+1}: ${rc.name}(${rc.hp}HP) VS ${bc.name}(${bc.hp}HP)`);

        // 女伯爵(61)吸血：只在对敌方实际造成伤害且自身存活时触发
        if (rc.id === 61 && bc.hp < bcHpBefore && rc.hp > 0) { rc.hp += 1; rc.maxHp = Math.max(rc.maxHp, rc.hp); ctx.logs.push(`  💉 ${rc.name} 吸血！hp+1`); }
        if (bc.id === 61 && rc.hp < rcHpBefore && bc.hp > 0) { bc.hp += 1; bc.maxHp = Math.max(bc.maxHp, bc.hp); ctx.logs.push(`  💉 ${bc.name} 吸血！hp+1`); }

        // 死亡处理（含翔龙回血）
        const rcDied = rc.hp <= 0;
        const bcDied = bc.hp <= 0;

        if (rcDied) {
          if (rc._permanentSeal) { rc.hp = 1; ctx.logs.push(`  🔒 ${rc.name} 被永世封印，无法被杀死`); }
          else { ctx.discard.push(rc); ctx.redBF[i] = null; ctx.logs.push(`  红方 ${rc.name} 被击败`); if (bc.id === 70) { bc.hp += 3; bc.maxHp = Math.max(bc.maxHp, bc.hp); ctx.logs.push(`  🐉 ${bc.name} 击杀！hp+3`); } }
        }
        if (bcDied) {
          if (bc._permanentSeal) { bc.hp = 1; ctx.logs.push(`  🔒 ${bc.name} 被永世封印，无法被杀死`); }
          else { ctx.discard.push(bc); ctx.blueBF[i] = null; ctx.logs.push(`  蓝方 ${bc.name} 被击败`); if (rc.id === 70) { rc.hp += 3; rc.maxHp = Math.max(rc.maxHp, rc.hp); ctx.logs.push(`  🐉 ${rc.name} 击杀！hp+3`); } }
        }

        // 狼人(16)：被攻击后存活，再次行动攻击对面存活单位或玩家
        const rcWasAttacked = rc.hp < rcHpBefore;
        const bcWasAttacked = bc.hp < bcHpBefore;
        if (!rcDied && rc.id === 16 && rcWasAttacked) {
          ctx.logs.push(`  ⚡ ${rc.name} 触发狼性：再次行动！`);
          const target_bc = ctx.blueBF[i];
          if (target_bc) {
            target_bc.hp -= rc.atk;
            ctx.logs.push(`  ${rc.name} 再次攻击 ${target_bc.name} (剩余${target_bc.hp}HP)`);
            if (target_bc.hp <= 0) { ctx.discard.push(target_bc); ctx.blueBF[i] = null; ctx.logs.push(`  蓝方 ${target_bc.name} 被击败`); }
          } else {
            let wolfAttackDmg = rc.atk;
            wolfAttackDmg = absorbWithBuilding(wolfAttackDmg, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');
            ctx.blueHP -= wolfAttackDmg;
            ctx.logs.push(`  ${rc.name} 对蓝方玩家造成${wolfAttackDmg}点伤害`);
          }
        }
        if (!bcDied && bc.id === 16 && bcWasAttacked) {
          ctx.logs.push(`  ⚡ ${bc.name} 触发狼性：再次行动！`);
          const target_rc = ctx.redBF[i];
          if (target_rc) {
            target_rc.hp -= bc.atk;
            ctx.logs.push(`  ${bc.name} 再次攻击 ${target_rc.name} (剩余${target_rc.hp}HP)`);
            if (target_rc.hp <= 0) { ctx.discard.push(target_rc); ctx.redBF[i] = null; ctx.logs.push(`  红方 ${target_rc.name} 被击败`); }
          } else {
            let wolfAttackDmg2 = bc.atk;
            wolfAttackDmg2 = absorbWithBuilding(wolfAttackDmg2, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
            ctx.redHP -= wolfAttackDmg2;
            ctx.logs.push(`  ${bc.name} 对红方玩家造成${wolfAttackDmg2}点伤害`);
          }
        }

        // 反击(69)
        const alive_rc = ctx.redBF[i], alive_bc = ctx.blueBF[i];
        if (alive_rc && alive_rc.id === 69 && rcDmg > 0) { if (alive_bc) alive_bc.hp -= alive_rc.atk; ctx.logs.push(`  ⚔️ ${alive_rc.name} 反击！`); }
        if (alive_bc && alive_bc.id === 69 && bcDmg > 0) { if (alive_rc) alive_rc.hp -= alive_bc.atk; ctx.logs.push(`  ⚔️ ${alive_bc.name} 反击！`); }

      } else if (rc) {
        // ── 红方单方面攻击 ──
        if (rc._frozen && rc._frozen > 0) { ctx.logs.push(`路线${i+1}: ${rc.name} 被冻结，无法行动`); continue; }
        if (rc._permanentSeal) { ctx.logs.push(`路线${i+1}: ${rc.name} 被永世封印，无法行动`); continue; }

        let attackDamage = rc.atk;
        if (rc.id === 45 && !rc._hasAttacked) { attackDamage *= 2; rc._hasAttacked = true; ctx.logs.push(`  🗡️ ${rc.name} 首次攻击！攻击力×2`); }

        // 翔龙孤龙之怒 - 群攻逻辑
        const rcAloneOnField = ctx.redBF.filter(c => c !== null).length === 1;
        if (rc.id === 70 && rcAloneOnField) {
          let hitAny = false;
          for (let si = 0; si < 4; si++) {
            if (ctx.blueBF[si]) {
              const targetBefore = ctx.blueBF[si].hp;
              ctx.blueBF[si].hp -= rc.atk;
              ctx.logs.push(`  🐉 ${rc.name} 孤龙之怒！攻击路线${si+1} ${ctx.blueBF[si].name} (剩余${ctx.blueBF[si].hp}HP)`);
              // 检查是否击杀
              if (ctx.blueBF[si].hp <= 0) {
                if (ctx.blueBF[si]._permanentSeal) { ctx.blueBF[si].hp = 1; }
                else { ctx.discard.push(ctx.blueBF[si]); ctx.blueBF[si] = null; rc.hp += 3; rc.maxHp = Math.max(rc.maxHp, rc.hp); ctx.logs.push(`  🐉 ${rc.name} 击杀！hp+3`); }
              }
              hitAny = true;
            }
          }
          if (!hitAny) { 
            let dragonDmg = attackDamage;
            dragonDmg = absorbWithBuilding(dragonDmg, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');
            ctx.blueHP -= dragonDmg; 
            ctx.logs.push(`路线${i+1}: ${rc.name} 攻击蓝方玩家，造成 ${dragonDmg} 伤害`); 
          }
        } else {
          // 建筑先吸收伤害
          attackDamage = absorbWithBuilding(attackDamage, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');
          ctx.blueHP -= attackDamage;
          ctx.logs.push(`路线${i+1}: ${rc.name} 攻击蓝方玩家，造成 ${attackDamage} 伤害`);
        }

        if (rc._battleInstinct) { 
          delete rc._battleInstinct; 
          let instinctDmg = rc.atk;
          instinctDmg = absorbWithBuilding(instinctDmg, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');
          ctx.blueHP -= instinctDmg; 
          ctx.logs.push(`  ⚔️ ${rc.name} 战斗本能！再次攻击蓝方玩家`);
        }
        if (rc.id === 61 && attackDamage > 0) { rc.hp += 1; rc.maxHp = Math.max(rc.maxHp, rc.hp); ctx.logs.push(`  💉 ${rc.name} 吸血！hp+1`); }
        // 狼人(16)单方面攻击时：无对手可攻击，额外伤害直接打玩家
        if (rc.id === 16) { 
          let wolfDmg = rc.atk;
          wolfDmg = absorbWithBuilding(wolfDmg, ctx.blueBuilding[i], ctx.blueBuilding, i, ctx.discard, ctx.logs, 'blue');
          ctx.blueHP -= wolfDmg; 
          ctx.logs.push(`  ⚡ ${rc.name} 狼性爆发：再次造成${wolfDmg}点伤害`);
        }

      } else if (bc) {
        // ── 蓝方单方面攻击 ──
        if (bc._frozen && bc._frozen > 0) { ctx.logs.push(`路线${i+1}: ${bc.name} 被冻结，无法行动`); continue; }
        if (bc._permanentSeal) { ctx.logs.push(`路线${i+1}: ${bc.name} 被永世封印，无法行动`); continue; }

        let attackDamage = bc.atk;
        if (bc.id === 45 && !bc._hasAttacked) { attackDamage *= 2; bc._hasAttacked = true; ctx.logs.push(`  🗡️ ${bc.name} 首次攻击！攻击力×2`); }

        const bcAloneOnField = ctx.blueBF.filter(c => c !== null).length === 1;
        if (bc.id === 70 && bcAloneOnField) {
          let hitAny = false;
          for (let si = 0; si < 4; si++) {
            if (ctx.redBF[si]) {
              const targetBefore = ctx.redBF[si].hp;
              ctx.redBF[si].hp -= bc.atk;
              ctx.logs.push(`  🐉 ${bc.name} 孤龙之怒！攻击路线${si+1} ${ctx.redBF[si].name} (剩余${ctx.redBF[si].hp}HP)`);
              if (ctx.redBF[si].hp <= 0) {
                if (ctx.redBF[si]._permanentSeal) { ctx.redBF[si].hp = 1; }
                else { ctx.discard.push(ctx.redBF[si]); ctx.redBF[si] = null; bc.hp += 3; bc.maxHp = Math.max(bc.maxHp, bc.hp); ctx.logs.push(`  🐉 ${bc.name} 击杀！hp+3`); }
              }
              hitAny = true;
            }
          }
          if (!hitAny) { 
            let dragonDmg = attackDamage;
            dragonDmg = absorbWithBuilding(dragonDmg, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
            ctx.redHP -= dragonDmg; 
            ctx.logs.push(`路线${i+1}: ${bc.name} 攻击红方玩家，造成 ${dragonDmg} 伤害`); 
          }
        } else {
          // 建筑先吸收伤害
          attackDamage = absorbWithBuilding(attackDamage, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
          ctx.redHP -= attackDamage;
          ctx.logs.push(`路线${i+1}: ${bc.name} 攻击红方玩家，造成 ${attackDamage} 伤害`);
        }

        if (bc._battleInstinct) { 
          delete bc._battleInstinct; 
          let instinctDmg = bc.atk;
          instinctDmg = absorbWithBuilding(instinctDmg, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
          ctx.redHP -= instinctDmg; 
          ctx.logs.push(`  ⚔️ ${bc.name} 战斗本能！再次攻击红方玩家`);
        }
        if (bc.id === 61 && attackDamage > 0) { bc.hp += 1; bc.maxHp = Math.max(bc.maxHp, bc.hp); ctx.logs.push(`  💉 ${bc.name} 吸血！hp+1`); }
        // 狼人(16)单方面攻击时：无对手可攻击，额外伤害直接打玩家
        if (bc.id === 16) { 
          let wolfDmg = bc.atk;
          wolfDmg = absorbWithBuilding(wolfDmg, ctx.redBuilding[i], ctx.redBuilding, i, ctx.discard, ctx.logs, 'red');
          ctx.redHP -= wolfDmg; 
          ctx.logs.push(`  ⚡ ${bc.name} 狼性爆发：再次造成${wolfDmg}点伤害`);
        }
      }

      // 每条战线计算完成，立即通知UI显示结果
      if (onLaneResolve) {
        onLaneResolve(i, {
          red: ctx.redBF[i],
          blue: ctx.blueBF[i],
          redBuilding: ctx.redBuilding[i],
          blueBuilding: ctx.blueBuilding[i],
          redHP: ctx.redHP,
          blueHP: ctx.blueHP
        });
      }

      // 等待用户看清结果
      await new Promise(r => setTimeout(r, 800));
    }

    // 燃躯(98)
    [[ctx.redBF, 'red'], [ctx.blueBF, 'blue']].forEach(([bf, p]) => {
      bf.forEach((c, idx) => {
        if (c && c._burnSacrifice) { ctx.discard.push(c); bf[idx] = null; ctx.logs.push(`🔥 ${c.name} 燃躯耗尽，死亡`); }
      });
    });

    setBattleAnimation({ active: false, lane: -1 });

    // 奇迹牌里程碑
    let miracleDeck = [...gameState.miracleDeck];
    let redHand     = [...gameState.red.hand];
    let blueHand    = [...gameState.blue.hand];
    let redDrawn    = [...gameState.red.miracleDrawn];
    let blueDrawn   = [...gameState.blue.miracleDrawn];

    if (ctx.redHP < gameState.red.health) {
      const r = _drawMiracleByHP(ctx.redHP, redDrawn, redHand, miracleDeck, ctx.logs, 'red');
      redDrawn = r.drawn; miracleDeck = r.miracleDeck;
    }
    if (ctx.blueHP < gameState.blue.health) {
      const r = _drawMiracleByHP(ctx.blueHP, blueDrawn, blueHand, miracleDeck, ctx.logs, 'blue');
      blueDrawn = r.drawn; miracleDeck = r.miracleDeck;
    }

    // 判胜
    let winner = null;
    if (ctx.redHP <= 0 || ctx.blueHP <= 0) {
      winner = ctx.redHP > ctx.blueHP ? '红方' : (ctx.blueHP > ctx.redHP ? '蓝方' : '平局');
      ctx.logs.push(`🎉 ${winner === '平局' ? '平局！双方血量相同' : winner + '获胜！对手生命归零'}`);
      window.SoundManager.playSound('victory');
    } else {
      ctx.logs.push('战斗结算完成');
    }

    let finalState = {
      ...gameState,
      phase: 'idle',
      red:  { ...gameState.red,  battlefield: ctx.redBF,  buildings: ctx.redBuilding,  health: ctx.redHP,  hand: redHand,  miracleDrawn: redDrawn },
      blue: { ...gameState.blue, battlefield: ctx.blueBF, buildings: ctx.blueBuilding, health: ctx.blueHP, hand: blueHand, miracleDrawn: blueDrawn },
      miracleDeck,
      discardPile: ctx.discard,
      log: [...gameState.log, ...ctx.logs]
    };

    // 重新计算被动效果
    finalState = calculatePassiveEffects(finalState);

    onFinish({ state: finalState, winner });
  }

  // ─────────────────────────────────────────────
  // 牌库耗尽判断（战斗结算后延迟调用）
  // ─────────────────────────────────────────────
  function checkDeckEmpty(state, currentWinner) {
    if (state.deck.length === 0 && state.red.hand.length === 0 && state.blue.hand.length === 0 && !currentWinner) {
      const w = state.red.health > state.blue.health ? '红方' : (state.blue.health > state.red.health ? '蓝方' : '平局');
      window.SoundManager.playSound('victory');
      return {
        winner: w,
        state: { ...state, log: [...state.log, '--- 牌库耗尽 ---', `红方:${state.red.health} | 蓝方:${state.blue.health}`, `${w === '平局' ? '平局' : w + '获胜'}`] }
      };
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // 换位模式（空间法师 id=28 / 支援牌 requiresUIMode）
  //
  // swapMode 结构：
  //   { type: 'reposition' | 'swapBattlefield', card?, spaceMage?: {player, lane}, firstSlot: null | {player, lane, card} }
  //
  // type 说明：
  //   reposition      — 空间法师激活，或支援牌"重排"类型：只能在己方内移动，可连续操作
  //   swapBattlefield — 支援牌"替名"类型：可跨双方交换，只执行一次
  // ─────────────────────────────────────────────

  /**
   * 激活空间法师换位模式（点击战场上的空间法师卡牌时调用）
   * 返回新的 swapMode 对象，调用方负责 setSwapMode；失败时返回 { error }
   */
  function activateSpaceMage(gameState, player, lane) {
    const card = gameState[player].battlefield[lane];
    if (!card || card.id !== 28) return { error: '错误：不是空间法师！' };
    if (card.usedAbilityThisPhase)  return { error: '空间法师本阶段已使用过重置位置！' };
    return {
      swapMode: { type: 'reposition', spaceMage: { player, lane }, firstSlot: null },
      logMsg: `${card.name}: 进入重排模式...`
    };
  }

  /**
   * 检查 confirmUse 时是否需要进入换位模式（支援牌 requiresUIMode）
   * 返回 { swapMode, logMsg } 或 null（不需要换位模式）
   */
  function checkRequiresSwapMode(card, player) {
    const config = window.CardEffectConfigs?.[card.id];
    if (!config?.requiresUIMode) return null;
    const mode = config.requiresUIMode;
    return {
      swapMode: { type: mode, card, firstSlot: null },
      logMsg: `${card.name}: 请选择${
        mode === 'reposition'      ? '要移动的卡牌（己方）' :
        mode === 'swapBattlefield' ? '第一张要交换的卡牌'  :
        '手牌'
      }...`
    };
  }

  /**
   * 处理战场点击（换位模式下）
   * 返回：
   *   { error }                       — 操作不合法，给出提示
   *   { state, swapMode, logMsg? }    — 操作成功，更新游戏状态和 swapMode
   *   { done, state, logMsg? }        — 换位完成（swapBattlefield 执行后或任意模式的收尾）
   */
  function handleSwapClick(gameState, swapMode, clickedPlayer, clickedLane, currentPhasePlayer) {
    if (!swapMode.firstSlot) {
      // ── 第一次点击：选择源卡牌 ──
      if (swapMode.type === 'reposition' && clickedPlayer !== currentPhasePlayer) {
        return { error: '空间法术只能重排己方阵型！' };
      }
      const card = gameState[clickedPlayer].battlefield[clickedLane];
      if (!card) return { error: '该位置没有卡牌！' };
      return {
        swapMode: { ...swapMode, firstSlot: { player: clickedPlayer, lane: clickedLane, card } },
        logMsg: `选中 ${card.name}，请点击目标位置...`
      };
    } else {
      // ── 第二次点击：执行换位 ──
      const { firstSlot } = swapMode;
      if (firstSlot.player === clickedPlayer && firstSlot.lane === clickedLane) {
        return { error: '请选择不同的位置！' };
      }
      if (swapMode.type === 'reposition' && firstSlot.player !== clickedPlayer) {
        return { error: '空间法术只能在己方内交换！' };
      }

      // 执行交换（深拷贝避免直接修改）
      const newState = JSON.parse(JSON.stringify(gameState));
      const card1 = newState[firstSlot.player].battlefield[firstSlot.lane];
      const card2 = newState[clickedPlayer].battlefield[clickedLane];
      newState[firstSlot.player].battlefield[firstSlot.lane] = card2;
      newState[clickedPlayer].battlefield[clickedLane]       = card1;
      const logMsg = `交换 ${card1?.name || '空位'} 和 ${card2?.name || '空位'}`;

      if (swapMode.type === 'swapBattlefield') {
        // 替名：只执行一次，完成后需要调用 finishSwapMode
        return { done: true, state: newState, logMsg };
      } else {
        // reposition：可继续选择
        return {
          state: newState,
          swapMode: { ...swapMode, firstSlot: null },
          logMsg,
          continueMsg: '继续选择或点击"完成重排"...'
        };
      }
    }
  }

  /**
   * 完成换位模式：
   *   - 空间法师触发：标记 usedAbilityThisPhase，不消耗卡牌
   *   - 支援牌触发：消耗手牌和金币
   * 返回更新后的 gameState（调用方再 setSwapMode(null)）
   */
  function finishSwapMode(gameState, swapMode) {
    const newState = JSON.parse(JSON.stringify(gameState));

    if (swapMode.spaceMage) {
      // 空间法师：只标记已使用
      const { player, lane } = swapMode.spaceMage;
      const card = newState[player].battlefield[lane];
      if (card && card.id === 28) {
        card.usedAbilityThisPhase = true;
        newState.log.push(`${card.name} 已使用重置位置（本阶段）`);
      }
    } else if (swapMode.card) {
      // 支援牌：消耗
      const card   = swapMode.card;
      const player = getPhasePlayer(newState.phase);
      const cost   = card.type === 'miracle' ? 0 : card.cost;
      newState[player].hand  = newState[player].hand.filter(c => c.instanceId !== card.instanceId);
      newState[player].coins = newState[player].coins - cost;
      newState.discardPile   = [...newState.discardPile, card];
      newState.selectedCard  = null;
      newState.log.push(`${card.name} 使用完成`);
    }

    window.SoundManager.playSound('click');
    return newState;
  }

  /**
   * 阶段结束时清除所有空间法师的 usedAbilityThisPhase 标记
   */
  function clearSpaceMageFlags(gameState) {
    const newState = JSON.parse(JSON.stringify(gameState));
    ['red', 'blue'].forEach(player => {
      newState[player].battlefield.forEach(card => {
        if (card && card.id === 28) card.usedAbilityThisPhase = false;
      });
    });
    return newState;
  }

  // ─────────────────────────────────────────────
  // 公开 API
  // ─────────────────────────────────────────────
  return {
    INIT_STATE,
    INIT_PLAYER_STATE,
    initGame,
    initGameWithSeed,
    calculatePassiveEffects,
    doStartTurn,
    getNextPhase,
    getPhasePlayer,
    PHASE_NAMES,
    playCard,
    useCardOnTarget,
    confirmUse,
    resolveBattle,
    checkDeckEmpty,
    // 换位模式
    activateSpaceMage,
    checkRequiresSwapMode,
    handleSwapClick,
    finishSwapMode,
    clearSpaceMageFlags
  };
})();