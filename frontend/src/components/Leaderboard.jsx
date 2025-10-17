import React from "react";

export default function Leaderboard({ leaderboard, currentNickname }) {
  const leaderboardData = Array.isArray(leaderboard) ? leaderboard : [];

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <h2>Leaderboard</h2>
      </div>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Nickname</th>
            <th>Wins</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {leaderboardData.length > 0 ? (
            leaderboardData.map((p, i) => (
              <tr key={i} className={p.nickname.includes("(you)") ? "current-user" : ""}>
                <td>{i + 1}</td>
                <td>{p.nickname}</td>
                <td>{p.wins}</td>
                <td>{p.score}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4">No data available</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}