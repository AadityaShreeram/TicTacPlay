import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import Board from "./components/Board";
import Leaderboard from "./components/Leaderboard";
import Matchmaking from "./components/Matchmaking";

const socket = io(import.meta.env.VITE_BACKEND_URL || "http://localhost:4000");

export default function App() {
  const [game, setGame] = useState(null);
  const [winner, setWinner] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:4000"}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error("Error fetching leaderboard", err);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    socket.on("game_state", (data) => {
      setGame((prev) => ({ ...prev, board: data.board, turn: data.turn, status: data.status }));
    });

    socket.on("game_over", (data) => {
      setWinner(data.winner);
      setGame((prev) => ({ ...prev, status: "finished" }));
      fetchLeaderboard();
    });

    return () => {
      socket.off("game_state");
      socket.off("game_over");
    };
  }, []);

  const handleMove = (index) => {
    if (!game || game.status !== "playing") return;
    socket.emit("move_made", { roomId: game.roomId, index });
  };

  const handleMatched = ({ roomId, side, opponent }) => {
    setGame({ roomId, side, opponent, board: Array(9).fill(null), turn: "x", status: "playing" });
    setWinner(null);
  };

  const resetGame = () => {
    setGame(null);
    setWinner(null);
  };

  const resetLeaderboard = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:4000"}/reset`, { method: "POST" });
      const data = await res.json();
      if (data.ok) fetchLeaderboard();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app">
      <h1 className="title">TicTacPlay</h1>

      {!game && <Matchmaking socket={socket} onMatched={handleMatched} />}

      {game && (
        <div className="game-card">
          <h2>
            Playing as <span className="highlight">{game.side.toUpperCase()}</span> vs{" "}
            <span className="highlight">{game.opponent}</span>
          </h2>

          <Board board={game.board} onClick={handleMove} turn={game.turn} />

          {game.status === "finished" && (
            <div className="result">
              <h3>Winner: {winner === "draw" ? "Draw" : winner}</h3>
              <button className="btn" onClick={resetGame}>Play Again</button>
            </div>
          )}
        </div>
      )}

      <Leaderboard leaderboard={leaderboard} onReset={resetLeaderboard} />
    </div>
  );
}
