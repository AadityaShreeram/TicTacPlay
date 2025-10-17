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
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 4000;

const gm = new GameManager();
const mm = new Matchmaking();

const activeRoomCodes = new Set();
const playAgainRequests = new Map();

/** Generate a unique 4–6 digit room code */
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

/* ================= REST ROUTES ================= */
app.get("/health", (req, res) => res.json({ status: "ok", message: "TicTacPlay backend running" }));
app.get("/leaderboard", async (req, res) => {
  try {
    res.json(await getLeaderboard(50));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "db_error" });
  }
});
app.post("/reset", async (req, res) => {
  try {
    await resetLeaderboard();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

/* ================= SOCKET HANDLERS ================= */
io.on("connection", (socket) => {
  console.log("[CONNECTED]", socket.id);

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

  /* ---------- AUTO MATCHMAKING ---------- */
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

  /* ---------- CUSTOM ROOM: CREATE ---------- */
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

  /* ---------- CUSTOM ROOM: JOIN ---------- */
  socket.on("join_room", async ({ nickname, roomId }, callback) => {
    if (!nickname || !roomId) return callback({ error: "Missing fields" });

    const room = gm.getRoom(roomId);
    if (!room) return callback({ error: "Room not found" });
    if (room.players.o) return callback({ error: "Room full" });
    if (room.status !== "waiting") return callback({ error: "Game already started" });

    room.players.o = nickname;
    room.status = "playing";

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

  /* ---------- REQUEST GAME STATE ---------- */
  socket.on("request_game_state", ({ roomId }) => {
    const room = gm.getRoom(roomId);
    if (room)
      socket.emit("game_state", {
        board: room.board,
        turn: room.turn,
        status: room.status,
      });
  });

  /* ---------- MOVE MADE ---------- */
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
  try {
    await recordResult({
      x: room.players.x,
      o: room.players.o,
      winner: room.winner,
      moves: room.moves,
    });
  } catch (err) {
    console.error("Error recording result:", err);
  }

  io.to(roomId).emit("game_over", { winner: room.winner });

  // ✅ Delay cleanup only if both players have disconnected
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

  setTimeout(checkCleanup, 60_000);
}

  });

socket.on("play_again", async ({ roomId }) => {
  const nickname = socket.data.nickname;
  if (!roomId || !nickname) return;

  const room = gm.getRoom(roomId);
  if (!room) {
    socket.emit("error_msg", { message: "room_not_found" });
    return;
  }

  if (!playAgainRequests.has(roomId)) playAgainRequests.set(roomId, new Set());
  const requestSet = playAgainRequests.get(roomId);

  requestSet.add(nickname);
  console.log(`[PLAY_AGAIN] ${nickname} requested rematch in ${roomId}`);

  const opponent =
    room.players.x === nickname ? room.players.o : room.players.x;

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

  if (
    requestSet.has(room.players.x) &&
    requestSet.has(room.players.o)
  ) {
    console.log(`[PLAY_AGAIN] Both players ready → restarting ${roomId}`);

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
});


  socket.on("disconnect", async () => {
    try {
      const roomId = socket.data.roomId;

      await mm.removeBySocket(socket.id);
      await mm.releaseNickname(socket.id);

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

server.listen(PORT, () =>
  console.log(`TicTacPlay backend running on port ${PORT}`)
);
