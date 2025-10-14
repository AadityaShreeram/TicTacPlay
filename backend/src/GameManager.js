class GameManager {
  constructor() {
    this.rooms = new Map(); 
  }

  createRoom(roomId, playerX, playerO) {
    const initial = {
      board: Array(9).fill(null),
      players: { x: playerX, o: playerO },
      turn: 'x',
      status: 'playing',
      moves: []
    };
    this.rooms.set(roomId, initial);
    return initial;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  validateAndApplyMove(roomId, playerNickname, index) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing') return { ok: false, reason: 'invalid_room_or_finished' };

    const side = room.players.x === playerNickname ? 'x' : (room.players.o === playerNickname ? 'o' : null);
    if (!side) return { ok: false, reason: 'not_in_room' };
    if (room.turn !== side) return { ok: false, reason: 'not_your_turn' };
    if (index < 0 || index > 8) return { ok: false, reason: 'invalid_index' };
    if (room.board[index] !== null) return { ok: false, reason: 'cell_taken' };

    room.board[index] = side;
    room.moves.push({ by: playerNickname, side, index, at: Date.now() });

    room.turn = room.turn === 'x' ? 'o' : 'x';

    const winner = this.checkWinner(room.board);
    if (winner) {
      room.status = 'finished';
      room.winner = winner === 'draw' ? 'draw' : (winner === 'x' ? room.players.x : room.players.o);
    } else {
      if (room.board.every(cell => cell !== null)) {
        room.status = 'finished';
        room.winner = 'draw';
      }
    }

    return { ok: true, room };
  }

  checkWinner(b) {
    const lines = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];
    for (const [a,b1,c] of lines) {
      if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
    }
    if (b.every(Boolean)) return 'draw';
    return null;
  }

  listRooms() {
    return Array.from(this.rooms.entries());
  }

  removeRoom(roomId) {
    this.rooms.delete(roomId);
  }
}

module.exports = GameManager;
