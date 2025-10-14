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

  socket.on('find_match', async ({ nickname }) => {
    if (!nickname) {
      socket.emit('error_msg', { message: 'nickname_required' });
      return;
    }

    socket.data.nickname = nickname;

    await mm.enqueue({ socketId: socket.id, nickname });

    const pair = await mm.tryMatch();
    if (pair) {
      const { a, b } = pair;
      const roomId = makeRoomId(a.socketId, b.socketId);
      const playerX = a.nickname;
      const playerO = b.nickname;

      gm.createRoom(roomId, playerX, playerO);

      const sa = io.sockets.sockets.get(a.socketId);
      const sb = io.sockets.sockets.get(b.socketId);

      if (sa) {
        sa.join(roomId);
        sa.emit('matched', { roomId, side: 'x', opponent: playerO });
        sa.data.nickname = playerX;
      }
      if (sb) {
        sb.join(roomId);
        sb.emit('matched', { roomId, side: 'o', opponent: playerX });
        sb.data.nickname = playerO;
      }

      const room = gm.getRoom(roomId);
      io.to(roomId).emit('game_state', { board: room.board, turn: room.turn, status: room.status });
    } else {
      socket.emit('queued');
    }
  });

  socket.on('cancel_search', async () => {
    await mm.removeBySocket(socket.id);
    socket.emit('search_cancelled');
  });

  socket.on('move_made', async ({ roomId, index }) => {
    const nickname = socket.data.nickname;
    if (!nickname) {
      socket.emit('move_rejected', { reason: 'unknown_player' });
      return;
    }
    const result = gm.validateAndApplyMove(roomId, nickname, index);
    if (!result.ok) {
      socket.emit('move_rejected', { reason: result.reason });
      return;
    }

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

  socket.on('disconnect', async (reason) => {
    console.log('socket disconnected', socket.id, reason);
    await mm.removeBySocket(socket.id);

    const nickname = socket.data.nickname;

    for (const [roomId, r] of gm.rooms.entries()) {
      if (!r) continue;
      if (r.status === 'playing' && (r.players.x === nickname || r.players.o === nickname)) {
        r.status = 'finished';
        r.winner = (r.players.x === nickname) ? r.players.o : r.players.x;
        io.to(roomId).emit('game_over', { winner: r.winner, reason: 'opponent_disconnected' });

        try {
          await recordResult({ x: r.players.x, o: r.players.o, winner: r.winner, moves: r.moves });
        } catch (err) {
          console.error('Error recording result after disconnect:', err);
        }
        gm.removeRoom(roomId);
      }
    }
  });
});

server.listen(PORT, () => console.log(`TicTacPlay backend listening on ${PORT}`));
