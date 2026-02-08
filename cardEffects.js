// ════════════════════════════════════════════════════════════
// cardEffects.js — 卡牌效果系统
// 提供统一的效果触发接口，供 localGame/gameAI/gameOnline 调用
// ════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 辅助工具函数
  // ──────────────────────────────────────────────────────────

  /**
   * 根据 filter 查找目标卡牌
   * @param {Object} state - 游戏状态
   * @param {Object} filter - 过滤条件
   * @param {Object} ctx - 上下文（包含 player, opponent, target 等）
   * @returns {Array} 目标卡牌数组
   */
  function findTargets(state, filter, ctx) {
    let targets = [];

    console.log('[findTargets] 过滤器:', filter, '上下文:', { player: ctx.player, target: ctx.target?.name, card: ctx.card?.name });

    // 处理特殊目标：self（卡牌自己）
    if (filter.target === 'self') {
      if (ctx.card && ctx.card.instanceId) {
        console.log('[findTargets] 查找卡牌自身:', ctx.card.name, 'instanceId:', ctx.card.instanceId);
        
        // 在深拷贝的状态中通过 instanceId 找到这张卡
        ['red', 'blue'].forEach(player => {
          state[player].battlefield.forEach((card, idx) => {
            if (card && card.instanceId === ctx.card.instanceId) {
              targets.push(card);
              console.log('[findTargets] 找到自身引用:', card.name, '在', player, '路线', idx, 'atk:', card.atk, 'hp:', card.hp);
            }
          });
        });
        
        if (targets.length === 0) {
          console.error('[findTargets] 错误：找不到自身！');
        }
        return targets;
      }
      console.log('[findTargets] 错误：需要自身但 card 未提供');
      return [];
    }

    // 处理特殊目标：selected（玩家选中的目标）
    if (filter.target === 'selected') {
      if (ctx.target) {
        console.log('[findTargets] 使用选中目标:', ctx.target.name);
        return [ctx.target];
      }
      console.log('[findTargets] 错误：需要选中目标但未找到');
      return [];
    }

    // 确定目标玩家
    const players = filter.player === 'self' ? [ctx.player] :
                   filter.player === 'opponent' ? [ctx.opponent] :
                   filter.player === 'both' ? ['red', 'blue'] :
                   [];

    console.log('[findTargets] 目标玩家:', players);

    // 从战场/手牌收集卡牌
    players.forEach(p => {
      if (filter.location === 'battlefield' || !filter.location) {
        const bf = state[p].battlefield.filter(c => c !== null);
        console.log(`[findTargets] ${p}方战场:`, bf.length, '张牌');
        targets.push(...bf);
      }
      if (filter.location === 'hand') {
        console.log(`[findTargets] ${p}方手牌:`, state[p].hand.length, '张牌');
        targets.push(...state[p].hand);
      }
    });

    console.log('[findTargets] 初步目标:', targets.length, targets.map(t => t.name));

    // 种族过滤
    if (filter.race) {
      const races = Array.isArray(filter.race) ? filter.race : [filter.race];
      targets = targets.filter(c => 
        races.includes(c.stRace) || races.includes(c.ndRace)
      );
      console.log('[findTargets] 种族过滤后:', targets.length);
    }

    // 稀有度过滤
    if (filter.rarity) {
      const rarities = Array.isArray(filter.rarity) ? filter.rarity : [filter.rarity];
      targets = targets.filter(c => rarities.includes(c.rarity));
      console.log('[findTargets] 稀有度过滤后:', targets.length);
    }

    // 类型过滤
    if (filter.type) {
      targets = targets.filter(c => c.type === filter.type);
      console.log('[findTargets] 类型过滤后:', targets.length);
    }

    console.log('[findTargets] 最终目标:', targets.map(t => ({ name: t.name, instanceId: t.instanceId })));
    return targets;
  }

  /**
   * 检查卡牌是否满足条件
   * @param {Object} card - 卡牌对象
   * @param {Object} condition - 条件对象
   * @returns {Boolean}
   */
  function checkCondition(card, condition) {
    if (!condition) return true;

    // 种族条件
    if (condition.race) {
      const races = Array.isArray(condition.race) ? condition.race : [condition.race];
      const hasRace = races.includes(card.stRace) || races.includes(card.ndRace);
      if (!hasRace) return false;
    }

    // 稀有度条件
    if (condition.rarity) {
      const rarities = Array.isArray(condition.rarity) ? condition.rarity : [condition.rarity];
      if (!rarities.includes(card.rarity)) return false;
    }

    // 类型条件
    if (condition.type) {
      if (card.type !== condition.type) return false;
    }

    return true;
  }

  // ──────────────────────────────────────────────────────────
  // 效果原子函数库（基础积木）
  // ──────────────────────────────────────────────────────────

  const EffectAtoms = {
    /**
     * 修改攻击力
     * @param {Number} amount - 增加/减少的数值
     * @param {Object} filter - 目标过滤器
     * @param {Object} condition - 额外条件（可选）
     */
    modifyAtk(amount, filter, condition) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        console.log('[modifyAtk] 目标数量:', targets.length, '目标:', targets.map(t => t.name));
        
        targets.forEach(card => {
          // 检查额外条件
          if (condition && !checkCondition(card, condition)) {
            console.log('[modifyAtk] 跳过:', card.name, '(不满足条件)');
            return;
          }

          card.atk += amount;
          const sign = amount > 0 ? '+' : '';
          ctx.log(`${card.name} 攻击力${sign}${amount} (当前: ${card.atk})`);
          console.log('[modifyAtk] 修改:', card.name, 'atk', sign + amount, '→', card.atk);
        });

        return state;
      };
    },

    /**
     * 修改生命值
     * @param {Number} amount - 增加/减少的数值
     * @param {Object} filter - 目标过滤器
     * @param {Object} condition - 额外条件（可选）
     */
    modifyHp(amount, filter, condition) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        
        targets.forEach(card => {
          // 检查额外条件
          if (condition && !checkCondition(card, condition)) {
            return;
          }

          card.hp += amount;
          card.maxHp = Math.max(card.maxHp, card.hp); // maxHp 也要增加
          const sign = amount > 0 ? '+' : '';
          ctx.log(`${card.name} 生命值${sign}${amount} (当前: ${card.hp}/${card.maxHp})`);
        });

        return state;
      };
    },

    /**
     * 条件性修改攻击力（满足条件时额外加成）
     * @param {Number} baseAmount - 基础增加值
     * @param {Number} bonusAmount - 满足条件时的额外增加值
     * @param {Object} condition - 条件对象
     * @param {Object} filter - 目标过滤器
     */
    conditionalModifyAtk(baseAmount, bonusAmount, condition, filter) {
      return (ctx, state) => {
        console.log('[conditionalModifyAtk] 参数:', { baseAmount, bonusAmount, condition, filter });
        const targets = findTargets(state, filter, ctx);
        console.log('[conditionalModifyAtk] 找到目标:', targets.length, targets.map(t => ({ name: t.name, stRace: t.stRace, ndRace: t.ndRace })));
        
        targets.forEach(card => {
          const meetsCondition = checkCondition(card, condition);
          const bonus = meetsCondition ? bonusAmount : 0;
          const totalAmount = baseAmount + bonus;
          
          console.log('[conditionalModifyAtk] 处理:', card.name, '满足条件:', meetsCondition, '加成:', totalAmount);
          
          if (totalAmount !== 0) {
            card.atk += totalAmount;
            const sign = totalAmount > 0 ? '+' : '';
            
            if (bonus > 0) {
              ctx.log(`${card.name} 攻击力${sign}${totalAmount} (基础${baseAmount}+条件加成${bonus}) (当前: ${card.atk})`);
            } else {
              ctx.log(`${card.name} 攻击力${sign}${totalAmount} (当前: ${card.atk})`);
            }
          }
        });

        return state;
      };
    },

    /**
     * 条件性修改生命值（满足条件时额外加成）
     */
    conditionalModifyHp(baseAmount, bonusAmount, condition, filter) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        
        targets.forEach(card => {
          const bonus = checkCondition(card, condition) ? bonusAmount : 0;
          const totalAmount = baseAmount + bonus;
          
          if (totalAmount !== 0) {
            card.hp += totalAmount;
            card.maxHp = Math.max(card.maxHp, card.hp);
            const sign = totalAmount > 0 ? '+' : '';
            
            if (bonus > 0) {
              ctx.log(`${card.name} 生命值${sign}${totalAmount} (基础${baseAmount}+条件加成${bonus}) (当前: ${card.hp}/${card.maxHp})`);
            } else {
              ctx.log(`${card.name} 生命值${sign}${totalAmount} (当前: ${card.hp}/${card.maxHp})`);
            }
          }
        });

        return state;
      };
    },

    /**
     * 玩家治疗
     * @param {Number} amount - 治疗量
     * @param {Object} filter - 目标过滤器 (player: 'self' | 'opponent')
     */
    playerHeal(amount, filter) {
      return (ctx, state) => {
        const target = filter.player === 'self' ? ctx.player : ctx.opponent;
        
        state[target].health += amount;
        const sign = amount > 0 ? '+' : '';
        ctx.log(`${target === 'red' ? '红方' : '蓝方'}玩家 生命${sign}${amount} (当前: ${state[target].health})`);
        console.log('[playerHeal] 玩家治疗:', target, sign + amount, '→', state[target].health);

        return state;
      };
    },

    /**
     * 玩家伤害
     * @param {Number} amount - 伤害量
     * @param {Object} filter - 目标过滤器
     */
    playerDamage(amount, filter) {
      return (ctx, state) => {
        const target = filter.player === 'self' ? ctx.player : ctx.opponent;
        
        state[target].health -= amount;
        ctx.log(`${target === 'red' ? '红方' : '蓝方'}玩家 受到${amount}点伤害 (当前: ${state[target].health})`);
        console.log('[playerDamage] 玩家受伤:', target, '-' + amount, '→', state[target].health);

        return state;
      };
    },

    /**
     * 杀死卡牌
     * @param {Object} filter - 目标过滤器
     */
    killCard(filter) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        console.log('[killCard] 准备杀死:', targets.length, '张牌');
        
        targets.forEach(card => {
          // 找到并移除这张卡
          ['red', 'blue'].forEach(player => {
            state[player].battlefield = state[player].battlefield.map(c => {
              if (c && c.instanceId === card.instanceId) {
                ctx.log(`${card.name} 被杀死`);
                console.log('[killCard] 移除:', card.name);
                state.discardPile.push(c);
                return null;
              }
              return c;
            });
          });
        });

        return state;
      };
    },

    /**
     * 清空战场
     * @param {Object} filter - 目标过滤器（可选，默认清除所有）
     */
    clearField(filter) {
      return (ctx, state) => {
        const players = filter?.player === 'self' ? [ctx.player] :
                       filter?.player === 'opponent' ? [ctx.opponent] :
                       ['red', 'blue'];
        
        players.forEach(player => {
          const cards = state[player].battlefield.filter(c => c !== null);
          
          // 检查种族过滤
          let toRemove = cards;
          if (filter?.exceptRace) {
            const exceptRaces = Array.isArray(filter.exceptRace) ? filter.exceptRace : [filter.exceptRace];
            toRemove = cards.filter(c => !exceptRaces.includes(c.stRace) && !exceptRaces.includes(c.ndRace));
          }
          
          toRemove.forEach(card => {
            state.discardPile.push(card);
            ctx.log(`${card.name} 被清除`);
          });
          
          state[player].battlefield = state[player].battlefield.map(c => {
            if (c && toRemove.some(r => r.instanceId === c.instanceId)) {
              return null;
            }
            return c;
          });
        });

        console.log('[clearField] 战场已清空');
        return state;
      };
    },

    /**
     * 立即跳到下一回合
     */
    skipTurn() {
      return (ctx, state) => {
        // 添加特殊标记，让confirmUse识别并触发nextTurn
        state._skipToNextTurn = true;
        ctx.log('末日！战场清空，立即进入下一回合');
        console.log('[skipTurn] 触发跳过回合');
        return state;
      };
    },

    /**
     * 地狱之主效果
     */
    hellLordBonus() {
      return (ctx, state) => {
        const player = ctx.player;
        const opponent = ctx.opponent;
        
        // 检查己方是否有恶魔
        const hasDemon = state[player].battlefield.some(c => 
          c && (c.stRace === '恶魔' || c.ndRace === '恶魔')
        );
        
        const selfBonus = hasDemon ? 4 : 3; // 有恶魔则+4，否则+3
        
        // 我方怪物增强
        state[player].battlefield.forEach(card => {
          if (card && (card.stRace === '怪物' || card.ndRace === '怪物')) {
            card.hp += selfBonus;
            card.maxHp += selfBonus;
            card.atk += selfBonus;
            console.log(`[hellLordBonus] 我方${card.name} hp+${selfBonus}, atk+${selfBonus}`);
          }
        });
        
        // 敌方怪物削弱（不影响legendary）
        state[opponent].battlefield.forEach(card => {
          if (card && (card.stRace === '怪物' || card.ndRace === '怪物') && card.rarity !== 'legendary') {
            card.hp -= 3;
            card.maxHp -= 3;
            card.atk = Math.max(0, card.atk - 3);
            console.log(`[hellLordBonus] 敌方${card.name} hp-3, atk-3`);
          }
        });
        
        ctx.log(`地狱之主降临！我方怪物强化+${selfBonus}/+${selfBonus}，敌方怪物削弱-3/-3`);
        return state;
      };
    },

    /**
     * 互换双方战场
     */
    swapBattlefields() {
      return (ctx, state) => {
        const player = ctx.player;
        const opponent = ctx.opponent;
        
        const temp = state[player].battlefield;
        state[player].battlefield = state[opponent].battlefield;
        state[opponent].battlefield = temp;
        
        ctx.log('契约生效！双方战场互换！');
        console.log('[swapBattlefields] 战场已互换');
        return state;
      };
    },

    /**
     * 首次攻击冻结目标
     */
    freezeOnFirstAttack(turns) {
      return (ctx, state) => {
        const card = ctx.card;
        
        // 检查是否已使用过首次攻击
        if (card._hasUsedFirstAttack) {
          return state;
        }
        
        // 标记已使用
        card._hasUsedFirstAttack = true;
        
        // 冻结目标
        const target = ctx.target;
        if (target) {
          target._frozen = turns;
          ctx.log(`${card.name} 冻结了 ${target.name} ${turns}回合！`);
          console.log('[freezeOnFirstAttack]', target.name, '被冻结', turns, '回合');
        }
        
        return state;
      };
    },

    /**
     * 冻结卡牌
     * @param {Number} turns - 冻结回合数
     * @param {Object} filter - 目标过滤器
     */
    freeze(turns, filter) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        
        targets.forEach(card => {
          card.frozen = turns;
          ctx.log(`${card.name} 被冻结${turns}回合`);
          console.log('[freeze] 冻结:', card.name, turns, '回合');
        });

        return state;
      };
    },

    /**
     * 获得金币
     * @param {Number} amount - 金币数量
     */
    gainCoins(amount, condition) {
      return (ctx, state) => {
        let actualAmount = amount;
        
        // 检查条件加成
        if (condition) {
          let hasCondition = false;
          ['red', 'blue'].forEach(player => {
            state[player].battlefield.forEach(card => {
              if (card && checkCondition(card, condition)) {
                hasCondition = true;
              }
            });
          });
          
          if (hasCondition && condition.bonus !== undefined) {
            actualAmount = condition.bonus;
          }
        }
        
        state[ctx.player].coins += actualAmount;
        ctx.log(`获得${actualAmount}金币 (当前: ${state[ctx.player].coins})`);
        console.log('[gainCoins] 获得金币:', actualAmount);

        return state;
      };
    },

    /**
     * 移除负面效果
     * @param {Object} filter - 目标过滤器
     */
    removeDebuffs(filter) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        
        targets.forEach(card => {
          // 移除冻结
          if (card.frozen) {
            delete card.frozen;
            ctx.log(`${card.name} 解除冻结`);
          }
          // 可以添加其他负面效果的移除
          console.log('[removeDebuffs] 移除负面效果:', card.name);
        });

        return state;
      };
    },

    /**
     * 条件性击杀（根据玩家生命值）
     * @param {Object} condition - 条件 { playerHpThreshold: 7 }
     */
    conditionalKillPlayer(condition) {
      return (ctx, state) => {
        const opponent = ctx.opponent;
        const opponentHp = state[opponent].health;
        
        if (opponentHp <= condition.playerHpThreshold) {
          state[opponent].health = 0;
          // ✅ 添加立即胜利标记
          state._immediateVictory = ctx.player;
          ctx.log(`处决！敌方玩家血量<=${condition.playerHpThreshold}，立即击杀！`);
          console.log('[conditionalKillPlayer] 处决成功，触发立即胜利');
        } else {
          ctx.log(`处决失败：敌方血量${opponentHp} > ${condition.playerHpThreshold}`);
        }

        return state;
      };
    },

    /**
     * 对敌方按血量排序造成递减伤害
     * @param {Number} baseDamage - 基础伤害
     */
    cascadeDamage(baseDamage) {
      return (ctx, state) => {
        const opponent = ctx.opponent;
        const targets = state[opponent].battlefield.filter(c => c !== null);
        
        // 按hp从高到低排序
        targets.sort((a, b) => b.hp - a.hp);
        
        targets.forEach((card, index) => {
          const damage = Math.max(1, baseDamage - index);
          card.hp -= damage;
          ctx.log(`${card.name} 受到${damage}点伤害 (剩余: ${card.hp})`);
          
          if (card.hp <= 0) {
            ctx.log(`${card.name} 被击败`);
          }
        });

        console.log('[cascadeDamage] 级联伤害完成');
        return state;
      };
    },

     /**
     * 从弃牌堆抽牌
     * @param {Number} amount - 抽取数量
     */
    drawFromDiscard(amount) {
      return (ctx, state) => {
        const player = ctx.player;
        const discardPile = state.discardPile || [];
        
        if (discardPile.length === 0) {
          ctx.log('弃牌堆是空的！');
          return state;
        }
        
        // 从弃牌堆末尾抽取（最近丢弃的牌）
        const actualAmount = Math.min(amount, discardPile.length);
        const drawnCards = [];
        
        for (let i = 0; i < actualAmount; i++) {
          const card = discardPile.pop();  // 从末尾取
          state[player].hand.push(card);
          drawnCards.push(card.name);
        }
        
        ctx.log(`从弃牌堆抽取${actualAmount}张牌: ${drawnCards.join(', ')}`);
        console.log('[drawFromDiscard] 抽取:', drawnCards);
        
        return state;
      };
    },

