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
          ctx.log(`处决！敌方玩家血量<=7，立即击杀！`);
          console.log('[conditionalKillPlayer] 处决成功');
        } else {
          ctx.log(`处决失败：敌方血量${opponentHp} > 7`);
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
        }
        // 立刻结束回合的逻辑需要在游戏主逻辑中处理
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
      canReposition: true  // 标记：允许重新定位
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