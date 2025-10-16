const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const Matchmaking = require('./Matchmaking');
const GameManager = require('./GameManager');
const { recordResult, getLeaderboard, resetLeaderboard } = require('./Leaderboard');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 4000;

const gm = new GameManager();
const mm = new Matchmaking();

function makeRoomId(aSocketId, bSocketId) {
  return `room_${Date.now()}_${Math.floor(Math.random() * 10000)}_${aSocketId}_${bSocketId}`;
}

async function handleMatchFound(match) {
  const { a, b } = match;
  const roomId = makeRoomId(a.socketId, b.socketId);

  const sideA = Math.random() < 0.5 ? 'x' : 'o';
  const sideB = sideA === 'x' ? 'o' : 'x';

  const room = gm.createRoom(roomId, {
    x: sideA === 'x' ? a.nickname : b.nickname,
    o: sideA === 'o' ? a.nickname : b.nickname,
  });

  const socketA = io.sockets.sockets.get(a.socketId);
  const socketB = io.sockets.sockets.get(b.socketId);

  if (socketA) {
    socketA.data.nickname = a.nickname;
    socketA.join(roomId);
    socketA.emit('matched', {
      roomId,
      side: sideA,
      opponent: b.nickname,
    });
  }

  if (socketB) {
    socketB.data.nickname = b.nickname; 
    socketB.join(roomId);
    socketB.emit('matched', {
      roomId,
      side: sideB,
      opponent: a.nickname,
    });
  }

  console.log(`Match created: ${a.nickname} vs ${b.nickname} in room ${roomId}`);

  setTimeout(() => {
    io.to(roomId).emit('game_state', {
      board: room.board,
      turn: room.turn,
      status: room.status
    });
    console.log(`[GAME_STATE] Initial state sent to room ${roomId}`);
  }, 100);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'TicTacPlay backend is running' });
});

app.get('/leaderboard', async (req, res) => {
  try {
    const rows = await getLeaderboard(50);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/reset', async (req, res) => {
  try {
    await resetLeaderboard();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('get-session-nickname', async (callback) => {
    try {
      const nickname = await mm.getNicknameBySocket(socket.id);
      callback({ nickname: nickname || null });
    } catch (error) {
      console.error('Error getting session nickname:', error);
      callback({ nickname: null });
    }
  });

  socket.on('check-nickname', async (nickname, callback) => {
    try {
      if (!nickname || nickname.trim().length === 0) {
        return callback({ error: 'Nickname cannot be empty' });
      }

      if (nickname.length > 64) {
        return callback({ error: 'Nickname too long' });
      }

      const available = await mm.isNicknameAvailable(nickname, socket.id);
      callback({ available });
    } catch (error) {
      console.error('Error checking nickname:', error);
      callback({ error: 'Error checking nickname' });
    }
  });

  socket.on('reserve-nickname', async (nickname, callback) => {
    try {
      if (!nickname || nickname.trim().length === 0) {
        return callback({ success: false, error: 'Nickname cannot be empty' });
      }

      if (nickname.length > 64) {
        return callback({ success: false, error: 'Nickname too long' });
      }

      const reserved = await mm.reserveNickname(socket.id, nickname);

      if (reserved) {
        socket.data.nickname = reserved;
        console.log(`[RESERVE] Set socket.data.nickname for ${socket.id} to ${reserved}`);

        callback({ success: true, nickname: reserved });
      } else {
        callback({ success: false, error: 'Nickname already taken' });
      }
    } catch (error) {
      console.error('Error reserving nickname:', error);
      callback({ success: false, error: 'Error reserving nickname' });
    }
  });

  socket.on('find_match', async ({ nickname }) => {
    try {
      const reservedNickname = await mm.getNicknameBySocket(socket.id);

      if (!reservedNickname || reservedNickname.toLowerCase() !== (nickname || '').toLowerCase()) {
        socket.emit('error_msg', { message: 'nickname_not_reserved' });
        return;
      }

      socket.data.nickname = reservedNickname;
      console.log(`[FIND_MATCH] Set socket.data.nickname for ${socket.id} to ${reservedNickname}`);

      await mm.enqueue({ socketId: socket.id, nickname: reservedNickname });
      console.log(`${reservedNickname} entered matchmaking queue`);

      const match = await mm.tryMatch();
      if (match) {
        await handleMatchFound(match);
      }
    } catch (error) {
      console.error('Error in find_match:', error);
      socket.emit('error_msg', { message: 'Error finding match' });
    }
  });

  socket.on('cancel_search', async () => {
    await mm.removeBySocket(socket.id);
    socket.emit('search_cancelled');
  });

  socket.on('move_made', async ({ roomId, index }) => {
    const nickname = socket.data.nickname;
    console.log(`[MOVE] Socket ${socket.id} attempting move. Nickname: ${nickname}`);
    
    if (!nickname) {
      console.error(`[MOVE] ✗ No nickname found for socket ${socket.id}`);
      socket.emit('move_rejected', { reason: 'unknown_player' });
      return;
    }

    const result = gm.validateAndApplyMove(roomId, nickname, index);
    if (!result.ok) {
      console.error(`[MOVE] ✗ Move rejected: ${result.reason}`);
      socket.emit('move_rejected', { reason: result.reason });
      return;
    }

    console.log(`[MOVE] ✓ Move accepted for ${nickname} at index ${index}`);
    const room = result.room;
    io.to(roomId).emit('game_state', { board: room.board, turn: room.turn, status: room.status });

    if (room.status === 'finished') {
      try {
        await recordResult({ x: room.players.x, o: room.players.o, winner: room.winner, moves: room.moves });
      } catch (err) {
        console.error('Error recording result:', err);
      }

      io.to(roomId).emit('game_over', { winner: room.winner });
      setTimeout(() => gm.removeRoom(roomId), 60_000);
    }
  });

  socket.on('disconnect', async () => {
    try {
      await mm.removeBySocket(socket.id);
      await mm.releaseNickname(socket.id);
      console.log(`Socket ${socket.id} disconnected and cleaned up`);
    } catch (error) {
      console.error('Error on disconnect:', error);
    }
  });
});

server.listen(PORT, () => console.log(`TicTacPlay backend listening on ${PORT}`));