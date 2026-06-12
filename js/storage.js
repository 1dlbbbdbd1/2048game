// 2048 v1.3.5 稳定版 - 优化游戏扣分模式平衡性设定
const Storage = (() => {
    const SETTINGS_KEY = 'tcs_settings';
    const LEADERBOARD_KEY = 'tcs_leaderboard';
    const BEST_SCORE_KEY = 'tcs_best_score';

    const defaultSettings = {
        gridSize: 4,
        volume: 70,
        theme: 'classic',
        askSize: true,
        // 敲击模式
        smashMode: 'cost',
        smashMultiplier: 5,
        smashIncrement: 50,
        smashLimit: 3,
        // 交换模式
        swapMode: 'cost',
        swapMultiplier: 5,
        swapIncrement: 50,
        swapLimit: 3,
        // 清除模式
        clearMode: 'cost',
        clearMultiplier: 5,
        clearIncrement: 50,
        clearLimit: 3,
        // 翻倍模式
        doubleMode: 'cost',
        doubleMultiplier: 5,
        doubleIncrement: 50,
        doubleLimit: 3,
        // 撤销模式
        undoMode: 'cost',
        undoMultiplier: 5,
        undoIncrement: 50,
        undoLimit: 3,
        // 配置版本号（用于版本迁移，确保新默认设置对所有用户生效）
        version: 2
    };

    function getSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // 版本迁移：如果本地设置版本号小于新默认值的版本号，
                // 则将道具相关字段重置为最新默认值，确保所有用户都能享受到平衡设置
                // （保留用户已自定义的棋盘大小、音量、主题等基础设置）
                const currentVersion = parsed.version || 1;
                const targetVersion = defaultSettings.version || 1;
                if (currentVersion < targetVersion) {
                    const abilityKeys = [
                        'smashMode', 'smashMultiplier', 'smashIncrement', 'smashLimit',
                        'swapMode', 'swapMultiplier', 'swapIncrement', 'swapLimit',
                        'clearMode', 'clearMultiplier', 'clearIncrement', 'clearLimit',
                        'doubleMode', 'doubleMultiplier', 'doubleIncrement', 'doubleLimit',
                        'undoMode', 'undoMultiplier', 'undoIncrement', 'undoLimit'
                    ];
                    abilityKeys.forEach(key => { delete parsed[key]; });
                    parsed.version = targetVersion;
                    try {
                        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, ...parsed }));
                    } catch (e) {}
                }
                return { ...defaultSettings, ...parsed };
            }
        } catch (e) {}
        return { ...defaultSettings };
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    function getLeaderboard() {
        try {
            const raw = localStorage.getItem(LEADERBOARD_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}
        return [];
    }

    function addScore(entry) {
        let lb = getLeaderboard();
        lb.push({
            score: entry.score,
            gridSize: entry.gridSize,
            time: entry.time,
            date: entry.date || new Date().toISOString()
        });
        lb.sort((a, b) => b.score - a.score);
        if (lb.length > 50) lb = lb.slice(0, 50);
        try {
            localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb));
        } catch (e) {}
        
        // Update best score for this grid size
        updateBestScore(entry.gridSize, entry.score);
    }

    function getBestScore(gridSize) {
        try {
            const raw = localStorage.getItem(BEST_SCORE_KEY);
            if (raw) {
                const scores = JSON.parse(raw);
                return scores[gridSize] || 0;
            }
        } catch (e) {}
        return 0;
    }

    function updateBestScore(gridSize, score) {
        try {
            const raw = localStorage.getItem(BEST_SCORE_KEY);
            let scores = raw ? JSON.parse(raw) : {};
            if (!scores[gridSize] || score > scores[gridSize]) {
                scores[gridSize] = score;
                localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(scores));
            }
        } catch (e) {}
    }

    function clearLeaderboard() {
        try {
            localStorage.removeItem(LEADERBOARD_KEY);
        } catch (e) {}
    }

    return {
        getSettings,
        saveSettings,
        getLeaderboard,
        addScore,
        getBestScore,
        clearLeaderboard
    };
})();
