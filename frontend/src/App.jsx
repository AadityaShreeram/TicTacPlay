import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import Board from "./components/Board";
import Leaderboard from "./components/Leaderboard";
import Matchmaking from "./components/Matchmaking";

import "./App.css";

const socket = io(import.meta.env.VITE_BACKEND_URL || "http://localhost:4000");

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

  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${backendUrl}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error("Error fetching leaderboard", err);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    socket.on("room_created", (data) => {
      console.log("[ROOM_CREATED] Received:", data);
      setWaitingRoom(data);
      setSearching(false);
    });

    socket.on("game_state", (data) => {
      console.log("[GAME_STATE] Received:", data);
      setGame((prev) => {
        if (!prev) {
          console.log("[GAME_STATE] Ignored - no active game yet");
          return prev;
        }
        return { ...prev, board: data.board, turn: data.turn, status: data.status };
      });
    });

    socket.on("game_over", (data) => {
      console.log("[GAME_OVER] Winner:", data.winner);
      setWinner(data.winner);
      setGame((prev) => ({ ...prev, status: "finished" }));
      fetchLeaderboard();
    });

    socket.on("matched", (data) => {
      console.log("[MATCHED] Event received:", data);

      const isCustomRoom = /^\d{4,6}$/.test(data.roomId);
      setWaitingRoom(null);

      if (isCustomRoom) {
        console.log("[MATCHED] Custom room - starting immediately");
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

    socket.on("error_msg", (data) => {
      console.error("[ERROR] From server:", data.message);
      if (data.message === "nickname_not_reserved") {
        setNickname(null);
        setSearching(false);
        alert("Your nickname session expired. Please enter your nickname again.");
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

    return () => {
      socket.off("room_created");
      socket.off("game_state");
      socket.off("game_over");
      socket.off("matched");
      socket.off("error_msg");
      socket.off("move_rejected");
      socket.off("play_again_request");
      socket.off("waiting_for_opponent");
      socket.off("play_again_cancelled");
    };
  }, []);

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
  };

  const handleMatchStart = (name) => {
    console.log("[MATCH_START] Finding match for:", name);
    setNickname(name);
    setSearching(true);
    socket.emit("find_match", { nickname: name });
  };

  const handleMove = (index) => {
    if (!game || game.status !== "playing") return;
    if (game.turn !== game.side) return;
    socket.emit("move_made", { roomId: game.roomId, index });
  };

  const handlePlayAgain = () => {
    if (!game?.roomId) return;
    console.log("[PLAY_AGAIN] Requesting rematch in room:", game.roomId);
    socket.emit("play_again", { roomId: game.roomId });
  };

  const handleNewPlayer = () => {
    console.log("[NEW_PLAYER] Resetting app state");
    setNickname(null);
    setGame(null);
    setWinner(null);
    setSearching(false);
    setWaitingRoom(null);
    setWaitingForRematch(false);

    socket.disconnect();
    setTimeout(() => socket.connect(), 100);
  };

  const handleCancelWaitingRoom = () => {
    console.log("[WAITING_ROOM] Cancelled by user");
    setWaitingRoom(null);
    setNickname(null);
  };

  const resetLeaderboard = async () => {
    try {
      const res = await fetch(`${backendUrl}/reset`, { method: "POST" });
      const data = await res.json();
      if (data.ok) fetchLeaderboard();
    } catch (err) {
      console.error("[RESET_LEADERBOARD] Error:", err);
    }
  };

  return (
    <div className="app">
      <h1 className="title">TicTacPlay</h1>

      {!game && !searching && !transitioning && !waitingRoom && (
        <Matchmaking
          socket={socket}
          onFindMatch={handleMatchStart}
          nickname={nickname}
        />
      )}

      {searching && (
        <div className="searching-container fade">
          🎯 Searching for a match as <b>{nickname}</b>...
        </div>
      )}

      {waitingRoom && (
        <div className="waiting-room fade-in">
          <h2>🎮 Room Created!</h2>
          <div className="room-info">
            <p className="room-id">
              Room ID: <strong>{waitingRoom.roomId}</strong>
            </p>
            <p className="instruction">Share this ID with your friend to join!</p>
            <p className="waiting-text">⏳ Waiting for opponent to join...</p>
          </div>
          <button className="btn outline" onClick={handleCancelWaitingRoom}>
            Cancel
          </button>
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
              <div className="player-side">
                {matchData.side === "x" ? "O" : "X"}
              </div>
            </div>
          </div>
        </div>
      )}

      {game && !transitioning && (
        <div className="game-card fade-in">
          <h2>
            Playing as{" "}
            <span className="highlight">{game.side?.toUpperCase()}</span> vs{" "}
            <span className="highlight">{game.opponent}</span>
          </h2>

          <Board board={game.board} onClick={handleMove} turn={game.turn} />

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
                <button className="btn outline" onClick={handleNewPlayer}>
                  New Player
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Leaderboard leaderboard={leaderboard} onReset={resetLeaderboard} />
    </div>
  );
}
