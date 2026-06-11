class Game {
    constructor(size = 4) {
        this.size = size;
        this.grid = [];
        this.score = 0;
        this.won = false;
        this.undoState = null;
        this.init();
    }

    init() {
        this.grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
        this.score = 0;
        this.won = false;
        this.undoState = null;
        this.addRandomTile();
        this.addRandomTile();
    }

    addRandomTile() {
        const empty = [];
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (!this.grid[r][c]) empty.push({ r, c });
            }
        }
        if (empty.length === 0) return;
        const { r, c } = empty[Math.floor(Math.random() * empty.length)];
        this.grid[r][c] = {
            value: Math.random() < 0.9 ? 2 : 4,
            r,
            c,
            mergedFrom: null,
            isNew: true
        };
    }

    move(direction) {
        // Save state for undo
        this.undoState = this.getState();

        const vector = this.getVector(direction);
        const traversals = this.buildTraversals(vector);
        let moved = false;
        let scoreGained = 0;

        // Reset tile states
        this.prepareTiles();

        traversals.r.forEach(r => {
            traversals.c.forEach(c => {
                const tile = this.grid[r][c];
                if (tile) {
                    const positions = this.findFarthestPosition({ r, c }, vector);
                    const next = this.grid[positions.next.r]?.[positions.next.c];

                    if (next && next.value === tile.value && !next.mergedFrom) {
                        const merged = {
                            value: tile.value * 2,
                            r: positions.next.r,
                            c: positions.next.c,
                            mergedFrom: [tile, next]
                        };

                        this.grid[merged.r][merged.c] = merged;
                        this.grid[tile.r][tile.c] = null;

                        tile.r = merged.r;
                        tile.c = merged.c;

                        scoreGained += merged.value;
                        moved = true;

                        if (merged.value === 2048) this.won = true;
                    } else {
                        if (positions.farthest.r !== r || positions.farthest.c !== c) {
                            this.grid[positions.farthest.r][positions.farthest.c] = tile;
                            this.grid[r][c] = null;
                            tile.r = positions.farthest.r;
                            tile.c = positions.farthest.c;
                            moved = true;
                        }
                    }
                }
            });
        });

        if (moved) {
            this.score += scoreGained;
            this.addRandomTile();
        } else {
            this.undoState = null; // Don't save undo if no move happened
        }

        return { moved, scoreGained, won: this.won };
    }

    prepareTiles() {
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.grid[r][c]) {
                    this.grid[r][c].mergedFrom = null;
                    this.grid[r][c].isNew = false;
                }
            }
        }
    }

    getVector(direction) {
        const map = {
            up: { r: -1, c: 0 },
            right: { r: 0, c: 1 },
            down: { r: 1, c: 0 },
            left: { r: 0, c: -1 }
        };
        return map[direction];
    }

    buildTraversals(vector) {
        const traversals = {
            r: Array.from({ length: this.size }, (_, i) => i),
            c: Array.from({ length: this.size }, (_, i) => i)
        };

        if (vector.r === 1) traversals.r.reverse();
        if (vector.c === 1) traversals.c.reverse();

        return traversals;
    }

    findFarthestPosition(pos, vector) {
        let previous;
        do {
            previous = pos;
            pos = { r: previous.r + vector.r, c: previous.c + vector.c };
        } while (this.withinBounds(pos) && !this.grid[pos.r][pos.c]);

        return {
            farthest: previous,
            next: pos
        };
    }

    withinBounds(pos) {
        return pos.r >= 0 && pos.r < this.size && pos.c >= 0 && pos.c < this.size;
    }

    canMove() {
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                const tile = this.grid[r][c];
                if (!tile) return true;
                for (let i = 0; i < 4; i++) {
                    const dir = ['up', 'right', 'down', 'left'][i];
                    const vector = this.getVector(dir);
                    const target = { r: r + vector.r, c: c + vector.c };
                    if (this.withinBounds(target)) {
                        const next = this.grid[target.r][target.c];
                        if (!next || next.value === tile.value) return true;
                    }
                }
            }
        }
        return false;
    }

    hasWon() {
        return this.won;
    }

    getState() {
        return {
            grid: JSON.parse(JSON.stringify(this.grid)),
            score: this.score,
            won: this.won
        };
    }

    restoreState(state) {
        this.grid = JSON.parse(JSON.stringify(state.grid));
        this.score = state.score;
        this.won = state.won;
    }

    undo() {
        if (!this.undoState) return false;
        this.restoreState(this.undoState);
        this.undoState = null;
        return true;
    }

    smashTile(r, c) {
        if (!this.grid[r][c]) return null;
        
        const tile = this.grid[r][c];
        const value = tile.value;
        
        this.grid[r][c] = null;
        
        return { value, r, c };
    }

    swapTiles(r1, c1, r2, c2) {
        const t1 = this.grid[r1][c1];
        const t2 = this.grid[r2][c2];
        if (!t1 && !t2) return false;

        this.grid[r1][c1] = t2;
        this.grid[r2][c2] = t1;

        if (t1) { t1.r = r2; t1.c = c2; }
        if (t2) { t2.r = r1; t2.c = c1; }

        return true;
    }

    clearTiles() {
        const removed = [];
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                const tile = this.grid[r][c];
                if (tile && (tile.value === 2 || tile.value === 4)) {
                    removed.push({ value: tile.value, r, c, el: tile.el });
                    this.grid[r][c] = null;
                }
            }
        }
        return removed;
    }

    doubleTile(r, c) {
        const tile = this.grid[r][c];
        if (!tile) return null;
        const oldValue = tile.value;
        tile.value *= 2;
        return { oldValue, newValue: tile.value, r, c, el: tile.el };
    }

    getBoardSum() {
        let sum = 0;
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.grid[r][c]) sum += this.grid[r][c].value;
            }
        }
        return sum;
    }
}
