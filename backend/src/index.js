const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const Matchmaking = require("./Matchmaking");
const GameManager = require("./GameManager");
const { recordResult, getLeaderboard, resetLeaderboard } = require("./Leaderboard");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://tictacplay-production.up.railway.app",
  "http://tictacplay-production.up.railway.app"
];

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ["polling", "websocket"],
  allowEIO3: true,
  pingTimeout: 30000,
  pingInterval: 10000
});

const PORT = process.env.PORT || 4000;

const gm = new GameManager();
const mm = new Matchmaking();

const activeRoomCodes = new Set();
const playAgainRequests = new Map();

async function broadcastLeaderboard() {
  try {
    const leaderboard = await getLeaderboard(50);
    console.log(`[LEADERBOARD] Broadcasting to all clients (${leaderboard.length} entries)`);
    io.emit("leaderboard_update", leaderboard);
  } catch (err) {
    console.error("[LEADERBOARD] Error broadcasting:", err);
  }
}

function generateRoomCode(length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;

  let attempts = 0;
  while (attempts < 100) {
    const code = Math.floor(min + Math.random() * (max - min + 1)).toString();
    if (!activeRoomCodes.has(code) && !gm.getRoom(code)) {
      activeRoomCodes.add(code);
      return code;
    }
    attempts++;
  }
  console.warn("[ROOM_CODE] Could not generate unique short code, using fallback");
  return `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function releaseRoomCode(roomId) {
  activeRoomCodes.delete(roomId);
  console.log(`[ROOM_CODE] Released: ${roomId}`);
}

function makeRoomId(aSocketId, bSocketId) {
  return `room_${Date.now()}_${Math.floor(Math.random() * 10000)}_${aSocketId}_${bSocketId}`;
}

function isCustomRoom(roomId) {
  return /^\d{4,6}$/.test(roomId);
}

async function handleMatchFound(match) {
  const { a, b } = match;
  const roomId = makeRoomId(a.socketId, b.socketId);

  const sideA = Math.random() < 0.5 ? "x" : "o";
  const sideB = sideA === "x" ? "o" : "x";

  const socketA = io.sockets.sockets.get(a.socketId);
  const socketB = io.sockets.sockets.get(b.socketId);
  if (!socketA || !socketB) return console.warn("[MATCH ERROR] Missing socket");

  await Promise.all([socketA.join(roomId), socketB.join(roomId)]);
  socketA.data.nickname = a.nickname;
  socketB.data.nickname = b.nickname;
  socketA.data.roomId = roomId;
  socketB.data.roomId = roomId;

  console.log(`[MATCH] ${a.nickname} vs ${b.nickname} joining ${roomId}`);

  const room = gm.createRoom(roomId, {
    x: sideA === "x" ? a.nickname : b.nickname,
    o: sideA === "o" ? a.nickname : b.nickname,
  });
  room.startTime = Date.now(); 
  socketA.emit("matched", { roomId, side: sideA, opponent: b.nickname });
  socketB.emit("matched", { roomId, side: sideB, opponent: a.nickname });

  setTimeout(() => {
    io.to(roomId).emit("game_state", {
      board: room.board,
      turn: room.turn,
      status: room.status,
    });
  }, 50);
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "TicTacPlay backend running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "TicTacPlay backend running" });
});

app.get("/leaderboard", async (req, res) => {
  try {
    const leaderboard = await getLeaderboard(50);
    res.json(leaderboard);
  } catch (err) {
    console.error("[LEADERBOARD ERROR]", err);
    res.status(500).json({ error: "db_error", message: err.message });
  }
});

app.post("/reset", async (req, res) => {
  try {
    await resetLeaderboard();
    await broadcastLeaderboard(); 
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

io.on("connection", (socket) => {
  console.log("[CONNECTED]", socket.id, "Transport:", socket.conn.transport.name);

  getLeaderboard(50).then(leaderboard => {
    socket.emit("leaderboard_update", leaderboard);
  }).catch(err => {
    console.error("[LEADERBOARD] Error sending to new client:", err);
  });

  socket.on("get-session-nickname", async (callback) => {
    try {
      const nickname = await mm.getNicknameBySocket(socket.id);
      callback({ nickname: nickname || null });
    } catch (error) {
      console.error("Error getting session nickname:", error);
      callback({ nickname: null });
    }
  });

  socket.on("check-nickname", async (nickname, callback) => {
    if (!nickname?.trim()) return callback({ error: "Nickname required" });
    if (nickname.length > 64) return callback({ error: "Nickname too long" });
    try {
      const available = await mm.isNicknameAvailable(nickname, socket.id);
      callback({ available });
    } catch (error) {
      console.error("Error checking nickname:", error);
      callback({ error: "Error checking nickname" });
    }
  });

  socket.on("reserve-nickname", async (nickname, callback) => {
    if (!nickname?.trim()) return callback({ success: false, error: "Empty nickname" });
    if (nickname.length > 64) return callback({ success: false, error: "Too long" });
    try {
      const reserved = await mm.reserveNickname(socket.id, nickname);
      if (!reserved) return callback({ success: false, error: "Taken" });
      socket.data.nickname = reserved;
      console.log(`[RESERVE] ${socket.id} reserved nickname ${reserved}`);
      callback({ success: true, nickname: reserved });
    } catch (err) {
      console.error("Error reserving nickname:", err);
      callback({ success: false, error: "Internal error" });
    }
  });

  socket.on("find_match", async ({ nickname }) => {
    try {
      const reservedNickname = await mm.getNicknameBySocket(socket.id);
      if (!reservedNickname || reservedNickname.toLowerCase() !== nickname.toLowerCase()) {
        socket.emit("error_msg", { message: "nickname_not_reserved" });
        return;
      }
      socket.data.nickname = reservedNickname;
      console.log(`[FIND_MATCH] ${reservedNickname} entered queue`);
      await mm.enqueue({ socketId: socket.id, nickname: reservedNickname });

      const match = await mm.tryMatch();
      if (match) await handleMatchFound(match);
    } catch (err) {
      console.error("Error in find_match:", err);
      socket.emit("error_msg", { message: "Error finding match" });
    }
  });

  socket.on("cancel_search", async () => {
    await mm.removeBySocket(socket.id);
    socket.emit("search_cancelled");
  });

  socket.on("create_room", async ({ nickname }, callback) => {
    console.log(`[CREATE_ROOM] request from ${nickname}`);
    await mm.removeBySocket(socket.id);

    const reserved = await mm.reserveNickname(socket.id, nickname);
    if (!reserved) return callback({ error: "Nickname taken" });
    socket.data.nickname = reserved;

    const roomId = generateRoomCode(6);
    await socket.join(roomId);
    socket.data.roomId = roomId;

    const room = gm.createRoom(roomId, { x: reserved, o: null });
    room.status = "waiting";

    console.log(`[CUSTOM_ROOM_CREATED] ${roomId} by ${reserved}`);
    socket.emit("room_created", { roomId, host: reserved });
    callback({ success: true, roomId });
  });

  socket.on("join_room", async ({ nickname, roomId }, callback) => {
    if (!nickname || !roomId) return callback({ error: "Missing fields" });

    const room = gm.getRoom(roomId);
    if (!room) return callback({ error: "Room not found" });
    if (room.players.o) return callback({ error: "Room full" });
    if (room.status !== "waiting") return callback({ error: "Game already started" });

    room.players.o = nickname;
    room.status = "playing";
    room.startTime = Date.now(); 

    const host = room.players.x;
    const socketHost = [...io.sockets.sockets.values()].find(
      (s) => s.data.nickname?.toLowerCase() === host.toLowerCase()
    );

    socket.data.nickname = nickname;
    socket.data.roomId = roomId;
    await socket.join(roomId);

    socket.emit("matched", { roomId, side: "o", opponent: host });
    if (socketHost) socketHost.emit("matched", { roomId, side: "x", opponent: nickname });

    setTimeout(() => {
      io.to(roomId).emit("game_state", {
        board: room.board,
        turn: room.turn,
        status: room.status,
      });
    }, 100);

    callback({ success: true });
  });

  socket.on("request_game_state", ({ roomId }) => {
    const room = gm.getRoom(roomId);
    if (room)
      socket.emit("game_state", {
        board: room.board,
        turn: room.turn,
        status: room.status,
      });
  });

  socket.on("move_made", async ({ roomId, index }) => {
    const nickname = socket.data.nickname;
    if (!nickname || !socket.rooms.has(roomId)) {
      socket.emit("move_rejected", { reason: "not_in_room" });
      return;
    }

    const result = gm.validateAndApplyMove(roomId, nickname, index);
    if (!result.ok) return socket.emit("move_rejected", { reason: result.reason });

    const room = result.room;
    io.to(roomId).emit("game_state", {
      board: room.board,
      turn: room.turn,
      status: room.status,
    });

    if (room.status === "finished") {
      console.log("[GAME_OVER] Attempting to record result for room:", roomId, "Winner:", room.winner, "Duration:", room.duration, "Players:", room.players, "Moves:", room.moves);
      try {
        if (!room.players.x || !room.players.o) {
          console.warn("[GAME_OVER] Missing players:", room.players);
          return;
        }
        if (typeof room.duration !== "number" || room.duration < 0) {
          console.warn("[GAME_OVER] Invalid duration:", room.duration, "Defaulting to 0");
          room.duration = 0;
        }
        await recordResult({
          x: room.players.x,
          o: room.players.o,
          winner: room.winner || "draw",
          moves: room.moves || [],
          duration: room.duration,
        });
        console.log("[GAME_OVER] Result recorded successfully for room:", roomId);
        await broadcastLeaderboard();
      } catch (err) {
        console.error("[GAME_OVER] Error recording result:", err);
      }

      io.to(roomId).emit("game_over", { winner: room.winner });

      const checkCleanup = async () => {
        const sockets = [...io.sockets.sockets.values()];
        const playerSockets = sockets.filter(
          (s) =>
            s.data.roomId === roomId &&
            [room.players.x, room.players.o].includes(s.data.nickname)
        );

        if (playerSockets.length === 0) {
          gm.removeRoom(roomId);
          releaseRoomCode(roomId);
          playAgainRequests.delete(roomId);
          console.log(`[CLEANUP] Room ${roomId} removed after both players left`);
        } else {
          console.log(
            `[CLEANUP CHECK] Room ${roomId} still has ${playerSockets.length} player(s) connected`
          );
          setTimeout(checkCleanup, 60_000);
        }
      };

      setTimeout(checkCleanup, 100);
    }
  });

  socket.on("play_again", async ({ roomId, isCustomRoom: clientIsCustom }) => {
    const nickname = socket.data.nickname;
    if (!nickname) return;

    const isCustom = clientIsCustom || (roomId && isCustomRoom(roomId));

    if (isCustom) {
      const room = gm.getRoom(roomId);
      if (!room) {
        socket.emit("error_msg", { message: "room_not_found" });
        return;
      }
      if (!playAgainRequests.has(roomId)) playAgainRequests.set(roomId, new Set());
      const requestSet = playAgainRequests.get(roomId);

      requestSet.add(nickname);
      console.log(`[PLAY_AGAIN] ${nickname} requested rematch in custom room ${roomId}`);

      const opponent = room.players.x === nickname ? room.players.o : room.players.x;
      if (!opponent) {
        socket.emit("error_msg", { message: "opponent_not_found" });
        return;
      }

      const opponentSocket = [...io.sockets.sockets.values()].find(
        (s) => s.data.nickname === opponent
      );

      if (opponentSocket) {
        opponentSocket.emit("play_again_request", { from: nickname, roomId });
      } else {
        socket.emit("error_msg", { message: "opponent_disconnected" });
        return;
      }

      if (requestSet.has(room.players.x) && requestSet.has(room.players.o)) {
        console.log(`[PLAY_AGAIN] Both players ready in custom room → restarting ${roomId}`);

        gm.resetRoom(roomId);
        const newRoom = gm.getRoom(roomId);
        playAgainRequests.delete(roomId);

        const sideA = Math.random() < 0.5 ? "x" : "o";
        const sideB = sideA === "x" ? "o" : "x";

        const socketA = [...io.sockets.sockets.values()].find(
          (s) => s.data.nickname === room.players.x
        );
        const socketB = [...io.sockets.sockets.values()].find(
          (s) => s.data.nickname === room.players.o
        );

        if (!socketA || !socketB) {
          console.warn(`[PLAY_AGAIN] Missing sockets for rematch ${roomId}`);
          return;
        }

        socketA.emit("matched", {
          roomId,
          side: sideA,
          opponent: room.players.o,
        });
        socketB.emit("matched", {
          roomId,
          side: sideB,
          opponent: room.players.x,
        });

        setTimeout(() => {
          io.to(roomId).emit("game_state", {
            board: newRoom.board,
            turn: newRoom.turn,
            status: newRoom.status,
          });
        }, 50);
      } else {
        socket.emit("waiting_for_opponent", { opponent });
      }
    } else {
      console.log(`[PLAY_AGAIN] ${nickname} entering matchmaking for new opponent`);

      if (roomId) {
        socket.leave(roomId);
        socket.data.roomId = null;

        const room = gm.getRoom(roomId);
        if (room) {
          const playerSockets = [...io.sockets.sockets.values()].filter(
            (s) => s.data.roomId === roomId
          );

          if (playerSockets.length === 0) {
            gm.removeRoom(roomId);
            playAgainRequests.delete(roomId);
            console.log(`[PLAY_AGAIN] Room ${roomId} cleaned up`);
          }
        }
      }

      socket.emit("searching_again");
      await mm.enqueue({ socketId: socket.id, nickname });

      const match = await mm.tryMatch();
      if (match) await handleMatchFound(match);
    }
  });

  socket.on("leave_room", async ({ roomId }) => {
    const nickname = socket.data.nickname;
    console.log(`[LEAVE_ROOM] ${nickname} leaving room ${roomId}`);
    
    if (!roomId || !socket.rooms.has(roomId)) return;

    const room = gm.getRoom(roomId);
    const isCustom = isCustomRoom(roomId);

    socket.leave(roomId);
    socket.data.roomId = null;

    if (!room) return;

    if (isCustom && room.status === "waiting") {
      gm.removeRoom(roomId);
      releaseRoomCode(roomId);
      console.log(`[LEAVE_ROOM] Cleaned up waiting custom room ${roomId}`);
      return;
    }

    if (room.status === "playing") {
      const opponent = room.players.x === nickname ? room.players.o : room.players.x;

      const opponentSocket = [...io.sockets.sockets.values()].find(
        (s) => s.data.nickname === opponent && s.rooms.has(roomId)
      );

      if (opponentSocket) {
        opponentSocket.emit("opponent_left", { winner: opponent });
        opponentSocket.leave(roomId);
        opponentSocket.data.roomId = null;
      }

      room.endTime = Date.now();
      room.duration = room.startTime ? (room.endTime - room.startTime) / 1000 : 0;
      room.status = "finished";
      room.winner = opponent || "draw";

      console.log("[LEAVE_ROOM] Recording result for room:", roomId);
      try {
        if (room.players.x && room.players.o) {
          await recordResult({
            x: room.players.x,
            o: room.players.o,
            winner: room.winner,
            moves: room.moves || [],
            duration: room.duration,
          });
          await broadcastLeaderboard();
        }
      } catch (err) {
        console.error("[LEAVE_ROOM] Error recording result:", err);
      }

      gm.removeRoom(roomId);
      if (isCustom) releaseRoomCode(roomId);
      playAgainRequests.delete(roomId);
    }
  });

  socket.on("leave_game", async ({ roomId, nickname }) => {
    console.log(`[LEAVE_GAME] ${nickname} leaving room ${roomId}`);
    if (!roomId || !socket.rooms.has(roomId)) return;

    const room = gm.getRoom(roomId);
    if (!room || room.status !== "playing") return;

    const opponent = room.players.x === nickname ? room.players.o : room.players.x;
    socket.leave(roomId);
    socket.data.roomId = null;

    const opponentSocket = [...io.sockets.sockets.values()].find(
      (s) => s.data.nickname === opponent && s.rooms.has(roomId)
    );

    if (opponentSocket) {
      opponentSocket.emit("game_over", { winner: opponent });
      opponentSocket.leave(roomId);
      opponentSocket.data.roomId = null;
    }
    room.endTime = Date.now();
    room.duration = room.startTime ? (room.endTime - room.startTime) / 1000 : 0;
    room.status = "finished";
    room.winner = opponent || "draw";

    console.log("[LEAVE_GAME] Attempting to record result for room:", roomId, "Winner:", room.winner, "Duration:", room.duration, "Players:", room.players, "Moves:", room.moves);
    try {
      if (!room.players.x || !room.players.o) {
        console.warn("[LEAVE_GAME] Missing players:", room.players);
        return;
      }
      await recordResult({
        x: room.players.x,
        o: room.players.o,
        winner: room.winner,
        moves: room.moves || [],
        duration: room.duration,
      });
      console.log("[LEAVE_RESULT] Recorded successfully for room:", roomId);
      await broadcastLeaderboard();
    } catch (err) {
      console.error("[LEAVE_GAME] Error recording result:", err);
    }

    gm.removeRoom(roomId);
    if (isCustomRoom(roomId)) releaseRoomCode(roomId);
    playAgainRequests.delete(roomId);
    console.log(`[CLEANUP] Room ${roomId} removed after leave`);
  });

  socket.on("disconnect", async () => {
    try {
      const roomId = socket.data.roomId;

      await mm.removeBySocket(socket.id);

      if (roomId) {
        const room = gm.getRoom(roomId);
        if (room && room.status === "waiting") {
          gm.removeRoom(roomId);
          releaseRoomCode(roomId);
          console.log(`[DISCONNECT] Cleaned up waiting room ${roomId}`);
        }
      }

      if (roomId && playAgainRequests.has(roomId)) {
        playAgainRequests.delete(roomId);
        io.to(roomId).emit("play_again_cancelled");
      }

      console.log(`[DISCONNECT] ${socket.id} cleaned up`);
    } catch (err) {
      console.error("Error on disconnect:", err);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TicTacPlay backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});