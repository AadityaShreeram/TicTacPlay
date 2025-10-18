import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import Board from "./components/Board";
import Leaderboard from "./components/Leaderboard";
import Matchmaking from "./components/Matchmaking";
import "./App.css";

const socket = io(import.meta.env.VITE_BACKEND_URL || "http://localhost:4000", {
  withCredentials: true,
  transports: ["polling", "websocket"],
  upgrade: true
});

export default function App() {
  const [game, setGame] = useState(null);
  const [winner, setWinner] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [nickname, setNickname] = useState(null);
  const [searching, setSearching] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [matchData, setMatchData] = useState(null);
  const [waitingRoom, setWaitingRoom] = useState(null);
  const [waitingForRematch, setWaitingForRematch] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [isCustomRoom, setIsCustomRoom] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

  useEffect(() => {
    let interval;
    if (timerActive) {
      const start = Date.now() - (elapsed * 1000);
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${backendUrl}/leaderboard`, {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      console.log("[LEADERBOARD] Fetched:", data);
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching leaderboard", err);
      setLeaderboard([]);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    // Real-time leaderboard updates via WebSocket
    socket.on("leaderboard_update", (data) => {
      console.log("[LEADERBOARD_UPDATE] Received via WebSocket:", data);
      setLeaderboard(Array.isArray(data) ? data : []);
    });

    socket.on("room_created", (data) => {
      console.log("[ROOM_CREATED] Received:", data);
      setWaitingRoom(data);
      setSearching(false);
    });

    socket.on("game_state", (data) => {
      console.log("[GAME_STATE] Received:", data);
      if (!gameEnded) {
        setGame((prev) => {
          if (!prev) return prev;
          return { ...prev, board: data.board || Array(9).fill(null), turn: data.turn, status: data.status };
        });
      }
    });

    socket.on("game_over", (data) => {
      console.log("[GAME_OVER] Winner:", data.winner);
      setTimerActive(false);
      setWinner(data.winner);
      setGame((prev) => (prev ? { ...prev, status: "finished" } : null));
      setGameEnded(true);
    });

    socket.on("matched", (data) => {
      console.log("[MATCHED] Event received:", data);
      const isCustom = /^\d{4,6}$/.test(data.roomId);
      setIsCustomRoom(isCustom);
      setWaitingRoom(null);
      setWaitingForRematch(false);
      setGameEnded(false); // Reset gameEnded immediately when matched
      
      if (isCustom) {
        handleMatched(data);
        return;
      }
      
      setMatchData(data);
      setSearching(false);
      setTransitioning(true);
      setTimeout(() => {
        handleMatched(data);
        setTransitioning(false);
        setMatchData(null);
      }, 3000);
    });

    socket.on("searching_again", () => {
      console.log("[SEARCHING_AGAIN] Finding new opponent...");
      setSearching(true);
      setGame(null);
      setWinner(null);
      setGameEnded(false);
      setWaitingForRematch(false);
    });

    socket.on("error_msg", (data) => {
      console.error("[ERROR] From server:", data.message);
      if (data.message === "nickname_not_reserved") {
        alert("Your nickname session expired. Please try again.");
      } else if (data.message === "opponent_disconnected") {
        alert("Your opponent has disconnected. Try finding a new match!");
        setGame(null);
        setSearching(false);
        setWaitingForRematch(false);
      }
    });

    socket.on("move_rejected", (data) => {
      console.error("[MOVE_REJECTED]", data);
      alert(`Move rejected: ${data.reason}`);
    });

    socket.on("play_again_request", (data) => {
      console.log("[PLAY_AGAIN_REQUEST] From:", data.from);
      alert(`${data.from} wants to play again! Click Play Again to confirm.`);
    });

    socket.on("waiting_for_opponent", (data) => {
      console.log("[WAITING_FOR_OPPONENT]", data);
      setWaitingForRematch(true);
      alert(`Request sent! Waiting for ${data.opponent} to confirm.`);
    });

    socket.on("play_again_cancelled", () => {
      console.log("[PLAY_AGAIN_CANCELLED]");
      setWaitingForRematch(false);
      alert("Opponent left or cancelled the rematch request.");
    });

    socket.on("opponent_left", (data) => {
      console.log("[OPPONENT_LEFT] Received:", data);
      alert(`Your opponent has left the game. You win!`);
      setGame((prev) => (prev ? { ...prev, status: "finished" } : null));
      setWinner(data.winner);
      setTimerActive(false);
      setGameEnded(true);
    });

    return () => {
      socket.off("leaderboard_update");
      socket.off("room_created");
      socket.off("game_state");
      socket.off("game_over");
      socket.off("matched");
      socket.off("searching_again");
      socket.off("error_msg");
      socket.off("move_rejected");
      socket.off("play_again_request");
      socket.off("waiting_for_opponent");
      socket.off("play_again_cancelled");
      socket.off("opponent_left");
    };
  }, [gameEnded]);

  const handleMatched = ({ roomId, side, opponent }) => {
    console.log("[HANDLE_MATCHED] Starting new match:", { roomId, side, opponent });
    const newGame = {
      roomId,
      side,
      opponent,
      board: Array(9).fill(null),
      turn: "x",
      status: "playing",
    };
    setGame(newGame);
    setWinner(null);
    setSearching(false);
    setWaitingForRematch(false);
    setTimerActive(true);
    setGameEnded(false);
    setElapsed(0);
  };

  const handleMatchStart = (name) => {
    console.log("[MATCH_START] Finding match for:", name);
    setNickname(name);
    setSearching(true);
    socket.emit("find_match", { nickname: name });
  };

  const handleMove = (index) => {
    if (!game || game.status !== "playing" || gameEnded) return;
    if (game.turn !== game.side) return;
    socket.emit("move_made", { roomId: game.roomId, index });
  };

  const handlePlayAgain = () => {
    if (!game?.roomId && !isCustomRoom) {
      // For normal matches without valid room, just enter matchmaking
      console.log("[PLAY_AGAIN] No valid room, entering matchmaking directly");
      setSearching(true);
      setGameEnded(false);
      setWinner(null);
      socket.emit("play_again", { roomId: null, isCustomRoom: false });
      return;
    }
    
    console.log("[PLAY_AGAIN] Requesting rematch. Custom room:", isCustomRoom);
    
    if (!isCustomRoom) {
      // For normal matches, immediately show searching state
      setSearching(true);
      setGameEnded(false);
      setWinner(null);
    }
    
    socket.emit("play_again", { roomId: game?.roomId, isCustomRoom });
  };

  const handleNewPlayer = () => {
    // Clean up current game state
    if (game?.roomId) {
      socket.emit("leave_room", { roomId: game.roomId });
    }
    
    // Reset all state
    setNickname(null);
    setGame(null);
    setWinner(null);
    setSearching(false);
    setWaitingRoom(null);
    setWaitingForRematch(false);
    setTimerActive(false);
    setElapsed(0);
    setGameEnded(false);
    setIsCustomRoom(false);
    
    // Disconnect and reconnect socket
    socket.disconnect();
    setTimeout(() => socket.connect(), 100);
  };

  const handleCancelWaitingRoom = () => {
    if (waitingRoom?.roomId) {
      socket.emit("leave_room", { roomId: waitingRoom.roomId });
    }
    setWaitingRoom(null);
  };

  const handleLeaveGame = () => {
    if (!game?.roomId) return;
    socket.emit("leave_game", { roomId: game.roomId, nickname: nickname });
    setGame(null);
    setWinner("You Left");
    setTimerActive(false);
    setGameEnded(true);
  };

  const handleLeaveRoom = () => {
    if (!game?.roomId) return;
    console.log("[LEAVE_ROOM] Leaving room:", game.roomId);
    socket.emit("leave_room", { roomId: game.roomId });
    setGame(null);
    setWinner(null);
    setTimerActive(false);
    setGameEnded(false);
    setIsCustomRoom(false);
    setWaitingForRematch(false);
  };

  const isMyTurn = game && game.turn === game.side && !gameEnded;
  const turnLabel = isMyTurn ? "🎯 Your Turn" : `🕐 ${game?.opponent || "Opponent"}'s Turn`;

  return (
    <div className="app">
      <h1 className="title">TicTacPlay</h1>

      {!game && !searching && !transitioning && !waitingRoom && (
        <Matchmaking socket={socket} onFindMatch={handleMatchStart} nickname={nickname} />
      )}

      {(game && (game.status === "playing" || game.status === "finished")) && (
        <div className="status-widget">
          <div className="timer-item">{game.status === "finished" ? "📊 Game Summary:" : "⏱"} {elapsed}s</div>
          {game.status === "playing" && !gameEnded && <div className="turn-item">{turnLabel}</div>}
          <div className="player-item">🧍 {nickname} ({game.side?.toUpperCase()})</div>
        </div>
      )}

      {searching && (
        <div className="searching-container fade">
          🎯 Searching for a match as <b>{nickname}</b>...
        </div>
      )}

      {waitingRoom && (
        <div className="waiting-room fade-in">
          <h2>🎮 Room Created!</h2>
          <p>Room ID: <b>{waitingRoom.roomId}</b></p>
          <p>Share this with your friend to join!</p>
          <button className="btn outline" onClick={handleCancelWaitingRoom}>Cancel</button>
        </div>
      )}

      {transitioning && matchData && (
        <div className="versus-screen">
          <div className="match-found-text">⚡ Match found! Getting ready...</div>
          <div className="versus-container">
            <div className="player-box">
              <div className="player-name">{nickname}</div>
              <div className="player-side">{matchData.side?.toUpperCase()}</div>
            </div>
            <div className="versus-divider">VS</div>
            <div className="player-box">
              <div className="player-name">{matchData.opponent}</div>
              <div className="player-side">{matchData.side === "x" ? "O" : "X"}</div>
            </div>
          </div>
        </div>
      )}

      {game && !transitioning && (
        <div className="game-card fade-in">
          <Board board={game.board || Array(9).fill(null)} onClick={handleMove} turn={game.turn} />
          {game.status === "playing" && !gameEnded && (
            <div className="btn-group">
              <button className="btn leave-btn" onClick={handleLeaveGame}>
                Leave Game
              </button>
              {isCustomRoom && (
                <button className="btn outline" onClick={handleLeaveRoom}>
                  Leave Room
                </button>
              )}
            </div>
          )}
          {game.status === "finished" && (
            <div className="result">
              <h3>Winner: {winner === "draw" ? "Draw" : winner}</h3>
              <div className="btn-group">
                <button
                  className="btn"
                  onClick={handlePlayAgain}
                  disabled={waitingForRematch}
                >
                  {waitingForRematch ? "Waiting for opponent..." : "Play Again"}
                </button>
                {isCustomRoom && (
                  <button className="btn outline" onClick={handleLeaveRoom}>
                    Leave Room
                  </button>
                )}
                <button className="btn outline" onClick={handleNewPlayer}>
                  New Player
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Leaderboard leaderboard={leaderboard} currentNickname={nickname} />
    </div>
  );
}