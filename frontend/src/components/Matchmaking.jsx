import React, { useState, useEffect } from "react";

export default function Matchmaking({ socket, onMatched }) {
  const [nickname, setNickname] = useState("");
  const [queued, setQueued] = useState(false);

  const joinMatch = () => {
    if (!nickname) return alert("Enter nickname!");
    setQueued(true);
    socket.emit("find_match", { nickname });
  };

  useEffect(() => {
    socket.on("matched", (data) => {
      setQueued(false);
      onMatched(data);
    });
    socket.on("queued", () => setQueued(true));

    return () => {
      socket.off("matched");
      socket.off("queued");
    };
  }, [socket, onMatched]);

  return (
    <div className="matchmaking-card">
      <input
        className="input"
        placeholder="Enter nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
      />
      <button className="btn" onClick={joinMatch} disabled={queued}>
        {queued ? "Searching..." : "Find Match"}
      </button>
    </div>
  );
}