/**
 * 丢弃所有手牌并重抽（回收到公共/奇迹牌库，然后重抽）
 */
discardAndRedraw() {
  return (ctx, state) => {
    const player = ctx.player;
    const hand = state[player].hand;
    
    if (hand.length === 0) {
      ctx.log('手牌为空，无法重生！');
      return state;
    }
    
    // 统计数量
    let normalCount = 0;
    let miracleCount = 0;
    
    hand.forEach(card => {
      if (card.type === 'miracle') {
        miracleCount++;
      } else {
        normalCount++;
      }
    });
    
    console.log('[discardAndRedraw] 手牌:', normalCount, '张普通牌,', miracleCount, '张奇迹牌');
    
    // ✨ 分类回收到对应牌库
    hand.forEach(card => {
      if (card.type === 'miracle') {
        state.miracleDeck.push(card);
      } else {
        state.deck.push(card);  // 公共牌库
      }
    });
    
    // ✨ 洗牌（公共牌库）
    if (normalCount > 0) {
      for (let i = state.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
      }
      ctx.log(`回收${normalCount}张普通牌到公共牌库并洗牌`);
    }
    
    // ✨ 洗牌（奇迹牌库）
    if (miracleCount > 0) {
      for (let i = state.miracleDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.miracleDeck[i], state.miracleDeck[j]] = [state.miracleDeck[j], state.miracleDeck[i]];
      }
      ctx.log(`回收${miracleCount}张奇迹牌到奇迹牌库并洗牌`);
    }
    
    // ✨ 清空手牌
    state[player].hand = [];
    
    // ✨ 重抽普通牌（从公共牌库）
    const drawnNormal = [];
    const actualNormal = Math.min(normalCount, state.deck.length);
    for (let i = 0; i < actualNormal; i++) {
      const card = state.deck.shift();
      state[player].hand.push(card);
      drawnNormal.push(card.name);
    }
    
    // ✨ 重抽奇迹牌（从奇迹牌库）
    const drawnMiracle = [];
    const actualMiracle = Math.min(miracleCount, state.miracleDeck.length);
    for (let i = 0; i < actualMiracle; i++) {
      const card = state.miracleDeck.shift();
      state[player].hand.push(card);
      drawnMiracle.push(card.name);
    }
    
    ctx.log(`重抽${actualNormal}张普通牌: ${drawnNormal.join(', ')}`);
    if (actualMiracle > 0) {
      ctx.log(`重抽${actualMiracle}张奇迹牌: ${drawnMiracle.join(', ')}`);
    }
    
    console.log('[discardAndRedraw] 重生完成');
    console.log('  - 回收:', normalCount, '普通,', miracleCount, '奇迹');
    console.log('  - 重抽:', actualNormal, '普通,', actualMiracle, '奇迹');
    
    return state;
  };
},

 /**
 * 从公共牌库抽牌（支持条件加成）
 */
