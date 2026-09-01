const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../js/game.js');

function validSave(size = 4) {
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    grid[0][0] = { value: 2, r: 99, c: 99, mergedFrom: [{ value: 2 }] };
    return { size, grid, score: 16, won: false, undoState: null };
}

test('restores a valid save and rebuilds trusted tile coordinates', () => {
    const game = Game.fromSavedState(validSave());
    assert.ok(game);
    assert.equal(game.size, 4);
    assert.deepEqual(game.grid[0][0], { value: 2, r: 0, c: 0, mergedFrom: null, isNew: false });
});

test('rejects oversized boards before allocating a game grid', () => {
    const save = validSave();
    save.size = 1000000;
    assert.equal(Game.fromSavedState(save), null);
});

test('rejects malformed grids, unsafe scores, and invalid tile values', () => {
    const malformedGrid = validSave();
    malformedGrid.grid.pop();
    assert.equal(Game.fromSavedState(malformedGrid), null);

    const unsafeScore = validSave();
    unsafeScore.score = Infinity;
    assert.equal(Game.fromSavedState(unsafeScore), null);

    const invalidTile = validSave();
    invalidTile.grid[0][0].value = 3;
    assert.equal(Game.fromSavedState(invalidTile), null);
});

test('drops an invalid undo snapshot without losing a valid current game', () => {
    const save = validSave();
    save.undoState = { grid: [], score: 0, won: false };
    const game = Game.fromSavedState(save);
    assert.ok(game);
    assert.equal(game.undoState, null);
});
