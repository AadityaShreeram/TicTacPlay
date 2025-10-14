import React from "react";

export default function Leaderboard({ leaderboard, onReset }) {
  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <h2>Leaderboard</h2>
        <button className="btn small" onClick={onReset}>Reset</button>
      </div>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Nickname</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Draws</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((p, i) => (
            <tr key={i}>
              <td>{p.nickname}</td>
              <td>{p.wins}</td>
              <td>{p.losses}</td>
              <td>{p.draws}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
