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

    socket.on("game_state", (data) => {
      console.log("[GAME_STATE] Received:", data);
      setGame((prev) => ({ ...prev, board: data.board, turn: data.turn, status: data.status }));
    });

    socket.on("game_over", (data) => {
      setWinner(data.winner);
      setGame((prev) => ({ ...prev, status: "finished" }));
      fetchLeaderboard();
    });

    socket.on("matched", (data) => {
      console.log("Matched event received:", data);

      setMatchData(data);
      setTransitioning(true);
      setSearching(false);

      setTimeout(() => {
        handleMatched(data);
        setTransitioning(false);
        setMatchData(null);
      }, 3000); 
    });

    socket.on("error_msg", (data) => {
      console.error("Error from server:", data.message);
      if (data.message === 'nickname_not_reserved') {
        setNickname(null);
        setSearching(false);
        alert('Your nickname session expired. Please enter your nickname again.');
      }
    });

    socket.on("move_rejected", (data) => {
      console.error("[MOVE_REJECTED]", data);
      alert(`Move rejected: ${data.reason}`);
    });

    return () => {
      socket.off("game_state");
      socket.off("game_over");
      socket.off("matched");
      socket.off("error_msg");
      socket.off("move_rejected");
    };
  }, []);

  const handleMatched = ({ roomId, side, opponent }) => {
    console.log("handleMatched called:", { roomId, side, opponent });
    setGame({
      roomId,
      side,
      opponent,
      board: Array(9).fill(null),
      turn: "x",
      status: "playing",
    });
    setWinner(null);
    setSearching(false);
  };

  const handleMatchStart = (name) => {
    console.log("Emitting find_match with", name);
    setNickname(name);
    setSearching(true);
    socket.emit("find_match", { nickname: name });
  };

  const handleMove = (index) => {
    console.log("[HANDLE_MOVE] Clicked index:", index);
    console.log("[HANDLE_MOVE] Game state:", game);
    console.log("[HANDLE_MOVE] game.status:", game?.status);
    console.log("[HANDLE_MOVE] game.turn:", game?.turn);
    console.log("[HANDLE_MOVE] game.side:", game?.side);
    
    if (!game || game.status !== "playing") {
      console.log("[HANDLE_MOVE] ✗ Game not active");
      return;
    }
    
    if (game.turn !== game.side) {
      console.log("[HANDLE_MOVE] ✗ Not your turn");
      return;
    }
    
    console.log("[HANDLE_MOVE] ✓ Emitting move_made");
    socket.emit("move_made", { roomId: game.roomId, index });
  };

  const handlePlayAgain = () => {
    if (!nickname) return;
    console.log("Play Again triggered for", nickname);
    setGame(null);
    setWinner(null);
    handleMatchStart(nickname);
  };

  const handleNewPlayer = () => {
    setNickname(null);
    setGame(null);
    setWinner(null);
    setSearching(false);
    
    socket.disconnect();
    setTimeout(() => {
      socket.connect();
    }, 100);
  };

  const resetLeaderboard = async () => {
    try {
      const res = await fetch(`${backendUrl}/reset`, { method: "POST" });
      const data = await res.json();
      if (data.ok) fetchLeaderboard();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app">
      <h1 className="title">TicTacPlay</h1>

      {!game && !searching && !transitioning && (
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

      {transitioning && matchData && (
        <div className="versus-screen">
          <div className="match-found-text">
            ⚡ Match found! Getting ready...
          </div>
          
          <div className="versus-container">
            <div className="player-box">
              <div className="player-name">{nickname}</div>
              <div className="player-side">{matchData.side?.toUpperCase()}</div>
            </div>
            
            <div className="versus-divider">VS</div>
            
            <div className="player-box">
              <div className="player-name">{matchData.opponent}</div>
              <div className="player-side">
                {matchData.side === 'x' ? 'O' : 'X'}
              </div>
            </div>
          </div>
        </div>
      )}

      {game && !transitioning && (
        <div className="game-card fade-in">
          <h2>
            Playing as{" "}
            <span className="highlight">{game.side?.toUpperCase() || "?"}</span> vs{" "}
            <span className="highlight">{game.opponent || "?"}</span>
          </h2>

          <Board board={game.board} onClick={handleMove} turn={game.turn} />

          {game.status === "finished" && (
            <div className="result">
              <h3>Winner: {winner === "draw" ? "Draw" : winner}</h3>
              <div className="btn-group">
                <button className="btn" onClick={handlePlayAgain}>
                  Play Again
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