drawCards(baseAmount, bonusAmount, condition) {
  return (ctx, state) => {
    const player = ctx.player;
    let amount = baseAmount;
    
    // 检查条件
    if (condition && bonusAmount) {
      let conditionMet = false;
      
      if (condition.type === 'hasRaceOnField') {
        const checkPlayer = condition.player === 'self' ? player : 
                           condition.player === 'opponent' ? ctx.opponent : null;
        
        if (checkPlayer) {
          const battlefield = state[checkPlayer].battlefield.filter(c => c !== null);
          conditionMet = battlefield.some(card => 
            condition.races.includes(card.stRace) || 
            condition.races.includes(card.ndRace)
          );
          
          console.log('[drawCards] 检查场上是否有', condition.races, ':', conditionMet);
          console.log('[drawCards] 战场牌:', battlefield.map(c => ({ name: c.name, stRace: c.stRace, ndRace: c.ndRace })));
        }
      }
      
      if (conditionMet) {
        amount += bonusAmount;
        ctx.log(`检测到${condition.races.join('/')}，额外抽${bonusAmount}张！`);
      }
    }
    
    // ✨ 修复：从公共牌库抽牌（不是玩家牌库）
    const deck = state.deck || [];  // 公共牌库
    const actualAmount = Math.min(amount, deck.length);
    const drawnCards = [];
    
    for (let i = 0; i < actualAmount; i++) {
      const card = deck.shift();  // 从公共牌库顶部抽
      state[player].hand.push(card);  // 加入玩家手牌
      drawnCards.push(card.name);
    }
    
    ctx.log(`抽取${actualAmount}张牌: ${drawnCards.join(', ')}`);
    console.log('[drawCards] 从公共牌库抽取:', actualAmount, '张牌', drawnCards);
    
    return state;
  };
},
    /**
     * 添加免疫标记
     * @param {Object} filter - 目标过滤器
     */
    addImmunity(filter) {
      return (ctx, state) => {
        const targets = findTargets(state, filter, ctx);
        
        if (targets.length === 0) {
          ctx.log('未找到目标！');
          return state;
        }
        
        targets.forEach(card => {
          card.immunity = true;  // 添加免疫标记
          ctx.log(`${card.name} 获得祝福，免疫一次负面效果！`);
          console.log('[addImmunity] 免疫:', card.name);
        });
        
        return state;
      };
    },

    /**
 * 随机互换手牌
 * @param {Number} amount - 互换数量
 */
