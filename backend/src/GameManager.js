class GameManager {
  constructor() {
    this.rooms = new Map(); 
  }

  createRoom(roomId, players) {
    const initial = {
      board: Array(9).fill(null),
      players: players, 
      turn: 'x',
      status: 'playing',
      moves: []
    };
    this.rooms.set(roomId, initial);
    console.log(`[ROOM_CREATED] ${roomId}:`, initial);
    return initial;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  validateAndApplyMove(roomId, playerNickname, index) {
    const room = this.rooms.get(roomId);
    console.log(`[VALIDATE_MOVE] Room:`, room);
    console.log(`[VALIDATE_MOVE] Player: ${playerNickname}, Index: ${index}`);
    
    if (!room || room.status !== 'playing') {
      console.log(`[VALIDATE_MOVE] ✗ Invalid room or finished`);
      return { ok: false, reason: 'invalid_room_or_finished' };
    }

    const side = room.players.x === playerNickname ? 'x' : (room.players.o === playerNickname ? 'o' : null);
    console.log(`[VALIDATE_MOVE] Player side: ${side}`);
    
    if (!side) {
      console.log(`[VALIDATE_MOVE] ✗ Player not in room`);
      return { ok: false, reason: 'not_in_room' };
    }
    
    if (room.turn !== side) {
      console.log(`[VALIDATE_MOVE] ✗ Not player's turn (turn: ${room.turn}, side: ${side})`);
      return { ok: false, reason: 'not_your_turn' };
    }
    
    if (index < 0 || index > 8) {
      console.log(`[VALIDATE_MOVE] ✗ Invalid index`);
      return { ok: false, reason: 'invalid_index' };
    }
    
    if (room.board[index] !== null) {
      console.log(`[VALIDATE_MOVE] ✗ Cell already taken`);
      return { ok: false, reason: 'cell_taken' };
    }

    room.board[index] = side;
    room.moves.push({ by: playerNickname, side, index, at: Date.now() });

    room.turn = room.turn === 'x' ? 'o' : 'x';
    console.log(`[VALIDATE_MOVE] ✓ Move applied. Next turn: ${room.turn}`);

    const winner = this.checkWinner(room.board);
    if (winner) {
      room.status = 'finished';
      room.winner = winner === 'draw' ? 'draw' : (winner === 'x' ? room.players.x : room.players.o);
      console.log(`[GAME_OVER] Winner: ${room.winner}`);
    } else {
      if (room.board.every(cell => cell !== null)) {
        room.status = 'finished';
        room.winner = 'draw';
        console.log(`[GAME_OVER] Draw`);
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
    console.log(`[ROOM_REMOVED] ${roomId}`);
  }
}

module.exports = GameManager;