import React, { useState } from "react";
import "./Matchmaking.css";

export default function Matchmaking({ socket, onFindMatch, nickname: existingName }) {
  const [nickname, setNickname] = useState(existingName || "");
  
  const joinMatch = () => {
    const name = nickname.trim();
    if (!name) return alert("Enter nickname!");
    console.log("Emitting find_match with", name);
    onFindMatch(name);
  };

  return (
    <div className="matchmaking-container">
      <input
        className="matchmaking-input"
        placeholder="Enter nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        onKeyPress={(e) => e.key === "Enter" && joinMatch()}
      />
      <button className="matchmaking-button" onClick={joinMatch}>
        Find Match
      </button>
    </div>
  );
}