swapRandomHands(amount) {
  return (ctx, state) => {
    const player = ctx.player;
    const opponent = ctx.opponent;
    const usingCard = ctx.card;  // 正在使用的卡牌（愚戏）
    
    const myHand = state[player].hand;
    const oppHand = state[opponent].hand;
    
    // ✅ 修复：排除正在使用的卡牌，避免愚戏自己被换走
    const availableMyHand = myHand.filter(c => c.instanceId !== usingCard.instanceId);
    
    // 检查手牌数量
    const mySwapAmount = Math.min(amount, availableMyHand.length);
    const oppSwapAmount = Math.min(amount, oppHand.length);
    
    if (mySwapAmount === 0 && oppSwapAmount === 0) {
      ctx.log('双方手牌都为空，无法交换！');
      return state;
    }
    
    // 从我方手牌随机抽取（排除愚戏本身）
    const mySwappedCards = [];
    for (let i = 0; i < mySwapAmount; i++) {
      const randomIndex = Math.floor(Math.random() * availableMyHand.length);
      const card = availableMyHand.splice(randomIndex, 1)[0];
      mySwappedCards.push(card);
      // 同时从原手牌中移除
      const originalIndex = myHand.findIndex(c => c.instanceId === card.instanceId);
      if (originalIndex !== -1) {
        myHand.splice(originalIndex, 1);
      }
    }
    
    // 从敌方手牌随机抽取
    const oppSwappedCards = [];
    for (let i = 0; i < oppSwapAmount; i++) {
      const randomIndex = Math.floor(Math.random() * oppHand.length);
      const card = oppHand.splice(randomIndex, 1)[0];
      oppSwappedCards.push(card);
    }
    
    // 交换到对方手牌
    state[player].hand.push(...oppSwappedCards);
    state[opponent].hand.push(...mySwappedCards);
    
    ctx.log(`互换手牌：我方给出${mySwapAmount}张，获得${oppSwapAmount}张`);
    console.log('[swapRandomHands] 我方给出:', mySwappedCards.map(c => c.name));
    console.log('[swapRandomHands] 我方获得:', oppSwappedCards.map(c => c.name));
    
    return state;
  };
},

    /**
     * UI模式消息（用于特殊交互模式）
     * @param {String} message - 提示消息
     */
    uiModeMessage(message) {
      return (ctx, state) => {
        ctx.log(message);
        console.log('[uiModeMessage]', message);
        return state;
      };
    }


    // ── 后续会添加更多效果原子函数 ──
    // drawCards, returnToHand, etc.
  };

  // ──────────────────────────────────────────────────────────
  // 卡牌效果配置表
  // ──────────────────────────────────────────────────────────

  const CardEffectConfigs = {
    // ════════════════════════════════════════════════════════
    // 71-72: 誓言之剑（支援牌）
    // 效果：指定一张场上卡牌，atk+2。若目标是（军队/平民/骷髅），额外atk+1
    // ════════════════════════════════════════════════════════
    71: {
      name: '誓言之剑',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,  // 需要玩家选择目标
      targetFilter: {     // 目标必须是场上的卡牌
        location: 'battlefield',
        player: 'both'
      },
      effects: [
        {
          atom: 'conditionalModifyAtk',
          baseAmount: 2,
          bonusAmount: 1,
          condition: {
            race: ['军队', '平民', '骷髅']
          },
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    72: {
      name: '誓言之剑',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,
      targetFilter: {
        location: 'battlefield',
        player: 'both'
      },
      effects: [
        {
          atom: 'conditionalModifyAtk',
          baseAmount: 2,
          bonusAmount: 1,
          condition: {
            race: ['军队', '平民', '骷髅']
          },
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 73-74: 炼金术师的副产品（支援牌）
    // 效果：指定一张场上卡牌，hp+3。若目标是（法术），额外hp+1
    // ════════════════════════════════════════════════════════
    73: {
      name: '炼金术师的副产品',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,
      targetFilter: {
        location: 'battlefield',
        player: 'both'
      },
      effects: [
        {
          atom: 'conditionalModifyHp',
          baseAmount: 3,
          bonusAmount: 1,
          condition: {
            race: ['法术']
          },
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    74: {
      name: '炼金术师的副产品',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,
      targetFilter: {
        location: 'battlefield',
        player: 'both'
      },
      effects: [
        {
          atom: 'conditionalModifyHp',
          baseAmount: 3,
          bonusAmount: 1,
          condition: {
            race: ['法术']
          },
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 84: 恐惧之哨（支援牌）
    // 效果：选定敌方单体，atk-3
    // ════════════════════════════════════════════════════════
    84: {
      name: '恐惧之哨',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,
      targetFilter: {
        location: 'battlefield',
        player: 'opponent'  // 只能选敌方
      },
      effects: [
        {
          atom: 'modifyAtk',
          amount: -3,
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 85: 互助（支援牌）
    // 效果：我方全体hp+2，若为（平民/奇珍），额外hp+1
    // ════════════════════════════════════════════════════════
    85: {
      name: '互助',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'conditionalModifyHp',
          baseAmount: 2,
          bonusAmount: 1,
          condition: {
            race: ['平民', '奇珍']
          },
          filter: {
            location: 'battlefield',
            player: 'self'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 86: 战意（支援牌）
    // 效果：我方全体atk+2，若为（军队），额外atk+1
    // ════════════════════════════════════════════════════════
    86: {
      name: '战意',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'conditionalModifyAtk',
          baseAmount: 2,
          bonusAmount: 1,
          condition: {
            race: ['军队']
          },
          filter: {
            location: 'battlefield',
            player: 'self'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 97: 修城（支援牌）
    // 效果：所有建筑牌hp+4
    // ════════════════════════════════════════════════════════
    97: {
      name: '修城',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'modifyHp',
          amount: 4,
          filter: {
            location: 'battlefield',
            player: 'both',
            race: ['建筑']
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 13: 赐予生命（奇迹牌）
    // 效果：我方玩家hp+13
    // ════════════════════════════════════════════════════════
    13: {
      name: '赐予生命',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'playerHeal',
          amount: 13,
          filter: {
            player: 'self'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 14: 地狱之主（奇迹牌）
    // 效果：所有我方怪物hp+3，atk+3；敌方所有怪物hp-3，atk-3。
    //       若我方有恶魔，则额外hp+1，atk+1。此牌对敌方legendary不生效
    // ════════════════════════════════════════════════════════
    14: {
      name: '地狱之主',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'hellLordBonus'
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 12: 契约生效（奇迹牌）
    // 效果：与敌方玩家互换场上所有卡牌
    // ════════════════════════════════════════════════════════
    12: {
      name: '契约生效',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'swapBattlefields'
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 5: 受难日（奇迹牌）
    // 效果：除了卡牌（宗教），清除场上所有卡牌
    // ════════════════════════════════════════════════════════
    5: {
      name: '受难日',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'clearField',
          filter: {
            player: 'both',
            exceptRace: '宗教'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 1: 上帝（奇迹牌）- 完整版
    // 效果：移除所有负面效果，同时我方全体hp+3，玩家hp+3
    // ════════════════════════════════════════════════════════
    1: {
      name: '上帝',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'removeDebuffs',
          filter: {
            location: 'battlefield',
            player: 'self'
          }
        },
        {
          atom: 'modifyHp',
          amount: 3,
          filter: {
            location: 'battlefield',
            player: 'self'
          }
        },
        {
          atom: 'playerHeal',
          amount: 3,
          filter: {
            player: 'self'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 2: 极寒（奇迹牌）
    // 效果：敌方场上的全体冻结2回合
    // ════════════════════════════════════════════════════════
    2: {
      name: '极寒',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'freeze',
          turns: 2,
          filter: {
            location: 'battlefield',
            player: 'opponent'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 4: 上帝之指（奇迹牌）
    // 效果：对敌方血量最高目标造成atk10，后按照敌方血量排列，依次对敌方全体造成10-n
    // ════════════════════════════════════════════════════════
    4: {
      name: '上帝之指',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'cascadeDamage',
          baseDamage: 10
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 8: 处决（奇迹牌）
    // 效果：敌方玩家hp<=7时，立刻杀死
    // ════════════════════════════════════════════════════════
    8: {
      name: '处决',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'conditionalKillPlayer',
          condition: {
            playerHpThreshold: 7
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 9: 末日（奇迹牌）
    // 效果：清除战场，并立刻结束回合
    // ════════════════════════════════════════════════════════
    9: {
      name: '末日',
      type: 'miracle',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'clearField',
          filter: {
            player: 'both'
          }
        },
        {
          atom: 'skipTurn'
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 89: 神旨（支援牌）
    // 效果：立刻杀死一张牌
    // ════════════════════════════════════════════════════════
    89: {
      name: '神旨',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,
      targetFilter: {
        location: 'battlefield',
        player: 'both'
      },
      effects: [
        {
          atom: 'killCard',
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 92: 征税（支援牌）
    // 效果：本回合立刻获得1金币。若场上存在（贵族/罪犯），则获得2金币
    // ════════════════════════════════════════════════════════
    92: {
      name: '征税',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'gainCoins',
          amount: 1,
          condition: {
            race: ['贵族', '罪犯'],
            bonus: 2
          }
        }
      ]
    },

    // ════════════════════════════════════════════════════════
    // 战场牌效果（需要特殊触发时机）
    // ════════════════════════════════════════════════════════

    // 16: 狼人（战场牌）
    // 效果：若被攻击后未死，可再次行动
    // 触发时机：onAfterBattle
    16: {
      name: '狼人',
      type: 'battlefield',
      trigger: 'onAfterBattle',
      passive: true,
      effects: [
        {
          atom: 'checkSurvivalAndAct',
          condition: {
            mustSurvive: true
          }
        }
      ]
    },

    // 28: 空间法师（战场牌）
    // 效果：每阶段可重置位置
    // 触发时机：passive（UI功能，不是效果系统）
    28: {
  name: '空间法师',
  type: 'battlefield',
  trigger: 'passive',
  passive: true,
  hasActiveAbility: true,  // 标记有主动能力
  activeAbilityType: 'reposition',  // 主动能力类型
  activeAbilityUsesPerPhase: 1,  // 每阶段使用次数
  effects: []  // 被动效果为空（主动触发）
},

    // 29-30: 精灵（战场牌）
    // 效果：若场上有>=2的（森林）/（奇珍），atk+2
    // 触发时机：passive（持续检查）
    29: {
      name: '精灵',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countRace',
        races: ['森林', '奇珍'],
        threshold: 2,
        bonus: { atk: 2 }
      }
    },

    30: {
      name: '精灵',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countRace',
        races: ['森林', '奇珍'],
        threshold: 2,
        bonus: { atk: 2 }
      }
    },

    // 41: 高等精灵（战场牌）
    // 效果：每过1回合，hp+1，atk+2
    // 触发时机：onTurnStart
    41: {
      name: '高等精灵',
      type: 'battlefield',
      trigger: 'onTurnStart',
      passive: true,
      effects: [
        {
          atom: 'modifyHp',
          amount: 1,
          filter: {
            target: 'self'  // 指向自己
          }
        },
        {
          atom: 'modifyAtk',
          amount: 2,
          filter: {
            target: 'self'
          }
        }
      ]
    },

    // ══════════════════════════════════════════════════════════
    // 条件触发战场牌
    // ══════════════════════════════════════════════════════════

    // 32: 女巫 (epic)
    // 效果：敌方每有一人类，我方全体atk+1。我方每有一神圣，女巫atk+1
    32: {
      name: '女巫',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'multiBonus',  // 多重加成
        bonuses: [
          {
            type: 'countOpponentRace',
            races: ['人类'],
            bonus: { targetAll: true, atk: 1 }
          },
          {
            type: 'countSelfRace',
            races: ['神圣'],
            bonus: { targetSelf: true, atk: 1 }
          }
        ]
      }
    },

    // 35: 骷髅教主 (epic)
    // 效果：我方所有怪物atk+2；若敌方有神圣，我方所有骷髅hp+2
    // 注：简化实现 - 只实现怪物atk+2，神圣条件检查待完善
    35: {
      name: '骷髅教主',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'raceBonus',
        races: ['怪物'],
        bonus: { atk: 2 }
      }
    },

    // 36: 吸血鬼男爵 (rare)
    // 效果：我方每有一怪物，我方全体atk+1
    36: {
      name: '吸血鬼男爵',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countSelfRace',
        races: ['怪物'],
        bonus: { targetAll: true, atk: 1 }
      }
    },

    // 39: 怪物猎人 (rare)
    // 效果：敌方每有一怪物，atk+1。若战斗对象为怪物，atk额外+2
    39: {
      name: '怪物猎人',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countOpponentRace',
        races: ['怪物'],
        bonus: { atk: 1 }
      }
    },

    // 40: 怪物猎人 (rare)
    // 效果：敌方每有一怪物，atk+1。若战斗对象为怪物，atk额外+2
    40: {
      name: '怪物猎人',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countOpponentRace',
        races: ['怪物'],
        bonus: { atk: 1 }
      }
    },

    // 42: 骑士 (legendary)
    // 效果：我方每有一张人类，全体hp+1；我方每有一张军队，全体atk+1
    42: {
      name: '骑士',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'multiBonus',
        bonuses: [
          {
            type: 'countSelfRace',
            races: ['人类'],
            bonus: { targetAll: true, hp: 1 }
          },
          {
            type: 'countSelfRace',
            races: ['军队'],
            bonus: { targetAll: true, atk: 1 }
          }
        ]
      }
    },

    // 43: 祭司 (epic)
    // 效果：所有宗教的hp+2
    43: {
      name: '祭司',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'raceBonus',
        races: ['宗教'],
        bonus: { hp: 2 }
      }
    },

    // 45: 刺客 (rare)
    // 效果：首次攻击atk*2
    45: {
      name: '刺客',
      type: 'battlefield',
      trigger: 'passive',  
      passive: true,
      effects: []  // 标记，在战斗逻辑中处理
    },

    // 46: 吸血鬼 (common)
    // 效果：对人类的atk+2
    46: {
      name: '吸血鬼',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'vsRaceBonus',
        races: ['人类'],
        bonus: { atk: 2 }
      }
    },

    // 49: 公主 (epic)
    // 效果：敌方每次hp+，我方全体atk+1；敌方每次atk+，我方全体hp+1
    // 注：这个需要监听事件，暂时标记为反应式加成（未完全实现）
    49: {
      name: '公主',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'reactiveBonus'  // 反应式加成（需要特殊实现）
      }
    },

    // 50: 屠龙勇士 (epic)
    // 效果：对龙的atk*2；如果被秒杀，血量强制维持在1，只有一次
    50: {
      name: '屠龙勇士',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'vsRaceBonus',
        races: ['龙'],
        bonus: { atkMultiplier: 2 }
      }
    },

    // 55: 公爵 (epic)
    // 效果：每有一贵族，自身atk+2。场上所有平民hp-1
    55: {
      name: '公爵',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'multiBonus',
        bonuses: [
          {
            type: 'countAllRace',
            races: ['贵族'],
            bonus: { targetSelf: true, atk: 2 }
          },
          {
            type: 'raceBonus',
            races: ['平民'],
            bonus: { hp: -1 }
          }
        ]
      }
    },

    // 60: 路西法 (legendary)
    // 效果：对（神圣）的atk*2，对（怪物）的atk+2
    60: {
      name: '路西法',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'multiBonus',
        bonuses: [
          {
            type: 'vsRaceBonus',
            races: ['神圣'],
            bonus: { atkMultiplier: 2 }
          },
          {
            type: 'vsRaceBonus',
            races: ['怪物'],
            bonus: { atk: 2 }
          }
        ]
      }
    },

    // 61: 女伯爵 (rare)
    // 效果：每次攻击后，hp+1
    61: {
      name: '女伯爵',
      type: 'battlefield',
      trigger: 'onAfterAttack',
      passive: true,
      effects: [
        {
          atom: 'modifyHp',
          amount: 1,
          filter: { target: 'self' }
        }
      ]
    },

    // 66: 驱魔师 (rare)
    // 效果：对（恶魔）的atk+6
    66: {
      name: '驱魔师',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'vsRaceBonus',
        races: ['恶魔'],
        bonus: { atk: 6 }
      }
    },

    // 67: 将军 (rare)
    // 效果：我方每有一人类，全体atk+1
    67: {
      name: '将军',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countSelfRace',
        races: ['人类'],
        bonus: { targetAll: true, atk: 1 }
      }
    },

    // 69: 渎神者 (rare)
    // 效果：敌方每一怪物/神圣，atk+2
    69: {
      name: '渎神者',
      type: 'battlefield',
      trigger: 'passive',
      passive: true,
      condition: {
        type: 'countOpponentRace',
        races: ['怪物', '神圣'],
        bonus: { atk: 2 }
      }
    },

    // 63: 冰精灵 (common)
    // 效果：首次攻击，冰冻敌方一回合
    63: {
      name: '冰精灵',
      type: 'battlefield',
      trigger: 'onAfterAttack',
      passive: true,
      effects: [
        {
          atom: 'freezeOnFirstAttack',
          turns: 1
        }
      ]
    },

    // 77: 空间法术（支援牌）
    // 效果：进入重排模式，允许玩家重新排列己方场上卡牌位置
    // 状态：需要特殊UI实现

    77: {
      name: '空间法术',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      requiresUIMode: 'reposition',  // 特殊UI模式
      effects: [
        {
          atom: 'uiModeMessage',
          message: '进入重排模式：点击选择要移动的卡牌，然后选择目标位置'
        }
      ]
    },

    // 79: 死亡召唤（支援牌）
    // 效果：从弃牌堆抽取两张牌
    79: {
      name: '死亡召唤',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'drawFromDiscard',
          amount: 2
        }
      ]
    },

   80: {
  name: '愚戏',
  type: 'support',
  trigger: 'onPlay',
  needsTarget: false,
  effects: [
    {
      atom: 'swapRandomHands',
      amount: 3
    }
  ]
},

    // 87: 替名（支援牌）
    // 效果：选择一张我方与敌方于场上的卡牌互换
    87: {
      name: '替名',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      requiresUIMode: 'swapBattlefield',  // 特殊UI模式
      effects: [
        {
          atom: 'uiModeMessage',
          message: '进入交换模式：点击己方卡牌，然后点击敌方卡牌进行交换'
        }
      ]
    },

    // 88: 祝福（支援牌）
    // 效果：指定一张牌，免疫一次所有效果负面，包括被攻击
    88: {
      name: '祝福',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: true,
      targetFilter: {
        player: 'both',
        location: 'battlefield'
      },
      effects: [
        {
          atom: 'addImmunity',
          filter: {
            target: 'selected'
          }
        }
      ]
    },

    // 90: 召唤法阵（支援牌）
    // 效果：抽2张牌。若我方场上此时有（法术），额外抽一张
    90: {
      name: '召唤法阵',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'drawCards',
          baseAmount: 2,
          bonusAmount: 1,
          condition: {
            type: 'hasRaceOnField',
            races: ['法术'],
            player: 'self'
          }
        }
      ]
    },

    // 91: 重生（支援牌）
    // 效果：丢弃所有手牌，重新抽取相同数量的牌
    91: {
      name: '重生',
      type: 'support',
      trigger: 'onPlay',
      needsTarget: false,
      effects: [
        {
          atom: 'discardAndRedraw'
        }
      ]
    }

    // ── 后续添加其余卡牌配置 ──
  };

  // ──────────────────────────────────────────────────────────
  // 效果引擎（核心调度器）
  // ──────────────────────────────────────────────────────────

  const EffectEngine = {
    /**
     * 触发卡牌效果
     * @param {Number} cardId - 卡牌 ID
     * @param {Object} context - 上下文对象
     *   - player: 'red' | 'blue'  当前玩家
     *   - card: Card对象  使用的卡牌
     *   - target: Card对象 | null  选中的目标（如果需要）
     *   - logCallback: Function  日志回调
     * @param {Object} gameState - 当前游戏状态
     * @returns {Object} 新的游戏状态
     */
    trigger(cardId, context, gameState) {
      const config = CardEffectConfigs[cardId];
      if (!config) {
        // 没有配置效果的卡牌（如纯战场牌），直接返回
        return gameState;
      }

      // 构建效果上下文
      const ctx = {
        player: context.player,
        opponent: context.player === 'red' ? 'blue' : 'red',
        card: context.card,
        target: context.target || null,
        log: context.logCallback || (() => {})
      };

      // 深拷贝状态（避免直接修改原状态）
      let state = JSON.parse(JSON.stringify(gameState));

      // 重要：如果有 target，需要在深拷贝后的 state 中找到对应的卡牌
      // 因为深拷贝后，原来的 target 引用已经失效
      let newTarget = null;
      if (ctx.target) {
        const targetId = ctx.target.instanceId;
        console.log('[EffectEngine] 原target:', ctx.target.name, 'instanceId:', targetId);
        
        // 在深拷贝的状态中查找同一张卡
        ['red', 'blue'].forEach(player => {
          state[player].battlefield.forEach((card, idx) => {
            if (card && card.instanceId === targetId) {
              newTarget = card;
              console.log('[EffectEngine] 找到新target:', card.name, '在', player, '路线', idx);
            }
          });
        });
        
        if (!newTarget) {
          console.error('[EffectEngine] 错误：在新状态中找不到target!');
          ctx.log(`错误：目标卡牌丢失`);
          return gameState;
        }
        
        // 更新 ctx.target 为新的引用
        ctx.target = newTarget;
      }

      // 如果需要目标但没有提供，记录错误
      if (config.needsTarget && !ctx.target) {
        ctx.log(`错误：${config.name} 需要选择目标！`);
        return gameState;  // 返回原状态，效果未生效
      }

      // 依次执行配置的效果链
      config.effects.forEach(effectConfig => {
        const atomName = effectConfig.atom;
        const atomFunc = EffectAtoms[atomName];

        if (!atomFunc) {
          console.error(`未找到效果原子函数: ${atomName}`);
          ctx.log(`错误：未实现的效果 ${atomName}`);
          return;
        }

        // 调用效果原子函数，传入参数（注意参数顺序！）
        let executor;
        
        if (atomName === 'conditionalModifyAtk' || atomName === 'conditionalModifyHp') {
          // conditionalModify 系列: (baseAmount, bonusAmount, condition, filter)
          executor = atomFunc(
            effectConfig.baseAmount,
            effectConfig.bonusAmount,
            effectConfig.condition,
            effectConfig.filter
          );
        } else if (atomName === 'modifyAtk' || atomName === 'modifyHp') {
          // 普通 modify 系列: (amount, filter, condition)
          executor = atomFunc(
            effectConfig.amount || effectConfig.baseAmount,
            effectConfig.filter,
            effectConfig.condition
          );
        } else if (atomName === 'playerHeal' || atomName === 'playerDamage') {
          // 玩家治疗/伤害系列: (amount, filter)
          executor = atomFunc(
            effectConfig.amount,
            effectConfig.filter
          );
        } else if (atomName === 'killCard' || atomName === 'removeDebuffs') {
          // 杀死卡牌/移除负面: (filter)
          executor = atomFunc(
            effectConfig.filter
          );
        } else if (atomName === 'clearField') {
          // 清空战场: (filter)
          executor = atomFunc(
            effectConfig.filter
          );
        } else if (atomName === 'freeze') {
          // 冻结: (turns, filter)
          executor = atomFunc(
            effectConfig.turns,
            effectConfig.filter
          );
        } else if (atomName === 'gainCoins') {
          // 获得金币: (amount, condition)
          executor = atomFunc(
            effectConfig.amount,
            effectConfig.condition
          );
        } else if (atomName === 'conditionalKillPlayer') {
          // 条件击杀玩家: (condition)
          executor = atomFunc(
            effectConfig.condition
          );
        } else if (atomName === 'cascadeDamage') {
          // 级联伤害: (baseDamage)
          executor = atomFunc(
            effectConfig.baseDamage
          );
        } else {
          // 其他效果：根据实际签名调整
          executor = atomFunc(
            effectConfig.amount || effectConfig.baseAmount,
            effectConfig.filter,
            effectConfig.condition
          );
        }

        // 检查是否需要特殊UI模式
    if (config.requiresUIMode) {
      // 交由UI层处理，这里只记录日志
      ctx.log(`${config.name} 需要特殊交互模式: ${config.requiresUIMode}`);
      console.log('[EffectEngine] 触发UI模式:', config.requiresUIMode);
      
      // 对于UI模式，不执行effects，由UI层接管
      return gameState;  // 返回原状态，不消耗卡牌（由UI完成后再消耗）
    }

        // 执行效果
        state = executor(ctx, state);
      });

      return state;
    },

    /**
     * 检查卡牌是否需要选择目标
     * @param {Number} cardId - 卡牌 ID
     * @returns {Boolean}
     */
    needsTarget(cardId) {
      const config = CardEffectConfigs[cardId];
      return config?.needsTarget || false;
    },

    /**
     * 获取目标过滤器（用于 UI 高亮可选目标）
     * @param {Number} cardId - 卡牌 ID
     * @returns {Object|null}
     */
    getTargetFilter(cardId) {
      const config = CardEffectConfigs[cardId];
      return config?.targetFilter || null;
    },

    /**
     * 检查目标是否有效
     * @param {Number} cardId - 卡牌 ID
     * @param {Object} target - 目标卡牌
     * @param {Object} gameState - 游戏状态
     * @returns {Boolean}
     */
    isValidTarget(cardId, target, gameState) {
      const config = CardEffectConfigs[cardId];
      if (!config || !config.needsTarget) return true;

      const filter = config.targetFilter;
      if (!filter) return true;

      // 简单验证：检查目标是否在战场上
      if (filter.location === 'battlefield') {
        const onRedField = gameState.red.battlefield.some(c => c && c.instanceId === target.instanceId);
        const onBlueField = gameState.blue.battlefield.some(c => c && c.instanceId === target.instanceId);
        
        if (filter.player === 'both') return onRedField || onBlueField;
        if (filter.player === 'self') {
          // 需要从 context 知道当前玩家，这里简化处理
          return onRedField || onBlueField;
        }
      }

      return true;
    },

    /**
     * 获取卡牌效果描述（用于 UI 显示）
     * @param {Number} cardId - 卡牌 ID
     * @returns {String}
     */
    getDescription(cardId) {
      const config = CardEffectConfigs[cardId];
      if (!config) return '';

      // 可以从 CSV 的 effect 字段读取，或从配置生成
      return config.description || '';
    },

    /**
     * 获取所有已配置效果的卡牌 ID 列表
     * @returns {Array<Number>}
     */
    getConfiguredCards() {
      return Object.keys(CardEffectConfigs).map(Number);
    }
  };

  // ──────────────────────────────────────────────────────────
  // 导出到全局
  // ──────────────────────────────────────────────────────────
  window.EffectEngine = EffectEngine;
  window.CardEffectConfigs = CardEffectConfigs;
  window.EffectAtoms = EffectAtoms;

  // 开发模式：打印已配置的卡牌
  console.log('[CardEffects] 已加载效果系统');
  console.log('[CardEffects] 已配置卡牌:', EffectEngine.getConfiguredCards());

})();
