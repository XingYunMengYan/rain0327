// ============================================================
// gameUI.js — 游戏界面组件（纯渲染，无游戏逻辑）
// 含 JSX，由页面入口通过 GameUILoader 动态 fetch + Babel.transform 后执行
// 依赖：window.React, window.Icons, window.SoundManager, window.getCardImagePath
// 输出：window.GameUI  (React 组件)
// ============================================================

(function () {
  const { useState, useRef, useEffect } = React;

  const Icons = window.Icons;
  const SM    = window.SoundManager;

  // ── 稀有度→样式映射 ──
  const RARITY_CLASS = {
    common:    'from-gray-100 to-gray-200 border-gray-400',
    rare:      'from-blue-100 to-blue-200 border-blue-400',
    epic:      'from-purple-100 to-purple-200 border-purple-400',
    legendary: 'from-yellow-100 to-orange-200 border-yellow-500',
  };
  const getRarityClass = (r) => RARITY_CLASS[r] || 'from-amber-50 to-orange-100 border-gray-300';

  // ── 单张卡牌组件 ──
  const Card = ({ card, onClick, isSelected, showPick, faceDown }) => {
    const cardRef    = useRef(null);
    const tooltipRef = useRef(null);
    const [tipStyle, setTipStyle] = useState({ visibility: 'hidden', opacity: 0 });

    if (faceDown) {
      return (
        <div onClick={onClick}
          className="w-[110px] h-[180px] rounded-lg border-2 border-gray-600 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center cursor-pointer">
          <span className="text-4xl">🂠</span>
        </div>
      );
    }

    const isMiracle   = card.type === 'miracle';
    const rarityClass = getRarityClass(card.rarity);

    const updateTip = () => {
      if (!cardRef.current || !tooltipRef.current) return;
      const cr = cardRef.current.getBoundingClientRect();
      const tr = tooltipRef.current.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let top  = cr.top - tr.height - 10;
      let left = cr.left + cr.width / 2 - tr.width / 2;
      if (top < 10)                  top  = cr.bottom + 10;
      if (top + tr.height > vh - 10) top  = Math.max(10, cr.top - tr.height - 10);
      if (left < 10)                 left = 10;
      if (left + tr.width > vw - 10) left = vw - tr.width - 10;
      setTipStyle({ position:'fixed', zIndex:9999, visibility:'visible', opacity:1, top:top+'px', left:left+'px' });
    };

    return (
      <div ref={cardRef} onClick={onClick}
        onMouseEnter={() => card.effect && requestAnimationFrame(updateTip)}
        onMouseLeave={() => setTipStyle({ visibility:'hidden', opacity:0 })}
        className={`relative p-2 rounded-lg border-2 cursor-pointer transition-all
          ${isSelected ? 'border-yellow-400 shadow-lg scale-105' : ''}
          bg-gradient-to-br ${rarityClass} w-[110px] h-[180px] text-xs flex flex-col`}
        style={{ overflow:'visible' }}>
        <div className="absolute inset-0 p-2 rounded-lg overflow-hidden flex flex-col">
          {isMiracle && <div className="absolute top-1 right-1 z-10"><Icons.Sparkles size={14} className="text-purple-600" /></div>}
          {card.rarity && (
            <div className="absolute top-1 left-1 text-xs font-bold z-10">
              {card.rarity === 'legendary' && '★'}{card.rarity === 'epic' && '◆'}{card.rarity === 'rare' && '●'}
            </div>
          )}
          <div className="font-bold text-center mb-1 text-gray-800 text-xs truncate">{card.name}</div>
          {card.id && (
            <div className="w-full h-16 mb-1 rounded overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
              <img src={window.getCardImagePath(card.id)} alt={card.name} onError={e => e.target.style.display='none'} className="w-full h-full object-cover" />
            </div>
          )}
          {(card.stRace || card.ndRace) && (
            <div className="text-center text-xs text-gray-600 mb-1 truncate">{[card.stRace, card.ndRace].filter(Boolean).join('/')}</div>
          )}
          <div className="flex justify-around items-center text-xs mb-1">
            <div className="flex items-center gap-1"><Icons.Coins size={12} className="text-yellow-600" /><span className="font-bold">{isMiracle ? 0 : card.cost}</span></div>
            {card.type === 'battlefield' && (<>
              <div className="flex items-center gap-1"><Icons.Sword size={12} className="text-red-600" /><span className="font-bold">{card.atk}</span></div>
              <div className="flex items-center gap-1"><Icons.Heart size={12} className="text-green-600" /><span className="font-bold">{card.hp}/{card.maxHp}</span></div>
            </>)}
          </div>
          {showPick && <div className="mt-auto text-center"><span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">选择</span></div>}
        </div>
        {card.effect && (
          <div ref={tooltipRef} style={{...tipStyle, transition:'opacity 0.15s ease-in-out'}}
            className="p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl w-64 border-2 border-yellow-400 pointer-events-none">
            <div className="font-bold text-yellow-300 mb-1">{card.name}</div>
            <div className="whitespace-pre-wrap leading-relaxed">{card.effect}</div>
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  // CardShowOverlay — 支援/奇迹施展时屏幕正中放大展示
  // props: card (Card|null)
  // ══════════════════════════════════════════════════════════
  const CardShowOverlay = ({ card }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      if (card) {
        // 推迟一帧开启 visible，让 CSS transition 能捕捉到从 0→1 的变化
        const id = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(id);
      } else {
        setVisible(false);
      }
    }, [card]);

    if (!card) return null;

    const isMiracle = card.type === 'miracle';
    const glowCol   = isMiracle ? '#a855f7' : '#3b82f6';
    const bgGrad    = isMiracle ? 'from-purple-900 via-purple-800 to-purple-900' : 'from-blue-900 via-blue-800 to-blue-900';
    const borderC   = isMiracle ? 'border-purple-400' : 'border-blue-400';
    const titleC    = isMiracle ? 'text-purple-200'   : 'text-blue-200';
    const label     = isMiracle ? '✦ 奇迹牌施展 ✦'   : '— 支援牌使用 —';

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        style={{ background: visible ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0)', transition:'background 0.25s ease' }}>
        <div className={`rounded-2xl border-2 ${borderC} bg-gradient-to-br ${bgGrad} p-6 flex flex-col items-center shadow-2xl`}
          style={{
            transform:  visible ? 'scale(1)'  : 'scale(0.7)',
            opacity:    visible ?  1           :  0,
            transition: 'transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease',
            boxShadow:  visible ? `0 0 40px 8px ${glowCol}66` : 'none'
          }}>
          <div className={`${titleC} text-sm font-bold mb-3 tracking-widest`}>{label}</div>
          {/* 放大卡牌 — scale 1.5x, 需要额外 margin 补偿 */}
          <div style={{ transform:'scale(1.5)', transformOrigin:'top center', marginBottom:'100px' }}>
            <Card card={card} />
          </div>
          {card.effect && (
            <div className="mt-2 max-w-xs text-center text-white text-sm bg-black bg-opacity-40 rounded-lg px-4 py-2">
              {card.effect}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  // GameUI — 主界面组件
  // ══════════════════════════════════════════════════════════
  // props:
  //   gameState, gamePhase, allCards, winner, battleAnimation
  //   cardShowOverlay : Card | null          ← 支援/奇迹展示
  //   extraUI         : ReactNode | null     ← 父层额外UI（轮盘等）
  //   hideOpponentHand : bool (default false)
  //   myRole           : 'red'|'blue'|null   (default null)
  //   所有 on* callbacks（同上次版本）

  window.GameUI = function GameUI(props) {
    const {
      gameState, gamePhase, allCards, winner, battleAnimation,
      cardShowOverlay = null,
      extraUI = null,
      onStartPicking, onPickCard, onStartTurn,
      onSelectCard, onPlayCard, onUseCardOnTarget, onConfirmUse, onEndPhase,
      onReset,
      hideOpponentHand = false,
      myRole = null
    } = props;

    const [showAllCards, setShowAllCards] = useState(false);
    const [isMuted,     setIsMuted]      = useState(SM.isMuted);
    const [bgmEnabled,  setBgmEnabled]   = useState(SM.bgmEnabled);

    const isHandVisible = (player) => {
      if (!hideOpponentHand) return true;
      return player === myRole;
    };

    // ── 路线 ──
    const Lane = ({ laneIndex, player }) => {
      const card        = gameState[player].battlefield[laneIndex];
      const sel         = gameState.selectedCard;
      const canDeploy   = sel && sel.type === 'battlefield' && !card &&
                          ((gameState.phase === 'redDeploy'  && player === 'red') ||
                           (gameState.phase === 'blueDeploy' && player === 'blue'));
      const canTarget   = sel && (sel.type === 'support' || sel.type === 'miracle') && card;
      const isAnimating = battleAnimation.active && battleAnimation.lane === laneIndex;

      return (
        <div onClick={() => { if (canDeploy) onPlayCard(laneIndex); else if (canTarget) onUseCardOnTarget(player, laneIndex); }}
          className={`border-2 border-dashed rounded-lg p-2 min-h-[110px] flex items-center justify-center transition-all
            ${isAnimating  ? 'animate-pulse bg-yellow-200 border-yellow-500' : ''}
            ${canDeploy    ? 'border-green-400 bg-green-50 cursor-pointer hover:bg-green-100' : ''}
            ${canTarget    ? 'border-yellow-400 bg-yellow-50 cursor-pointer hover:bg-yellow-100' : ''}
            ${!canDeploy && !canTarget ? (player === 'blue' ? 'border-gray-300 bg-blue-50' : 'border-gray-300 bg-red-50') : ''}`}>
          {card ? <Card card={card} /> : <div className="text-gray-400 text-xs">路线 {laneIndex + 1}</div>}
        </div>
      );
    };

    // ── 手牌区 ──
    const HandArea = ({ player, labelColor }) => {
      const hand    = gameState[player].hand;
      const visible = isHandVisible(player);
      return (
        <div className="mb-2">
          <div className={`${labelColor} text-xs mb-1`}>手牌 ({hand.length}):</div>
          <div className="flex gap-2 flex-wrap">
            {hand.map(card =>
              visible
                ? <div key={card.instanceId}><Card card={card} onClick={() => { SM.playSound('click'); onSelectCard(card, player); }} isSelected={gameState.selectedCard?.instanceId === card.instanceId} /></div>
                : <div key={card.instanceId}><Card card={card} faceDown onClick={() => {}} /></div>
            )}
          </div>
        </div>
      );
    };

    // ── 玩家区 ──
    const PlayerArea = ({ player, position }) => {
      const isTop   = position === 'top';
      const borderC = player === 'blue' ? 'border-blue-500' : 'border-red-500';
      const bgC     = player === 'blue' ? 'bg-blue-900/30'  : 'bg-red-900/30';
      const labelC  = player === 'blue' ? 'text-blue-300'   : 'text-red-300';
      const handLC  = player === 'blue' ? 'text-blue-200'   : 'text-red-200';

      const status = (
        <div className="flex justify-between items-center">
          <div className={`${labelC} text-lg font-bold`}>{player === 'blue' ? '蓝方' : '红方'}</div>
          <div className="flex gap-3 text-white">
            <div className="flex items-center gap-1"><Icons.Heart className="text-red-400" size={20} /><span className="text-lg font-bold">{gameState[player].health}</span></div>
            <div className="flex items-center gap-1"><Icons.Coins className="text-yellow-400" size={20} /><span className="text-lg font-bold">{gameState[player].coins}</span></div>
          </div>
        </div>
      );
      const lanes = (
        <div className="grid grid-cols-4 gap-2">
          {[0,1,2,3].map(i => <div key={i}><Lane laneIndex={i} player={player} /></div>)}
        </div>
      );

      return (
        <div className={`mb-3 p-3 ${bgC} rounded-xl border-2 ${borderC}`}>
          {isTop  && status}
          {isTop  && <div className="mt-2 mb-2"><HandArea player={player} labelColor={handLC} /></div>}
          {isTop  && lanes}
          {!isTop && lanes}
          {!isTop && <div className="mt-2"><HandArea player={player} labelColor={handLC} /></div>}
          {!isTop && status}
        </div>
      );
    };

    const PHASE_TEXT  = { idle:'等待开始', redDeploy:'红方部署阶段', blueDeploy:'蓝方部署阶段', redSupport:'红方支援阶段', battle:'战斗中...' };
    const isGameOver  = gameState.red.health <= 0 || gameState.blue.health <= 0 ||
                        (gameState.deck.length === 0 && gameState.red.hand.length === 0 && gameState.blue.hand.length === 0);
    const canConfirmUse = gameState.selectedCard && (gameState.selectedCard.type === 'support' || gameState.selectedCard.type === 'miracle');

    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-4 overflow-auto">
        <div className="max-w-7xl mx-auto">

          {/* ── 支援/奇迹 展示层 ── */}
          <CardShowOverlay card={cardShowOverlay} />

          {/* ── 父层额外UI（轮盘等） ── */}
          {extraUI}

          {/* ── 胜利层 ── */}
          {winner && (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl p-12 text-center shadow-2xl transform scale-110">
                <h1 className="text-6xl font-bold text-white mb-6 animate-pulse">{winner === '平局' ? '🤝 平局！' : `🎉 ${winner}获胜！`}</h1>
                <div className="text-2xl text-white mb-8">红方血量: {gameState.red.health} &nbsp;|&nbsp; 蓝方血量: {gameState.blue.health}</div>
                <div className="flex gap-4 justify-center">
                  <button onClick={onReset} className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-xl shadow-lg">重新开始</button>
                  <button onClick={() => { SM.playSound('click'); window.dispatchEvent(new Event('gameui:review')); }} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xl shadow-lg">复盘</button>
                  <button onClick={() => { SM.playSound('click'); window.location.href = 'index.html'; }} className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xl shadow-lg">返回主界面</button>
                </div>
              </div>
            </div>
          )}

          {/* ── 顶栏 ── */}
          <div className="text-center mb-3 relative">
            <div className="absolute right-0 top-0 flex gap-2">
              <button onClick={() => { window.location.href = 'index.html'; }} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-sm">主界面</button>
              <button onClick={() => { SM.toggleMute(); setIsMuted(SM.isMuted); }} className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-sm">
                {SM.isMuted ? <Icons.VolumeX size={16} /> : <Icons.Volume2 size={16} />}
              </button>
              <button onClick={() => { SM.toggleBGM(); setBgmEnabled(SM.bgmEnabled); }}
                className={`px-3 py-2 ${SM.bgmEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white rounded-lg font-bold text-sm`}>BGM</button>
              <button onClick={() => { SM.playSound('click'); onReset(); }} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-1 text-sm">
                <Icons.RefreshCw size={16} /> 重新开始
              </button>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">四路线卡牌对战</h1>
            <div className="text-yellow-300 text-base mb-1">回合: {gameState.turn} &nbsp;|&nbsp; 阶段: {PHASE_TEXT[gameState.phase] || '—'}</div>
            <div className="flex justify-center gap-2">
              <button onClick={() => { SM.playSound('click'); setShowAllCards(true); }} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1 text-sm">
                <Icons.Eye size={16} /> 查看所有卡牌
              </button>
              <span className="text-gray-300 text-sm self-center">已加载 {allCards.length} 张卡牌</span>
            </div>
          </div>

          {/* ── 查看卡牌弹窗 ── */}
          {showAllCards && (
            <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={() => setShowAllCards(false)}>
              <div className="bg-white rounded-xl p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4">所有卡牌列表</h2>
                <div className="grid grid-cols-4 gap-3">{allCards.map(card => <div key={card.id}><Card card={window.createCard(card)} /></div>)}</div>
                <button onClick={() => setShowAllCards(false)} className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold w-full">关闭</button>
              </div>
            </div>
          )}

          {/* ── 选牌阶段弹窗 ── */}
          {(gamePhase === 'redPicking' || gamePhase === 'bluePicking') && (
            <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" 
                 onClick={(e) => e.target === e.currentTarget && null /* 防止点击背景关闭 */}>
              <div className="bg-gradient-to-br from-yellow-900 to-orange-900 rounded-xl p-8 max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-4 border-yellow-500"
                   onClick={e => e.stopPropagation()}>
                <h2 className="text-3xl font-bold text-yellow-300 mb-2 text-center animate-pulse">
                  {gamePhase === 'redPicking' ? '🔴 红方选牌' : '🔵 蓝方选牌'}
                </h2>
                <p className="text-xl text-yellow-200 mb-6 text-center">
                  请从以下6张牌中选择2张加入手牌
                </p>
                <div className="grid grid-cols-3 gap-4 justify-items-center mb-4">
                  {gameState.initialCards.map(card => (
                    <div key={card.instanceId}>
                      <Card card={card} 
                            onClick={() => { SM.playSound('click'); onPickCard(card); }} 
                            showPick />
                    </div>
                  ))}
                </div>
                <div className="text-center text-yellow-200 text-sm mt-4">
                  选择完成后窗口将自动关闭
                </div>
              </div>
            </div>
          )}

          {/* ── 蓝方（上） / 红方（下） ── */}
          <PlayerArea player="blue" position="top" />
          <PlayerArea player="red"  position="bottom" />

          {/* ── 控制按钮 ── */}
          <div className="flex justify-center gap-3 mb-3">
            {gamePhase === 'notStarted' && (
              <button onClick={() => { SM.playSound('click'); onStartPicking(); }} className="px-5 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-bold text-base">开始选牌</button>
            )}
            {gamePhase === 'playing' && gameState.phase === 'idle' && !isGameOver && (
              <button onClick={() => { SM.playSound('click'); onStartTurn(); }} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-base">下一回合</button>
            )}
            {gamePhase === 'playing' && gameState.phase !== 'idle' && gameState.phase !== 'battle' && (
              <>
                <button onClick={() => { SM.playSound('click'); onEndPhase(); }} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-base">结束阶段</button>
                {canConfirmUse && (
                  <button onClick={() => { SM.playSound('place'); onConfirmUse(); }} className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold text-base animate-pulse">确认使用</button>
                )}
              </>
            )}
          </div>

          {/* ── 底部信息 ── */}
          <div className="grid grid-cols-3 gap-3 mb-3 text-white text-xs">
            <div className="bg-gray-700/50 p-2 rounded"><div className="font-bold mb-1">共享牌库</div><div className="text-xl">{gameState.deck.length}</div></div>
            <div className="bg-purple-700/50 p-2 rounded"><div className="font-bold mb-1">奇迹牌库</div><div className="text-xl">{gameState.miracleDeck?.length || 0}</div></div>
            <div className="bg-red-700/50 p-2 rounded"><div className="font-bold mb-1">弃牌堆</div><div className="text-xl">{gameState.discardPile.length}</div></div>
          </div>

          {/* ── 日志 ── */}
          <div className="bg-gray-800/50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <div className="text-gray-300 text-xs font-mono">
              {gameState.log.map((msg, i) => <div key={i} className="mb-1">{msg}</div>)}
            </div>
          </div>

        </div>
      </div>
    );
  };
})();