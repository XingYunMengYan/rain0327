// ============================================================
// gameUI.js — 游戏界面组件（移动端适配版）
// 含 JSX，由页面入口通过 GameUILoader 动态 fetch + Babel.transform 后执行
// 依赖：window.React, window.Icons, window.SoundManager, window.getCardImagePath
// 输出：window.GameUI  (React 组件)
// ============================================================

(function () {
  const { useState, useRef, useEffect, useCallback } = React;

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

  // ── 自定义 Hook：处理长按（用于移动端查看详情） ──
  const useLongPress = (callback, ms = 500) => {
    const [startLongPress, setStartLongPress] = useState(false);
    
    useEffect(() => {
      let timerId;
      if (startLongPress) {
        timerId = setTimeout(callback, ms);
      } else {
        clearTimeout(timerId);
      }
      return () => clearTimeout(timerId);
    }, [startLongPress, callback, ms]);

    return {
      onMouseDown: () => setStartLongPress(true),
      onMouseUp: () => setStartLongPress(false),
      onMouseLeave: () => setStartLongPress(false),
      onTouchStart: () => setStartLongPress(true),
      onTouchEnd: () => setStartLongPress(false),
    };
  };

  // ── 单张卡牌组件 ──
  const Card = ({ card, onClick, isSelected, showPick, faceDown }) => {
    const cardRef    = useRef(null);
    const tooltipRef = useRef(null);
    // desktopTip: 电脑端悬浮样式; mobileModal: 手机端长按后的模态框状态
    const [desktopTipStyle, setDesktopTipStyle] = useState({ visibility: 'hidden', opacity: 0 });
    const [showMobileModal, setShowMobileModal] = useState(false);

    // 移动端/桌面端卡牌尺寸定义 (mobile: w-[84px] h-[128px] / desktop: w-[110px] h-[180px])
    const cardSizeClass = "w-[84px] h-[128px] md:w-[110px] md:h-[180px]";

    // 长按触发
    const longPressProps = useLongPress(() => {
      if (card && card.effect && !faceDown) {
        setShowMobileModal(true);
        SM.playSound('click'); // 提示音
      }
    });

    if (faceDown) {
      return (
        <div onClick={onClick}
          className={`${cardSizeClass} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center cursor-pointer flex-shrink-0`}>
          <span className="text-2xl md:text-4xl">🂠</span>
        </div>
      );
    }

    const isMiracle   = card.type === 'miracle';
    const rarityClass = getRarityClass(card.rarity);

    // 电脑端：鼠标悬停计算位置
    const updateDesktopTip = () => {
      if (window.innerWidth < 768) return; // 移动端不执行悬浮逻辑
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
      setDesktopTipStyle({ position:'fixed', zIndex:9999, visibility:'visible', opacity:1, top:top+'px', left:left+'px' });
    };

    return (
      <>
        {/* 卡牌本体 */}
        <div ref={cardRef} 
          {...longPressProps} // 绑定长按事件
          onClick={onClick}
          onMouseEnter={() => card.effect && requestAnimationFrame(updateDesktopTip)}
          onMouseLeave={() => setDesktopTipStyle({ visibility:'hidden', opacity:0 })}
          className={`relative p-1 md:p-2 rounded-lg border-2 cursor-pointer transition-all flex-shrink-0
            ${isSelected ? 'border-yellow-400 shadow-lg scale-105' : ''}
            bg-gradient-to-br ${rarityClass} ${cardSizeClass} flex flex-col`}
          style={{ overflow:'visible', userSelect:'none', WebkitUserSelect:'none' }}>
          
          <div className="absolute inset-0 p-1 md:p-2 rounded-lg overflow-hidden flex flex-col">
            {isMiracle && <div className="absolute top-0.5 right-0.5 z-10"><Icons.Sparkles size={12} className="text-purple-600" /></div>}
            {card.rarity && (
              <div className="absolute top-0.5 left-0.5 text-[10px] md:text-xs font-bold z-10 leading-none">
                {card.rarity === 'legendary' && '★'}{card.rarity === 'epic' && '◆'}{card.rarity === 'rare' && '●'}
              </div>
            )}
            
            {/* 名字：手机端超小字体 */}
            <div className="font-bold text-center mb-0.5 md:mb-1 text-gray-800 text-[10px] md:text-xs truncate px-1">
              {card.name}
            </div>

            {/* 图片 */}
            {card.id && (
              <div className="w-full flex-grow mb-0.5 md:mb-1 rounded overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0 min-h-0">
                <img src={window.getCardImagePath(card.id)} alt={card.name} onError={e => e.target.style.display='none'} className="w-full h-full object-cover" />
              </div>
            )}

            {/* 种族：手机端如果空间不够可能会被压缩，这是预期的 */}
            {(card.stRace || card.ndRace) && (
              <div className="text-center text-[8px] md:text-xs text-gray-600 mb-0.5 md:mb-1 truncate leading-none">
                {[card.stRace, card.ndRace].filter(Boolean).join('/')}
              </div>
            )}

            {/* 数值栏 */}
            <div className="flex justify-around items-center text-[10px] md:text-xs mt-auto">
              <div className="flex items-center gap-0.5 md:gap-1">
                <Icons.Coins size={10} className="text-yellow-600 md:w-3 md:h-3" />
                <span className="font-bold leading-none">{isMiracle ? 0 : card.cost}</span>
              </div>
              {card.type === 'battlefield' && (<>
                <div className="flex items-center gap-0.5 md:gap-1">
                  <Icons.Sword size={10} className="text-red-600 md:w-3 md:h-3" />
                  <span className="font-bold leading-none">{card.atk}</span>
                </div>
                <div className="flex items-center gap-0.5 md:gap-1">
                  <Icons.Heart size={10} className="text-green-600 md:w-3 md:h-3" />
                  <span className="font-bold leading-none">{card.hp}</span> {/* 手机端省略maxHp以节省空间 */}
                </div>
              </>)}
            </div>
            
            {showPick && <div className="mt-0.5 text-center"><span className="text-[8px] md:text-xs bg-blue-500 text-white px-1 md:px-2 py-0.5 rounded">选</span></div>}
          </div>

          {/* 电脑端 Tooltip */}
          {card.effect && (
            <div ref={tooltipRef} style={{...desktopTipStyle, transition:'opacity 0.15s ease-in-out'}}
              className="hidden md:block p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl w-64 border-2 border-yellow-400 pointer-events-none">
              <div className="font-bold text-yellow-300 mb-1">{card.name}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{card.effect}</div>
            </div>
          )}
        </div>

        {/* 移动端详情模态框 (点击背景关闭) */}
        {showMobileModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-80 p-4"
            onClick={(e) => { e.stopPropagation(); setShowMobileModal(false); }}>
            <div className={`p-4 rounded-xl border-2 border-yellow-400 shadow-2xl w-full max-w-sm bg-gradient-to-br ${rarityClass} text-gray-900 relative`}
              onClick={(e) => e.stopPropagation() /* 点击卡片本身不关闭 */}>
                
              <button onClick={() => setShowMobileModal(false)} className="absolute top-2 right-2 p-1 bg-black bg-opacity-20 rounded-full text-white">
                <Icons.X size={16} />
              </button>

              <div className="text-center mb-4">
                <h3 className="text-xl font-bold mb-1">{card.name}</h3>
                <div className="text-xs text-gray-700 font-mono">
                  {[card.stRace, card.ndRace].filter(Boolean).join(' / ')} • {card.rarity?.toUpperCase()}
                </div>
              </div>
              
              <div className="flex justify-center gap-6 mb-4 text-lg font-bold">
                 <div className="flex flex-col items-center"><Icons.Coins className="text-yellow-600 mb-1"/> <span>{card.cost} 费</span></div>
                 {card.type === 'battlefield' && <>
                    <div className="flex flex-col items-center"><Icons.Sword className="text-red-600 mb-1"/> <span>{card.atk} 攻</span></div>
                    <div className="flex flex-col items-center"><Icons.Heart className="text-green-600 mb-1"/> <span>{card.hp}/{card.maxHp} 血</span></div>
                 </>}
              </div>

              <div className="bg-white bg-opacity-60 p-3 rounded-lg min-h-[80px] flex items-center justify-center text-center">
                 <p className="text-sm font-medium leading-relaxed">{card.effect || "无特殊效果"}</p>
              </div>
              
              <div className="mt-4 text-center text-xs text-gray-500">
                (点击背景关闭)
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ══════════════════════════════════════════════════════════
  // CardShowOverlay — 支援/奇迹施展时屏幕正中放大展示
  // ══════════════════════════════════════════════════════════
  const CardShowOverlay = ({ card }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      if (card) {
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
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none px-4"
        style={{ background: visible ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0)', transition:'background 0.25s ease' }}>
        <div className={`rounded-2xl border-2 ${borderC} bg-gradient-to-br ${bgGrad} p-4 md:p-6 flex flex-col items-center shadow-2xl w-full max-w-sm`}
          style={{
            transform:  visible ? 'scale(1)'  : 'scale(0.7)',
            opacity:    visible ?  1           :  0,
            transition: 'transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease',
            boxShadow:  visible ? `0 0 40px 8px ${glowCol}66` : 'none'
          }}>
          <div className={`${titleC} text-sm font-bold mb-3 tracking-widest`}>{label}</div>
          <div style={{ transform:'scale(1.2) md:scale(1.5)', transformOrigin:'top center', marginBottom:'60px' }}>
            <Card card={card} />
          </div>
          {card.effect && (
            <div className="mt-8 md:mt-12 max-w-full text-center text-white text-xs md:text-sm bg-black bg-opacity-40 rounded-lg px-3 py-2">
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

    // ── 路线 (Lane) ──
    const Lane = ({ laneIndex, player }) => {
      const card        = gameState[player].battlefield[laneIndex];
      const sel         = gameState.selectedCard;
      const canDeploy   = sel && sel.type === 'battlefield' && !card &&
                          ((gameState.phase === 'redDeploy'  && player === 'red') ||
                           (gameState.phase === 'blueDeploy' && player === 'blue'));
      const canTarget   = sel && (sel.type === 'support' || sel.type === 'miracle') && card;
      const isAnimating = battleAnimation.active && battleAnimation.lane === laneIndex;

      // 移动端高度需自适应，最小高度设小一点
      return (
        <div onClick={() => { if (canDeploy) onPlayCard(laneIndex); else if (canTarget) onUseCardOnTarget(player, laneIndex); }}
          className={`border-2 border-dashed rounded-lg p-1 md:p-2 min-h-[130px] md:min-h-[190px] flex items-center justify-center transition-all
            ${isAnimating  ? 'animate-pulse bg-yellow-200 border-yellow-500' : ''}
            ${canDeploy    ? 'border-green-400 bg-green-50 cursor-pointer hover:bg-green-100' : ''}
            ${canTarget    ? 'border-yellow-400 bg-yellow-50 cursor-pointer hover:bg-yellow-100' : ''}
            ${!canDeploy && !canTarget ? (player === 'blue' ? 'border-gray-300 bg-blue-50' : 'border-gray-300 bg-red-50') : ''}`}>
          {card ? (
            <div className="pointer-events-none"> {/* 防止在Slot里再次触发卡牌点击，Slot负责处理交互 */}
              <Card card={card} />
            </div>
          ) : <div className="text-gray-400 text-[10px] md:text-xs text-center writing-mode-vertical md:writing-mode-horizontal">{laneIndex + 1}</div>}
        </div>
      );
    };

    // ── 手牌区 ──
    const HandArea = ({ player, labelColor }) => {
      const hand    = gameState[player].hand;
      const visible = isHandVisible(player);
      // 移动端使用横向滚动 (overflow-x-auto)，防止换行占满屏幕
      return (
        <div className="mb-1 md:mb-2">
          <div className={`${labelColor} text-[10px] md:text-xs mb-1`}>手牌 ({hand.length}):</div>
          <div className="flex gap-1 md:gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar" style={{WebkitOverflowScrolling:'touch'}}>
            {hand.map(card =>
              visible
                ? <div key={card.instanceId}><Card card={card} onClick={() => { SM.playSound('click'); onSelectCard(card, player); }} isSelected={gameState.selectedCard?.instanceId === card.instanceId} /></div>
                : <div key={card.instanceId}><Card card={card} faceDown onClick={() => {}} /></div>
            )}
            {/* 占位div，防止最后一张牌贴边不好点 */}
            <div className="w-2 flex-shrink-0"></div>
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
        <div className="flex justify-between items-center px-1">
          <div className={`${labelC} text-sm md:text-lg font-bold`}>{player === 'blue' ? '蓝方' : '红方'}</div>
          <div className="flex gap-2 md:gap-3 text-white">
            <div className="flex items-center gap-1"><Icons.Heart className="text-red-400" size={16} /><span className="text-sm md:text-lg font-bold">{gameState[player].health}</span></div>
            <div className="flex items-center gap-1"><Icons.Coins className="text-yellow-400" size={16} /><span className="text-sm md:text-lg font-bold">{gameState[player].coins}</span></div>
          </div>
        </div>
      );
      
      // 4列 Grid，移动端 gap 设小
      const lanes = (
        <div className="grid grid-cols-4 gap-1 md:gap-2 my-1 md:my-2">
          {[0,1,2,3].map(i => <div key={i}><Lane laneIndex={i} player={player} /></div>)}
        </div>
      );

      return (
        <div className={`mb-2 md:mb-3 p-1 md:p-3 ${bgC} rounded-xl border-2 ${borderC}`}>
          {isTop  && status}
          {isTop  && <HandArea player={player} labelColor={handLC} />}
          {isTop  && lanes}
          {!isTop && lanes}
          {!isTop && <HandArea player={player} labelColor={handLC} />}
          {!isTop && status}
        </div>
      );
    };

    const PHASE_TEXT  = { idle:'等待开始', redDeploy:'红方部署', blueDeploy:'蓝方部署', redSupport:'红方支援', battle:'战斗中...' };
    const isGameOver  = gameState.red.health <= 0 || gameState.blue.health <= 0 ||
                        (gameState.deck.length === 0 && gameState.red.hand.length === 0 && gameState.blue.hand.length === 0);
    const canConfirmUse = gameState.selectedCard && (gameState.selectedCard.type === 'support' || gameState.selectedCard.type === 'miracle');

    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-2 md:p-4 overflow-auto">
        <div className="max-w-7xl mx-auto">

          {/* ── 支援/奇迹 展示层 ── */}
          <CardShowOverlay card={cardShowOverlay} />

          {/* ── 父层额外UI（轮盘等） ── */}
          {extraUI}

          {/* ── 胜利层 ── */}
          {winner && (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl p-6 md:p-12 text-center shadow-2xl transform scale-110 w-[90%] md:w-auto">
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 md:mb-6 animate-pulse">{winner === '平局' ? '🤝 平局！' : `🎉 ${winner}获胜！`}</h1>
                <div className="text-lg md:text-2xl text-white mb-6 md:mb-8">红方血量: {gameState.red.health} &nbsp;|&nbsp; 蓝方血量: {gameState.blue.health}</div>
                <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-center">
                  <button onClick={onReset} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg shadow-lg">重新开始</button>
                  <button onClick={() => { SM.playSound('click'); window.dispatchEvent(new Event('gameui:review')); }} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg">复盘</button>
                  <button onClick={() => { SM.playSound('click'); window.location.href = 'index.html'; }} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-lg shadow-lg">返回主界面</button>
                </div>
              </div>
            </div>
          )}

          {/* ── 顶栏 (移动端优化布局) ── */}
          <div className="text-center mb-2 md:mb-3 relative">
             {/* 标题和状态 */}
            <h1 className="text-lg md:text-2xl font-bold text-white mb-0.5">四路线卡牌对战</h1>
            <div className="text-yellow-300 text-xs md:text-base mb-2">回合: {gameState.turn} | {PHASE_TEXT[gameState.phase] || '—'}</div>
            
            {/* 顶部控制按钮组 - Flex Wrap 以适应手机 */}
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => { window.location.href = 'index.html'; }} className="px-2 py-1.5 md:px-3 md:py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-xs md:text-sm">主界面</button>
              
              <button onClick={() => { SM.toggleMute(); setIsMuted(SM.isMuted); }} className="px-2 py-1.5 md:px-3 md:py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-xs md:text-sm flex items-center">
                {SM.isMuted ? <Icons.VolumeX size={14} /> : <Icons.Volume2 size={14} />}
              </button>
              
              <button onClick={() => { SM.toggleBGM(); setBgmEnabled(SM.bgmEnabled); }}
                className={`px-2 py-1.5 md:px-3 md:py-2 ${SM.bgmEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white rounded-lg font-bold text-xs md:text-sm`}>BGM</button>
              
              <button onClick={() => { SM.playSound('click'); onReset(); }} className="px-2 py-1.5 md:px-3 md:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-1 text-xs md:text-sm">
                <Icons.RefreshCw size={14} /> <span className="hidden md:inline">重新开始</span><span className="md:hidden">重置</span>
              </button>
              
              <button onClick={() => { SM.playSound('click'); setShowAllCards(true); }} className="px-2 py-1.5 md:px-3 md:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1 text-xs md:text-sm">
                <Icons.Eye size={14} /> <span className="hidden md:inline">查看卡牌</span><span className="md:hidden">图鉴</span>
              </button>
            </div>
          </div>

          {/* ── 查看卡牌弹窗 ── */}
          {showAllCards && (
            <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-2 md:p-4" onClick={() => setShowAllCards(false)}>
              <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl md:text-2xl font-bold mb-4 text-gray-800">所有卡牌列表 <span className="text-sm font-normal text-gray-500">(长按查看效果)</span></h2>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 md:gap-3">
                  {allCards.map(card => <div key={card.id} className="flex justify-center"><Card card={window.createCard(card)} /></div>)}
                </div>
                <button onClick={() => setShowAllCards(false)} className="mt-4 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold w-full text-lg">关闭</button>
              </div>
            </div>
          )}

          {/* ── 选牌阶段弹窗 ── */}
          {(gamePhase === 'redPicking' || gamePhase === 'bluePicking') && (
            <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-2 md:p-4" 
                 onClick={(e) => e.target === e.currentTarget && null}>
              <div className="bg-gradient-to-br from-yellow-900 to-orange-900 rounded-xl p-4 md:p-8 w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl border-4 border-yellow-500"
                   onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl md:text-3xl font-bold text-yellow-300 mb-2 text-center animate-pulse">
                  {gamePhase === 'redPicking' ? '🔴 红方选牌' : '🔵 蓝方选牌'}
                </h2>
                <p className="text-sm md:text-xl text-yellow-200 mb-4 md:mb-6 text-center">
                  请选择 2 张加入手牌 <span className="opacity-75 block text-xs mt-1">(移动端长按卡牌查看详情)</span>
                </p>
                {/* 移动端 3列太挤，改为3列但卡牌缩小，或者flex-wrap */}
                <div className="flex flex-wrap justify-center gap-3 md:gap-4 mb-4">
                  {gameState.initialCards.map(card => (
                    <div key={card.instanceId}>
                      <Card card={card} 
                            onClick={() => { SM.playSound('click'); onPickCard(card); }} 
                            showPick />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── 蓝方（上） / 红方（下） ── */}
          <PlayerArea player="blue" position="top" />
          <PlayerArea player="red"  position="bottom" />

          {/* ── 游戏主操作按钮 (底部浮动优化) ── */}
          <div className="flex justify-center gap-2 md:gap-3 mb-3 sticky bottom-0 z-40 bg-slate-900/80 p-2 backdrop-blur-sm rounded-t-xl border-t border-slate-700">
            {gamePhase === 'notStarted' && (
              <button onClick={() => { SM.playSound('click'); onStartPicking(); }} className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-bold text-sm md:text-base w-full md:w-auto">开始选牌</button>
            )}
            {gamePhase === 'playing' && gameState.phase === 'idle' && !isGameOver && (
              <button onClick={() => { SM.playSound('click'); onStartTurn(); }} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm md:text-base flex-1 md:flex-none">下一回合</button>
            )}
            {gamePhase === 'playing' && gameState.phase !== 'idle' && gameState.phase !== 'battle' && (
              <>
                <button onClick={() => { SM.playSound('click'); onEndPhase(); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm md:text-base flex-1 md:flex-none">结束阶段</button>
                {canConfirmUse && (
                  <button onClick={() => { SM.playSound('place'); onConfirmUse(); }} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold text-sm md:text-base animate-pulse flex-1 md:flex-none">确认使用</button>
                )}
              </>
            )}
          </div>

          {/* ── 底部信息 (移动端隐藏不必要的文字) ── */}
          <div className="grid grid-cols-3 gap-2 md:gap-3 mb-3 text-white text-[10px] md:text-xs text-center">
            <div className="bg-gray-700/50 p-1 md:p-2 rounded"><div className="font-bold mb-0.5">公共</div><div className="text-base md:text-xl">{gameState.deck.length}</div></div>
            <div className="bg-purple-700/50 p-1 md:p-2 rounded"><div className="font-bold mb-0.5">奇迹</div><div className="text-base md:text-xl">{gameState.miracleDeck?.length || 0}</div></div>
            <div className="bg-red-700/50 p-1 md:p-2 rounded"><div className="font-bold mb-0.5">弃牌</div><div className="text-base md:text-xl">{gameState.discardPile.length}</div></div>
          </div>

          {/* ── 日志 ── */}
          <div className="bg-gray-800/50 rounded-lg p-2 md:p-3 max-h-32 md:max-h-48 overflow-y-auto">
            <div className="text-gray-300 text-[10px] md:text-xs font-mono">
              {gameState.log.map((msg, i) => <div key={i} className="mb-0.5 md:mb-1">{msg}</div>)}
            </div>
          </div>

        </div>
      </div>
    );
  };
})();
