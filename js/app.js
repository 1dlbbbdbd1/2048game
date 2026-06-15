// 2048 v1.3.6 稳定版
(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const ANIM_DURATION = 120;
    let settings = Storage.getSettings();
    
    let game = null;
    let gameOver = false;
    let hasWon = false;
    let cellSize = 0;
    let timerInterval = null;
    let seconds = 0;
    let muted = false;

    // ===== UNIFIED MODE SYSTEM =====
    const MODE_NONE  = null;
    const MODE_SMASH = 'smash';
    const MODE_SWAP  = 'swap';
    const MODE_CLEAR = 'clear';
    const MODE_DOUBLE = 'double';
    const MODE_UNDO  = 'undo';

    let currentMode = MODE_NONE;
    const modeState = {
        smash:  { count: 0, accum: 1 },
        swap:   { count: 0, accum: 1, firstTile: null },
        clear:  { count: 0, accum: 1 },
        double: { count: 0, accum: 1 },
        undo:   { count: 0, accum: 1 }
    };

    // Mode config mapping
    const modeConfig = {
        smash:  { modeKey: 'smashMode',  multKey: 'smashMultiplier',  incKey: 'smashIncrement',  limitKey: 'smashLimit' },
        swap:   { modeKey: 'swapMode',   multKey: 'swapMultiplier',   incKey: 'swapIncrement',   limitKey: 'swapLimit' },
        clear:  { modeKey: 'clearMode',  multKey: 'clearMultiplier',  incKey: 'clearIncrement',  limitKey: 'clearLimit' },
        double: { modeKey: 'doubleMode', multKey: 'doubleMultiplier', incKey: 'doubleIncrement', limitKey: 'doubleLimit' },
        undo:   { modeKey: 'undoMode',   multKey: 'undoMultiplier',   incKey: 'undoIncrement',   limitKey: 'undoLimit' }
    };

    // Hint messages for each ability (mode-agnostic base, mode details appended dynamically)
    const HINT_MSGS = {
        smash:  '🔨 敲击消除：点击棋盘上任意方块将其直接消除。',
        swap:   '🔄 交换位置：依次点击两个方块，交换它们的位置。',
        clear:  '🗑️ 清除小数字：确认后将清除棋盘上所有值为2和4的方块。',
        double: '✖️ 翻倍：点击棋盘上一个方块，将其分值翻倍。',
        undo:   '↩️ 撤回：回退到上一步操作前的状态。'
    };

    // ===== AUDIO =====
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    let masterGain = null;

    const initAudio = () => {
        if (audioCtx) return;
        audioCtx = new AudioCtx();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.value = muted ? 0 : settings.volume / 100;
    };

    const playTone = (f, d, t, v) => {
        if (!audioCtx || muted) return;
        try {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = t || 'sine';
            o.frequency.value = f;
            g.gain.setValueAtTime(v || 0.3, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d);
            o.connect(g);
            g.connect(masterGain);
            o.start();
            o.stop(audioCtx.currentTime + d);
        } catch (e) {}
    };

    // ===== MUTE =====
    const muteBtn = byId('btn-mute');
    if (muteBtn) {
        muteBtn.onclick = () => {
            muted = !muted;
            initAudio();
            if (muted) {
                muteBtn.classList.add('muted');
                if (masterGain) masterGain.gain.value = 0;
            } else {
                muteBtn.classList.remove('muted');
                if (masterGain) masterGain.gain.value = settings.volume / 100;
            }
        };
    }

    // ===== PAGE NAVIGATION =====
    const showPage = name => {
        ['page-menu', 'page-game', 'page-settings', 'page-leaderboard'].forEach(id => {
            byId(id).classList.remove('active');
        });
        byId(`page-${name}`).classList.add('active');
    };

    // ===== MENU BUTTONS =====
    byId('btn-new-game').onclick = () => {
        const saved = Storage.getSavedGame();
        if (saved) {
            showNewGameConfirm(saved.score);
        } else {
            if (settings.askSize) byId('modal-size').classList.remove('hidden');
            else startGame(settings.gridSize);
        }
    };

    byId('btn-continue-game').onclick = () => {
        continueSavedGame();
    };
    byId('btn-settings').onclick = () => { showPage('settings'); renderSettings(); };
    byId('btn-leaderboard').onclick = () => { showPage('leaderboard'); renderLeaderboard(0); };
    byId('btn-back-menu').onclick = () => { showExitConfirm(); };
    byId('btn-game-restart').onclick = () => {
        if (!game || gameOver) return;
        stopTimer();
        exitMode();
        showOverlay('restart');
    };
    byId('btn-back-settings').onclick = () => { showPage('menu'); };
    byId('btn-back-leaderboard').onclick = () => { showPage('menu'); };

    // ===== 按两次返回退出（系统手势/返回键） =====
    let backToastTimer = null;
    const showBackToast = () => {
        const toast = byId('back-toast');
        if (!toast) return;
        toast.classList.add('show');
        if (backToastTimer) clearTimeout(backToastTimer);
        backToastTimer = setTimeout(() => {
            toast.classList.remove('show');
            backToastTimer = null;
        }, 2000);
    };
    const hideBackToast = () => {
        const toast = byId('back-toast');
        if (toast) toast.classList.remove('show');
        if (backToastTimer) { clearTimeout(backToastTimer); backToastTimer = null; }
    };

    // 返回菜单的统一清理逻辑
    const returnToMenu = () => {
        stopTimer();
        exitMode();
        hideHint();
        byId('modal-size').classList.add('hidden');
        byId('overlay').classList.add('hidden');
        checkSavedGame();
        showPage('menu');
    };

    // 重置道具使用状态
    const resetModeState = () => {
        modeState.smash  = { count: 0, accum: 1 };
        modeState.swap   = { count: 0, accum: 1, firstTile: null };
        modeState.clear  = { count: 0, accum: 1 };
        modeState.double = { count: 0, accum: 1 };
        modeState.undo   = { count: 0, accum: 1 };
    };

    const showExitConfirm = () => {
        if (!game || gameOver) {
            returnToMenu();
            return;
        }

        const modal = byId('modal-confirm');
        const title = byId('modal-confirm-title');
        const msg = byId('modal-confirm-msg');
        const btns = byId('modal-confirm-buttons');

        title.textContent = '退出游戏';
        msg.textContent = `当前分数：${game.score}，选择退出方式：`;
        btns.innerHTML = `
            <button class="btn btn-primary" id="exit-save">保存离开</button>
            <button class="btn btn-secondary" id="exit-settle">结算退出</button>
            <button class="btn btn-secondary" id="exit-cancel">取消</button>
        `;
        modal.classList.remove('hidden');

        byId('exit-save').onclick = () => {
            modal.classList.add('hidden');
            saveCurrentGame();
            returnToMenu();
        };

        byId('exit-settle').onclick = () => {
            modal.classList.add('hidden');
            saveScore();
            Storage.clearSavedGame();
            returnToMenu();
        };

        byId('exit-cancel').onclick = () => {
            modal.classList.add('hidden');
        };
    };

    const saveCurrentGame = () => {
        if (!game) return;
        const gameState = {
            grid: game.getState().grid,
            score: game.score,
            won: game.won,
            size: game.size,
            seconds: seconds,
            modeState: JSON.parse(JSON.stringify(modeState)),
            undoState: game.undoState ? JSON.parse(JSON.stringify(game.undoState)) : null
        };
        Storage.saveGame(gameState);
    };

    const showNewGameConfirm = (savedScore) => {
        const modal = byId('modal-confirm');
        const title = byId('modal-confirm-title');
        const msg = byId('modal-confirm-msg');
        const btns = byId('modal-confirm-buttons');

        byId('modal-size').classList.add('hidden');

        title.textContent = '检测到未完成的游戏';
        msg.textContent = `当前保存的游戏分数：${savedScore}，如何处理？`;
        btns.innerHTML = `
            <button class="btn btn-primary" id="ng-confirm-ok">结算并开始新游戏</button>
            <button class="btn btn-secondary" id="ng-confirm-continue">继续上一局</button>
            <button class="btn btn-secondary" id="ng-confirm-cancel">取消</button>
        `;
        modal.classList.remove('hidden');

        byId('ng-confirm-ok').onclick = () => {
            modal.classList.add('hidden');
            const saved = Storage.getSavedGame();
            if (saved) {
                saveScoreFromSaved(saved);
            }
            Storage.clearSavedGame();
            checkSavedGame();
            if (settings.askSize) byId('modal-size').classList.remove('hidden');
            else startGame(settings.gridSize);
        };

        byId('ng-confirm-continue').onclick = () => {
            modal.classList.add('hidden');
            continueSavedGame();
        };

        byId('ng-confirm-cancel').onclick = () => {
            modal.classList.add('hidden');
            checkSavedGame();
        };
    };

    const saveScoreFromSaved = (saved) => {
        Storage.addScore({
            score: saved.score,
            gridSize: saved.size,
            time: formatTime(saved.seconds),
            date: new Date().toISOString()
        });
    };

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60), s = secs % 60;
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const continueSavedGame = () => {
        const saved = Storage.getSavedGame();
        if (!saved) return;

        game = new Game(saved.size);
        game.grid = JSON.parse(JSON.stringify(saved.grid));
        game.score = saved.score;
        game.won = saved.won;
        game.undoState = saved.undoState || null;

        gameOver = false;
        hasWon = saved.won;
        currentMode = MODE_NONE;
        const savedModeState = saved.modeState || {};
        modeState.smash = savedModeState.smash || { count: 0, accum: 1 };
        modeState.swap = savedModeState.swap || { count: 0, accum: 1, firstTile: null };
        modeState.clear = savedModeState.clear || { count: 0, accum: 1 };
        modeState.double = savedModeState.double || { count: 0, accum: 1 };
        modeState.undo = savedModeState.undo || { count: 0, accum: 1 };

        seconds = saved.seconds;
        stopTimer();
        updateTimerDisplay();
        startTimer();

        updateScore();
        updateModeUI();
        hideHint();
        hideBackToast();

        history.pushState({ page: 'game' }, '', '');

        byId('overlay').classList.add('hidden');
        byId('pause-overlay').classList.add('hidden');
        isPaused = false;
        byId('modal-size').classList.add('hidden');
        buildBoard();
        updateAbilityButtons();
        showPage('game');
    };

    const checkSavedGame = () => {
        const saved = Storage.getSavedGame();
        const continueBtn = byId('btn-continue-game');
        if (saved) {
            continueBtn.style.display = 'block';
        } else {
            continueBtn.style.display = 'none';
        }
    };

    window.addEventListener('popstate', e => {
        if (!byId('page-game').classList.contains('active')) return;
        showExitConfirm();
    });

    // ===== UNDO =====
    byId('btn-undo').onclick = () => {
        if (!game || gameOver) return;
        if (!game.undoState) return;
        if (!canUse(MODE_UNDO)) return;

        const cost = getCost(MODE_UNDO);
        if (getModeSetting(MODE_UNDO, 'modeKey') === 'cost' && cost > game.score) {
            playTone(150, 0.2, 'sawtooth', 0.15);
            return;
        }

        game.undo();
        applyCost(MODE_UNDO, cost);
        syncBoard();
        updateScore();
        updateAbilityButtons();
        saveCurrentGame();
    };

    // ===== HINT SYSTEM =====
    const showHint = (mode) => {
        const el = byId('ability-hint');
        if (!el) return;
        const base = HINT_MSGS[mode] || '';
        const modeKey = getModeSetting(mode, 'modeKey');
        let extra = '';
        if (modeKey === 'cost') {
            const multiplier = getModeSetting(mode, 'multKey');
            const accum = modeState[mode].accum;
            const minCost = getCost(mode);
            extra = `  [当前倍率${multiplier}倍，累积${(accum).toFixed(2)}x，本次扣${minCost}分]`;
        } else if (modeKey === 'limit') {
            const limit = getModeSetting(mode, 'limitKey');
            const count = modeState[mode].count;
            extra = `  [剩余${limit - count}次]`;
        }
        el.textContent = base + extra;
        el.className = `ability-hint visible hint-${mode}`;
    };

    const hideHint = () => {
        const el = byId('ability-hint');
        if (!el) return;
        el.className = 'ability-hint';
        el.textContent = '';
    };

    // ===== UNIFIED MODE MANAGEMENT =====
    const enterMode = (mode) => {
        if (currentMode === mode) {
            exitMode();
            return;
        }
        exitMode();
        currentMode = mode;
        updateModeUI();

        // 显示提示
        showHint(mode);

        // 清除模式特殊处理：弹出确认框
        if (mode === MODE_CLEAR) {
            showClearConfirm();
        }
    };

    const exitMode = () => {
        if (!currentMode) return;

        // 清理交换选择状态
        if (currentMode === MODE_SWAP) {
            clearSwapSelection();
        }

        // 清除高亮（确保彻底清理）
        if (currentMode === MODE_CLEAR) {
            removeAllClearHighlights();
        }

        currentMode = MODE_NONE;
        updateModeUI();
        hideHint();
    };

    const updateModeUI = () => {
        const boardWrapper = byId('board-wrapper');

        // 清除所有按钮激活态和棋盘模式类
        ['btn-smash','btn-swap','btn-clear','btn-double'].forEach(id => {
            byId(id)?.classList.remove('mode-active');
        });
        boardWrapper?.classList.remove('mode-smash','mode-swap','mode-clear','mode-double');
        byId('tile-layer').style.pointerEvents = 'none';
        byId('tile-layer').style.cursor = '';

        if (!currentMode) return;

        // 激活当前按钮和棋盘样式
        byId(`btn-${currentMode}`)?.classList.add('mode-active');
        boardWrapper?.classList.add(`mode-${currentMode}`);
        byId('tile-layer').style.pointerEvents = 'auto';
        byId('tile-layer').style.cursor = currentMode === MODE_SWAP ? 'pointer' : currentMode === MODE_DOUBLE ? 'pointer' : 'crosshair';
    };

    // ===== UNIFIED COST SYSTEM =====
    const getModeSetting = (m, key) => {
        const cfg = modeConfig[m];
        return settings[cfg[key]];
    };

    /**
     * canUse — 判断功能是否可用（不检查分数够不够，只检查模式限制）
     * 分数不足由 updateAbilityButtons 负责禁用按钮
     */
    const canUse = (mode) => {
        const m = getModeSetting(mode, 'modeKey');
        if (m === 'free') return true;
        if (m === 'limit') return modeState[mode].count < getModeSetting(mode, 'limitKey');
        if (m === 'cost') return true; // cost 模式只要分数够就行，分数检查在按钮层做
        return false;
    };

    /**
     * getCost — 计算扣分金额
     * 公式: floor(当前场上最大方块值 × 基础倍率 × 累计倍率)
     * 非扣分模式返回 0
     */
    const getCost = (mode) => {
        const m = getModeSetting(mode, 'modeKey');
        if (m !== 'cost') return 0;
        const multiplier = getModeSetting(mode, 'multKey');
        const ms = modeState[mode];
        const maxTile = game ? game.getMaxTileValue() : 0;
        return Math.floor(maxTile * multiplier * ms.accum);
    };

    const applyCost = (mode, cost) => {
        const ms = modeState[mode];
        ms.count++;
        if (cost > 0 && getModeSetting(mode, 'modeKey') === 'cost') {
            game.score = Math.max(0, game.score - cost);
            ms.accum += getModeSetting(mode, 'incKey') / 100;
            // 扣分视觉反馈：分数闪烁红色
            const scoreEl = byId('score');
            if (scoreEl) {
                scoreEl.classList.add('score-deduct');
                setTimeout(() => scoreEl?.classList.remove('score-deduct'), 500);
            }
        }
    };

    const checkGameOverAfterAction = () => {
        if (!game.canMove()) {
            gameOver = true;
            stopTimer();
            saveScore();
            Storage.clearSavedGame();
            showOverlay('lose');
        } else {
            saveCurrentGame();
        }
    };

    /**
     * 更新所有功能按钮的可用状态
     * 在每次移动、扣分、撤回后调用
     */
    const updateAbilityButtons = () => {
        if (!game) return;
        ['smash', 'swap', 'clear', 'double', 'undo'].forEach(mode => {
            const btn = byId(`btn-${mode}`);
            if (!btn) return;
            // 如果游戏已结束，禁用所有
            if (gameOver) {
                btn.disabled = true;
                updateBadge(mode);
                return;
            }

            const m = getModeSetting(mode, 'modeKey');

            // 先默认可用，后续按条件禁用
            btn.disabled = false;

            // ===== 清除按钮专用棋盘资格检查（所有模式通用）=====
            if (mode === 'clear') {
                if (allTilesAreTwoOrFour()) btn.disabled = true;
                else if (!hasClearableTiles()) btn.disabled = true;
            }

            // ===== 撤销按钮专用：没有可回退的状态直接禁用 =====
            if (mode === 'undo' && !game.undoState) {
                btn.disabled = true;
            }

            // ===== 棋盘资格检查（其他能力）=====
            if (!btn.disabled && mode === 'double' && !hasDoubleableTile()) {
                btn.disabled = true;
            }
            if (!btn.disabled && mode === 'swap' && countSwappableTiles() < 2) {
                btn.disabled = true;
            }

            // ===== 模式特定的使用条件（在通过棋盘资格后）=====
            if (!btn.disabled) {
                if (m === 'free') {
                    btn.disabled = false;
                } else if (m === 'limit') {
                    btn.disabled = modeState[mode].count >= getModeSetting(mode, 'limitKey');
                } else if (m === 'cost') {
                    const minCost = getCost(mode);
                    btn.disabled = game.score < minCost;
                }
            }

            // 统一更新角标（updateBadge 内部会根据 disabled 和模式决定是否显示）
            updateBadge(mode);
        });
    };

    /** 更新按钮角标（限制次数模式下显示剩余次数，按钮禁用时隐藏） */
    const updateBadge = (mode) => {
        const badge = document.querySelector(`#btn-${mode} .btn-badge`);
        if (!badge) return;
        const btn = byId(`btn-${mode}`);
        const m = getModeSetting(mode, 'modeKey');
        if (m === 'limit' && btn && !btn.disabled) {
            const limit = getModeSetting(mode, 'limitKey');
            const count = modeState[mode].count;
            const left = limit - count;
            badge.textContent = left + '×';
            badge.classList.add('show');
            badge.classList.toggle('zero', left <= 0);
        } else {
            badge.classList.remove('show');
        }
    };

    /** 辅助：统计方块数量（交换模式需要至少2个）*/
    const countSwappableTiles = () => {
        if (!game) return 0;
        let c = 0;
        for (let r = 0; r < game.size; r++)
            for (let cc = 0; cc < game.size; cc++) {
                const t = game.grid[r][cc];
                if (t) c++;
            }
        return c;
    };

    /** 辅助：是否有可清除的方块（2或4）*/
    const hasClearableTiles = () => {
        if (!game) return false;
        for (let r = 0; r < game.size; r++)
            for (let c = 0; c < game.size; c++) {
                const t = game.grid[r][c];
                if (t && (t.value === 2 || t.value === 4)) return true;
            }
        return false;
    };

    /** 辅助：是否所有方块都是 2 或 4（清除按钮此时应禁用）*/
    const allTilesAreTwoOrFour = () => {
        if (!game) return false;
        for (let r = 0; r < game.size; r++)
            for (let c = 0; c < game.size; c++) {
                const t = game.grid[r][c];
                if (t && t.value !== 2 && t.value !== 4) return false;
            }
        return true;
    };

    /** 辅助：是否有可翻倍的方块 */
    const hasDoubleableTile = () => {
        if (!game) return false;
        for (let r = 0; r < game.size; r++)
            for (let c = 0; c < game.size; c++) {
                const t = game.grid[r][c];
                if (t) return true;
            }
        return false;
    };

    // ===== ABILITY BUTTONS =====
    ['btn-smash','btn-swap','btn-clear','btn-double'].forEach(id => {
        const btn = byId(id);
        if (btn) {
            btn.onclick = () => {
                if (!game || gameOver) return;
                if (btn.disabled) return; // 被禁用时直接忽略
                const mode = btn.getAttribute('data-mode');

                // 清除模式：弹确认框
                if (mode === MODE_CLEAR) {
                    showClearConfirm();
                    return;
                }

                enterMode(mode);
            };
        }
    });

    // ===== CLEAR CONFIRM DIALOG =====
    const showClearConfirm = () => {
        // 安全检查：全是2和4时不允许使用（按钮应该是灰色的，但加一层保险）
        if (allTilesAreTwoOrFour()) {
            playTone(150, 0.2, 'sawtooth', 0.12);
            const hintEl = byId('ability-hint');
            if (hintEl) {
                hintEl.textContent = '⚠️ 当前棋盘上所有方块都是 2 或 4，清除后无法有效补充新方块，操作不允许。';
                hintEl.className = 'ability-hint visible hint-clear';
            }
            setTimeout(hideHint, 2500);
            exitMode();
            return;
        }

        // 纯扫描，不修改grid（避免丢失.el引用导致UI尸体）
        let totalValue = 0;
        let clearCount = 0;
        for (let r = 0; r < game.size; r++)
            for (let c = 0; c < game.size; c++) {
                const t = game.grid[r][c];
                if (t && (t.value === 2 || t.value === 4)) {
                    totalValue += t.value;
                    clearCount++;
                }
            }

        if (clearCount === 0) {
            playTone(150, 0.2, 'sawtooth', 0.12);
            showHint('clear');
            const hintEl = byId('ability-hint');
            if (hintEl) hintEl.textContent = '⚠️ 棋盘上没有 2 或 4，无法清除。请先合并方块产生更大数值。';
            setTimeout(hideHint, 2500);
            return;
        }

        const cost = getCost(MODE_CLEAR);
        const multiplier = getModeSetting(MODE_CLEAR, 'multKey');
        const accum = modeState[MODE_CLEAR].accum;

        if (getModeSetting(MODE_CLEAR, 'modeKey') === 'cost' && cost > game.score) {
            playTone(150, 0.2, 'sawtooth', 0.15);
            showHint('clear');
            const hintEl = byId('ability-hint');
            if (hintEl) hintEl.textContent = `⚠️ 分数不足！需要 ${cost} 分（倍率 ${multiplier}倍，累积 ${(accum).toFixed(2)}x），当前仅有 ${game.score} 分。请先通过合并方块获得更多分数。`;
            setTimeout(hideHint, 3000);
            return;
        }

        // 弹出确认框
        const overlay = byId('overlay');
        const title = byId('overlay-title');
        const msg = byId('overlay-msg');
        const btns = byId('overlay-buttons');

        title.textContent = '确认清除';
        msg.textContent = `将清除棋盘上 ${clearCount} 个方块（所有 2 和 4）${cost > 0 ? `，扣除 ${cost} 分（倍率 ${multiplier}倍，累积 ${(accum).toFixed(2)}x）` : ''}`;
        btns.innerHTML = `
            <button class="btn btn-primary" id="clear-confirm-ok">确定</button>
            <button class="btn btn-secondary" id="clear-confirm-cancel">取消</button>
        `;
        overlay.classList.remove('hidden');

        byId('clear-confirm-ok').onclick = () => {
            overlay.classList.add('hidden');
            executeClear();
        };
        byId('clear-confirm-cancel').onclick = () => {
            overlay.classList.add('hidden');
            exitMode(); // 清理currentMode和提示
        };
    };

    const removeAllClearHighlights = () => {
        const tl = byId('tile-layer');
        if (!tl) return;
        tl.querySelectorAll('.tile-clear-highlight').forEach(el => {
            el.classList.remove('tile-clear-highlight');
        });
    };

    // ===== SMASH HANDLER =====
    const handleSmashClick = (r, c) => {
        if (!canUse(MODE_SMASH)) {
            playTone(150, 0.2, 'sawtooth', 0.15); return;
        }

        const tile = game.grid[r][c];
        if (!tile || tile.value < 2) return;

        const cost = getCost(MODE_SMASH);
        if (getModeSetting(MODE_SMASH, 'modeKey') === 'cost' && cost > game.score) {
            playTone(150, 0.2, 'sawtooth', 0.15); return;
        }

        applyCost(MODE_SMASH, cost);
        playTone(100, 0.15, 'square', 0.25);

        const tileEl = tile.el;
        game.smashTile(r, c);

        if (tileEl) {
            tileEl.classList.add('tile-smash');
            tileEl.style.pointerEvents = 'none';
            setTimeout(() => {
                if (tileEl.parentNode) tileEl.remove();
                game.addRandomTile();
                syncBoard();
                updateScore();
                updateAbilityButtons();
                exitMode();
                checkGameOverAfterAction();
            }, 300);
        } else {
            game.addRandomTile();
            syncBoard();
            updateScore();
            updateAbilityButtons();
            exitMode();
        }
    };

    // ===== SWAP HANDLER =====
    const handleSwapClick = (r, c) => {
        if (!canUse(MODE_SWAP)) {
            playTone(150, 0.2, 'sawtooth', 0.15); return;
        }

        const tile = game.grid[r][c];
        const ms = modeState[MODE_SWAP];

        // 点击已选中的方块 → 取消选择
        if (ms.firstTile && ms.firstTile.r === r && ms.firstTile.c === c) {
            clearSwapSelection();
            return;
        }

        if (!ms.firstTile) {
            // 第一次点击：必须选有值方块
            if (!tile) return;
            ms.firstTile = { r, c, value: tile.value, el: tile.el };
            tile.el?.classList.add('tile-swap-selected');
            playTone(320, 0.1, 'sine', 0.15);
        } else {
            // 第二次点击：必须有值方块
            if (!tile) return;

            const t1 = ms.firstTile;
            const cost = getCost(MODE_SWAP);

            if (getModeSetting(MODE_SWAP, 'modeKey') === 'cost' && cost > game.score) {
                playTone(150, 0.2, 'sawtooth', 0.15);
                clearSwapSelection();
                return;
            }

            // 保存 undo state
            game.undoState = game.getState();

            applyCost(MODE_SWAP, cost);
            playTone(400, 0.12, 'sine', 0.2);

            clearSwapSelection();
            game.swapTiles(t1.r, t1.c, r, c);
            syncBoard();
            updateScore();
            updateAbilityButtons();

            exitMode();
            checkGameOverAfterAction();
        }
    };

    const clearSwapSelection = () => {
        const ms = modeState[MODE_SWAP];
        if (ms.firstTile?.el) {
            ms.firstTile.el.classList.remove('tile-swap-selected');
        }
        ms.firstTile = null;
    };

    // ===== CLEAR HANDLER =====
    const executeClear = () => {
        if (!canUse(MODE_CLEAR)) {
            playTone(150, 0.2, 'sawtooth', 0.15);
            exitMode(); return;
        }

        const removed = game.clearTiles();
        if (removed.length === 0) {
            playTone(180, 0.2, 'triangle', 0.1);
            exitMode(); return;
        }

        const totalValue = removed.reduce((s, t) => s + t.value, 0);
        const cost = getCost(MODE_CLEAR);

        if (getModeSetting(MODE_CLEAR, 'modeKey') === 'cost' && cost > game.score) {
            playTone(150, 0.2, 'sawtooth', 0.15);
            exitMode(); return;
        }

        // 保存 undo state
        game.undoState = game.getState();

        applyCost(MODE_CLEAR, cost);
        playTone(200, 0.18, 'triangle', 0.22);

        // ===== 核弹级DOM清理：隐藏→清空→重建→显示 =====
        // 原因：.tile 有 CSS transition(left/top)，浏览器移除元素时可能"粘住"旧渲染帧
        // 单纯 innerHTML='' / remove() 无法可靠地终止过渡动画的视觉残留
        const tl = byId('tile-layer');
        // ① 先隐藏整个图层（瞬间消失所有视觉，包括任何残留）
        tl.style.display = 'none';
        // ② 清空内容
        tl.innerHTML = '';
        // ③ 补上一个新方块
        game.addRandomTile();
        // ④ 从干净状态重建全部DOM
        syncBoard();
        // ⑤ 恢复显示
        tl.style.display = '';
        updateScore();
        updateAbilityButtons();
        checkGameOverAfterAction();

        exitMode();
    };

    // ===== DOUBLE HANDLER =====
    const handleDoubleClick = (r, c) => {
        if (!canUse(MODE_DOUBLE)) {
            playTone(150, 0.2, 'sawtooth', 0.15); return;
        }

        const tile = game.grid[r][c];
        // 只允许翻倍有值方块
        if (!tile) {
            playTone(150, 0.2, 'sawtooth', 0.15); return;
        }

        const cost = getCost(MODE_DOUBLE);
        if (getModeSetting(MODE_DOUBLE, 'modeKey') === 'cost' && cost > game.score) {
            playTone(150, 0.2, 'sawtooth', 0.15); return;
        }

        // 保存 undo state
        game.undoState = game.getState();

        applyCost(MODE_DOUBLE, cost);
        
        const result = game.doubleTile(r, c);
        playTone(440, 0.18, 'sine', 0.25);

        if (result.el) {
            result.el.textContent = result.newValue;
            result.el.className = `tile tile-${result.newValue > 65536 ? 'super' : result.newValue}`;
            result.el.classList.add('tile-double-pop');
            setTimeout(() => result.el?.classList.remove('tile-double-pop'), 300);
        }

        updateScore();
        updateAbilityButtons();

        exitMode();
        checkGameOverAfterAction();
    };

    // ===== TILE CLICK DISPATCHER =====
    byId('tile-layer').addEventListener('click', e => {
        if (!currentMode || gameOver || !game) return;
        if (currentMode === MODE_CLEAR) return; // 清除由确认框触发，不走点击

        const tileEl = e.target.closest('.tile');
        if (!tileEl) return;

        const r = parseInt(tileEl.dataset.row);
        const c = parseInt(tileEl.dataset.col);
        if (!(r >= 0 && r < game.size && c >= 0 && c < game.size)) return;

        switch (currentMode) {
            case MODE_SMASH:  handleSmashClick(r, c); break;
            case MODE_SWAP:   handleSwapClick(r, c); break;
            case MODE_DOUBLE: handleDoubleClick(r, c); break;
        }
    });

    // ===== MODAL SIZE =====
    byId('btn-modal-cancel').onclick = () => { byId('modal-size').classList.add('hidden'); };
    byId('modal-size').onclick = e => { if (e.target === byId('modal-size')) byId('modal-size').classList.add('hidden'); };
    byId('modal-size-grid').onclick = e => {
        const card = e.target.closest('.size-card');
        if (!card) return;
        byId('modal-size').classList.add('hidden');
        startGame(parseInt(card.getAttribute('data-size')));
    };

    // ===== TIMER =====
    const startTimer = () => {
        if (timerInterval) return;
        timerInterval = setInterval(() => { seconds++; updateTimerDisplay(); }, 1000);
    };
    const stopTimer = () => { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } };
    const resetTimer = () => { stopTimer(); seconds = 0; updateTimerDisplay(); };
    const updateTimerDisplay = () => {
        byId('timer').textContent = formatTime(seconds);
    };

    // ===== PAUSE (失焦/后台暂停计时) =====
    let isPaused = false;
    const pauseGame = () => {
        if (isPaused) return;
        stopTimer();
        isPaused = true;
        byId('pause-overlay').classList.remove('hidden');
    };
    const resumeGame = () => {
        if (!isPaused) return;
        if (!byId('page-game').classList.contains('active') || !game || gameOver) { isPaused = false; byId('pause-overlay').classList.add('hidden'); return; }
        startTimer();
        isPaused = false;
        byId('pause-overlay').classList.add('hidden');
    };
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseGame();
        else resumeGame();
    });
    byId('pause-overlay').onclick = () => resumeGame();
    byId('btn-pause').onclick = () => {
        if (!game || gameOver || isPaused) return;
        pauseGame();
    };

    // ===== KEYBOARD =====
    document.addEventListener('keydown', e => {
        if (!byId('page-game').classList.contains('active')) return;
        if (e.key === 'Escape' && currentMode) { exitMode(); e.preventDefault(); return; }
        const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
        const dir = map[e.key];
        if (dir) { e.preventDefault(); move(dir); }
    });

    // ===== GAME =====
    const startGame = size => {
        game = new Game(size);
        gameOver = false;
        hasWon = false;
        currentMode = MODE_NONE;
        resetModeState();
        Storage.clearSavedGame();

        resetTimer();
        updateScore();
        updateModeUI();
        hideHint();
        hideBackToast();

        // 推入 history state 以拦截系统返回手势
        history.pushState({ page: 'game' }, '', '');

        byId('overlay').classList.add('hidden');
        byId('pause-overlay').classList.add('hidden');
        isPaused = false;
        buildBoard();

        // 同步更新按钮状态（角标与禁用/启用由 updateAbilityButtons 统一管理，避免旧角标残留）
        updateAbilityButtons();
        showPage('game');
    };

    const buildBoard = () => {
        const sz = game.size;
        const bodyPad = window.innerWidth <= 480 ? 20 : 40;
        const maxW = Math.min(window.innerWidth - bodyPad, 500);
        // 可用高度 = 视口高度 - body padding - topbar(~56) - gaps(~64) - action-bar(~62) - hints(~40) - padding(10)
        const maxH = window.innerHeight - bodyPad - 232;
        const maxBoard = Math.max(Math.min(maxW, maxH), 200);
        cellSize = Math.floor((maxBoard - 8 * (sz + 1)) / sz);
        if (cellSize > 80) cellSize = 80;
        const total = sz * cellSize + 8 * (sz + 1);

        const board = byId('board');
        board.style.gridTemplateColumns = `repeat(${sz}, ${cellSize}px)`;
        board.style.gridTemplateRows = `repeat(${sz}, ${cellSize}px)`;
        board.style.width = `${total}px`;
        board.style.height = `${total}px`;
        board.innerHTML = '';
        for (let i = 0; i < sz * sz; i++) {
            const c = document.createElement('div');
            c.className = 'cell-bg';
            board.appendChild(c);
        }

        const tl = byId('tile-layer');
        tl.innerHTML = '';
        tl.style.width = `${sz * cellSize + 8 * (sz - 1)}px`;
        tl.style.height = `${sz * cellSize + 8 * (sz - 1)}px`;

        byId('overlay').style.width = `${total}px`;
        byId('overlay').style.height = `${total}px`;

        syncBoard();
    };

    const updateScore = () => {
        byId('score').textContent = game.score;
        const best = Storage.getBestScore(game.size);
        byId('best-score').textContent = Math.max(best, game.score);
    };

    const createTileElement = (tile) => {
        const el = document.createElement('div');
        el.className = `tile tile-${tile.value > 65536 ? 'super' : tile.value}`;
        if (tile.isNew) el.classList.add('tile-new');
        if (tile.mergedFrom) el.classList.add('tile-merged');
        
        el.style.width = `${cellSize}px`;
        el.style.height = `${cellSize}px`;
        el.style.fontSize = `${Math.max(14, Math.floor(cellSize * 0.4))}px`;
        
        updateTilePosition(el, tile.r, tile.c);
        el.textContent = tile.value;
        
        el.dataset.row = tile.r;
        el.dataset.col = tile.c;
        
        tile.el = el;
        byId('tile-layer').appendChild(el);
        return el;
    };

    const updateTilePosition = (el, r, c) => {
        el.style.left = `${c * (cellSize + 8)}px`;
        el.style.top = `${r * (cellSize + 8)}px`;
        el.dataset.row = r;
        el.dataset.col = c;
    };

    const syncBoard = () => {
        const tl = byId('tile-layer');
        tl.innerHTML = '';
        for (let r = 0; r < game.size; r++) {
            for (let c = 0; c < game.size; c++) {
                const tile = game.grid[r][c];
                if (tile) createTileElement(tile);
            }
        }
    };

    const renderMove = () => {
        const tilesToRemove = [];
        const newTiles = [];

        for (let r = 0; r < game.size; r++) {
            for (let c = 0; c < game.size; c++) {
                const tile = game.grid[r][c];
                if (!tile) continue;

                if (tile.mergedFrom) {
                    const t1 = tile.mergedFrom[0];
                    const t2 = tile.mergedFrom[1];
                    updateTilePosition(t1.el, tile.r, tile.c);
                    updateTilePosition(t2.el, tile.r, tile.c);
                    tilesToRemove.push(t1.el, t2.el);
                    const el = createTileElement(tile);
                    el.style.opacity = '0';
                    newTiles.push(el);
                } else if (tile.el) {
                    updateTilePosition(tile.el, tile.r, tile.c);
                } else {
                    newTiles.push(createTileElement(tile));
                }
            }
        }

        setTimeout(() => {
            tilesToRemove.forEach(el => el.remove());
            newTiles.forEach(el => el.style.opacity = '1');
        }, ANIM_DURATION);
    };

    const move = dir => {
        if (gameOver || currentMode) return;
        const r = game.move(dir);
        if (!r.moved) return;

        if (seconds === 0) startTimer();
        initAudio();
        playTone(200, 0.08, 'square', 0.12);
        if (r.scoreGained > 0) playTone(420, 0.14, 'square', 0.22);

        updateScore();
        updateAbilityButtons(); // ← 移动后也要刷新按钮状态
        renderMove();

        if (game.hasWon() && !hasWon) {
            hasWon = true;
            gameOver = true;
            stopTimer();
            saveScore();
            Storage.clearSavedGame();
            showOverlay('win');
        } else if (!game.canMove()) {
            gameOver = true;
            stopTimer();
            saveScore();
            Storage.clearSavedGame();
            showOverlay('lose');
        } else {
            saveCurrentGame();
        }
    };

    const saveScore = () => {
        Storage.addScore({
            score: game.score,
            gridSize: game.size,
            time: formatTime(seconds),
            date: new Date().toISOString()
        });
    };

    const showOverlay = type => {
        const o = byId('overlay'),
            t = byId('overlay-title'),
            m = byId('overlay-msg'),
            b = byId('overlay-buttons');
            
        if (type === 'win') {
            t.textContent = '恭喜！';
            m.textContent = '你达到了 2048！';
            b.innerHTML = '<button class="btn btn-primary" id="ov-continue">继续</button><button class="btn btn-secondary" id="ov-newgame">新游戏</button>';
            byId('ov-continue').onclick = () => { o.classList.add('hidden'); gameOver = false; startTimer(); };
            byId('ov-newgame').onclick = () => { byId('modal-size').classList.remove('hidden'); };
        } else if (type === 'restart') {
            t.textContent = '重新开始';
            m.textContent = '当前分数会结算到排行榜，确定要重新开始吗？';
            b.innerHTML = '<button class="btn btn-primary" id="ov-restart-ok">确定</button><button class="btn btn-secondary" id="ov-restart-cancel">取消</button>';
            byId('ov-restart-ok').onclick = () => {
                o.classList.add('hidden');
                saveScore();
                startGame(game.size);
            };
            byId('ov-restart-cancel').onclick = () => { o.classList.add('hidden'); };
        } else {
            t.textContent = '游戏结束';
            m.textContent = '没有可移动的格子了';
            b.innerHTML = '<button class="btn btn-primary" id="ov-retry">再来一局</button><button class="btn btn-secondary" id="ov-back">返回菜单</button>';
            byId('ov-retry').onclick = () => { startGame(game.size); };
            byId('ov-back').onclick = () => {
                returnToMenu();
            };
        }
        o.classList.remove('hidden');
    };

    // ===== SETTINGS: Ability Tabs =====
    let activeAbilityTab = 'smash';

    byId('ability-tabs')?.addEventListener('click', e => {
        const tab = e.target.closest('.ability-tab');
        if (!tab) return;
        const ability = tab.getAttribute('data-ability');
        activeAbilityTab = ability;

        // 切换tab高亮
        byId('ability-tabs').querySelectorAll('.ability-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 切换面板显示
        document.querySelectorAll('.ability-panel').forEach(p => p.classList.remove('active'));
        byId(`panel-${ability}`)?.classList.add('active');
    });

    // ===== SETTINGS: Mode visibility helper =====
    const updateAbilitySettingsVisibility = (ability, mode) => {
        const panel = byId(`panel-${ability}`);
        if (!panel) return;

        const rowMultiplier = panel.querySelector('[id$="-row-multiplier"]');
        const rowIncrement = panel.querySelector('[id$="-row-increment"]');
        const rowLimit = panel.querySelector('[id$="-row-limit"]');
        const settingsContainer = panel.querySelector('.mode-settings, [id$="-settings"]');

        if (!settingsContainer) return;

        if (mode === 'free') {
            settingsContainer.style.display = 'none';
        } else {
            settingsContainer.style.display = '';
            if (rowMultiplier) rowMultiplier.style.display = mode === 'cost' ? '' : 'none';
            if (rowIncrement) rowIncrement.style.display = mode === 'cost' ? '' : 'none';
            if (rowLimit) rowLimit.style.display = mode === 'limit' ? '' : 'none';
        }
    };

    // Generic mode picker handler factory
    function setupAbilityHandlers(ability) {
        const picker = byId(`${ability}-mode-picker`);
        if (!picker) return;

        const modeKey = `${ability}Mode`;
        const multKey = `${ability}Multiplier`;
        const incKey = `${ability}Increment`;
        const limitKey = `${ability}Limit`;

        picker.addEventListener('click', e => {
            const btn = e.target.closest('.mode-btn, [class*="-mode-btn"]');
            if (!btn) return;
            settings[modeKey] = btn.getAttribute('data-mode');
            Storage.saveSettings(settings);
            renderSettings();
            updateAbilitySettingsVisibility(ability, settings[modeKey]);
        });

        const multInput = byId(`${ability}-multiplier`);
        if (multInput) multInput.addEventListener('input', function() {
            settings[multKey] = parseInt(this.value) || 10;
            Storage.saveSettings(settings);
        });

        const incInput = byId(`${ability}-increment`);
        if (incInput) incInput.addEventListener('input', function() {
            settings[incKey] = parseInt(this.value) || 5;
            Storage.saveSettings(settings);
        });

        const limitInput = byId(`${ability}-limit`);
        if (limitInput) limitInput.addEventListener('input', function() {
            settings[limitKey] = parseInt(this.value) || 3;
            Storage.saveSettings(settings);
        });
    }

    // Setup handlers for all abilities
    ['smash','swap','clear','double','undo'].forEach(setupAbilityHandlers);

    const renderSettings = () => {
        byId('volume-slider').value = settings.volume;
        byId('volume-value').textContent = `${settings.volume}%`;
        byId('toggle-ask-size').checked = settings.askSize;
        
        const swatches = byId('theme-picker').querySelectorAll('.theme-swatch');
        swatches.forEach(s => {
            if (s.getAttribute('data-theme') === settings.theme) s.classList.add('active');
            else s.classList.remove('active');
        });
        
        const sizeBtns = byId('size-picker-default').querySelectorAll('.size-btn');
        sizeBtns.forEach(b => {
            if (parseInt(b.getAttribute('data-size')) === settings.gridSize) b.classList.add('active');
            else b.classList.remove('active');
        });

        // Render each ability's mode settings
        ['smash','swap','clear','double','undo'].forEach(ability => {
            const modeVal = settings[`${ability}Mode`];
            
            // 更新模式按钮active态
            const picker = byId(`${ability}-mode-picker`);
            if (picker) {
                picker.querySelectorAll('.mode-btn, [class*="-mode-btn"]').forEach(b => {
                    if (b.getAttribute('data-mode') === modeVal) b.classList.add('active');
                    else b.classList.remove('active');
                });
            }

            // 更新参数值
            const multInput = byId(`${ability}-multiplier`);
            if (multInput) multInput.value = settings[`${ability}Multiplier`];

            const incInput = byId(`${ability}-increment`);
            if (incInput) incInput.value = settings[`${ability}Increment`];

            const limitInput = byId(`${ability}-limit`);
            if (limitInput) limitInput.value = settings[`${ability}Limit`];

            // 更新可见性
            updateAbilitySettingsVisibility(ability, modeVal);
        });
    };

    byId('volume-slider').oninput = function() {
        settings.volume = parseInt(this.value);
        byId('volume-value').textContent = `${settings.volume}%`;
        Storage.saveSettings(settings);
        if (masterGain && !muted) masterGain.gain.value = settings.volume / 100;
        if (!muted && muteBtn) muteBtn.classList.remove('muted');
    };
    
    byId('toggle-ask-size').onchange = function() {
        settings.askSize = this.checked;
        Storage.saveSettings(settings);
    };
    
    byId('theme-picker').onclick = e => {
        const sw = e.target.closest('.theme-swatch');
        if (!sw) return;
        settings.theme = sw.getAttribute('data-theme');
        document.body.className = `theme-${settings.theme}`;
        Storage.saveSettings(settings);
        renderSettings();
    };
    
    byId('size-picker-default').onclick = e => {
        const btn = e.target.closest('.size-btn');
        if (!btn) return;
        settings.gridSize = parseInt(btn.getAttribute('data-size'));
        Storage.saveSettings(settings);
        renderSettings();
    };

    // ===== LEADERBOARD =====
    const renderLeaderboard = filterSize => {
        if (filterSize === undefined) filterSize = 0;
        const lb = Storage.getLeaderboard();
        const sizes = {};
        lb.forEach(e => { sizes[e.gridSize] = true; });
        const sizeList = Object.keys(sizes).map(Number).sort((a, b) => a - b);
        
        const tabs = byId('filter-tabs');
        tabs.innerHTML = `<button class="filter-tab${filterSize === 0 ? ' active' : ''}" data-size="0">全部</button>`;
        sizeList.forEach(sz => {
            tabs.innerHTML += `<button class="filter-tab${filterSize === sz ? ' active' : ''}" data-size="${sz}">${sz}x${sz}</button>`;
        });
        
        const filtered = filterSize === 0 ? lb : lb.filter(e => e.gridSize === filterSize);
        const body = byId('lb-body'),
            table = byId('lb-table'),
            empty = byId('lb-empty');
            
        if (filtered.length === 0) {
            table.style.display = 'none';
            empty.classList.remove('hidden');
        } else {
            table.style.display = '';
            empty.classList.add('hidden');
            body.innerHTML = '';
            filtered.forEach((e, i) => {
                const d = new Date(e.date);
                body.innerHTML += `
                    <tr>
                        <td class="col-rank">${i + 1}</td>
                        <td class="col-score">${e.score}</td>
                        <td>${e.gridSize}x${e.gridSize}</td>
                        <td>${e.time}</td>
                        <td>${d.getMonth() + 1}/${d.getDate()}</td>
                    </tr>
                `;
            });
        }
        
        tabs.onclick = ev => {
            const tab = ev.target.closest('.filter-tab');
            if (tab) renderLeaderboard(parseInt(tab.getAttribute('data-size')));
        };
    };

    // ===== TOUCH =====
    let tsX = 0, tsY = 0;
    
    document.addEventListener('touchstart', e => {
        tsX = e.touches[0].clientX;
        tsY = e.touches[0].clientY;
    }, { passive: true });
    
    document.addEventListener('touchmove', e => {
        if (!byId('page-game').classList.contains('active')) return;
        if (e.touches.length > 1) return;
        const target = e.target;
        // 不拦截模态框内的触摸
        if (target.closest('.modal-overlay:not(.hidden)')) return;
        // 不拦截按钮、工具栏等交互元素的触摸（避免阻止点击事件）
        if (target.closest('button, .btn, .btn-icon, .action-bar, input, label, .toggle-switch, select, textarea')) return;
        // 只拦截棋盘区域内的滑动（用于游戏控制）
        if (!target.closest('.board-wrapper')) return;
        // 能力模式下不阻止触摸移动，否则 click 事件无法触发，导致方块点击失效
        if (currentMode) return;
        e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('touchend', e => {
        if (!byId('page-game').classList.contains('active') || gameOver) return;
        if (currentMode) return; // 特殊模式下不响应滑动
        const dx = e.changedTouches[0].clientX - tsX,
            dy = e.changedTouches[0].clientY - tsY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });

    // ===== ANDROID BACK BUTTON =====
    let lastBackPress = 0;
    document.addEventListener('backbutton', () => {
        if (byId('page-game').classList.contains('active')) {
            const now = Date.now();
            if (now - lastBackPress < 2000) {
                hideBackToast();
                showExitConfirm();
                lastBackPress = 0;
            } else {
                showBackToast();
                lastBackPress = now;
            }
        } else if (byId('page-settings').classList.contains('active') ||
                   byId('page-leaderboard').classList.contains('active')) {
            showPage('menu');
        }
    });

    // ===== INIT =====
    document.body.className = `theme-${settings.theme}`;
    byId('volume-slider').value = settings.volume;
    byId('volume-value').textContent = `${settings.volume}%`;
    byId('toggle-ask-size').checked = settings.askSize;
    checkSavedGame();
    showPage('menu');

    // 窗口大小变化时重建棋盘
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (byId('page-game').classList.contains('active') && game) {
                buildBoard();
                // 重新定位所有方块
                for (let r = 0; r < game.size; r++) {
                    for (let c = 0; c < game.size; c++) {
                        const tile = game.grid[r][c];
                        if (tile && tile.el) {
                            tile.el.style.width = `${cellSize}px`;
                            tile.el.style.height = `${cellSize}px`;
                            tile.el.style.fontSize = `${Math.max(14, Math.floor(cellSize * 0.4))}px`;
                            updateTilePosition(tile.el, tile.r, tile.c);
                        }
                    }
                }
            }
        }, 150);
    });
})();
