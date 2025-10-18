import React, { useState, useEffect, useCallback, useRef } from "react";
import "./Matchmaking.css";

export default function Matchmaking({ socket, onFindMatch, nickname: existingName }) {
  const [nickname, setNickname] = useState(existingName || "");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(null);
  const [error, setError] = useState("");
  const [sessionNickname, setSessionNickname] = useState(null);
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (!socket) return;

    console.log("[MOUNT] Matchmaking component mounted");

    if (!existingName) {
      socket.emit("get-session-nickname", (response) => {
        if (response.nickname) {
          console.log("[SESSION] Found session nickname:", response.nickname);
          setSessionNickname(response.nickname);
          setNickname(response.nickname);
          setAvailable(true);
        }
      });
    } else {
      setSessionNickname(existingName);
      setNickname(existingName);
      setAvailable(true);
    }
  }, [socket, existingName]);

  const checkNickname = useCallback(
    (value) => {
      if (!value || value.trim().length === 0) {
        setAvailable(null);
        setError("");
        return;
      }

      setChecking(true);
      socket.emit("check-nickname", value.trim(), (response) => {
        setChecking(false);
        if (response.error) {
          setAvailable(false);
          setError(response.error);
        } else {
          setAvailable(response.available);
          setError("");
        }
      });
    },
    [socket]
  );

  const handleNicknameChange = (e) => {
    const value = e.target.value;
    setNickname(value);

    if (sessionNickname && value.toLowerCase() === sessionNickname.toLowerCase()) {
      setAvailable(true);
      setError("");
      return;
    }

    setAvailable(null);
    setError("");

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => checkNickname(value), 300);
  };

  const joinMatch = () => {
    const name = nickname.trim();

    if (!name) {
      setError("Enter nickname!");
      return;
    }

    if (checking) {
      setError("Please wait for nickname validation");
      return;
    }

    if (!available) {
      setError("Nickname not available");
      return;
    }

    if (!sessionNickname || name.toLowerCase() !== sessionNickname.toLowerCase()) {
      socket.emit("reserve-nickname", name, (response) => {
        if (response.success) {
          setSessionNickname(response.nickname);
          onFindMatch(response.nickname);
        } else {
          setError(response.error || "Failed to reserve nickname");
          setAvailable(false);
        }
      });
    } else {
      onFindMatch(name);
    }
  };

  const handleCreateRoom = () => {
    const name = nickname.trim();
    if (!name) {
      setError("Enter nickname to create room!");
      return;
    }

    if (checking) {
      setError("Please wait for nickname validation");
      return;
    }

    if (!available) {
      setError("Nickname not available");
      return;
    }

    socket.emit("reserve-nickname", name, (res) => {
      if (!res.success) {
        setError(res.error || "Failed to reserve nickname");
        return;
      }

      socket.emit("create_room", { nickname: name }, (res2) => {
        if (res2.error) {
          setError(res2.error);
          return;
        }

        setSessionNickname(name);
        console.log(`[ROOM] Created room: ${res2.roomId}`);
        // Room created event will be handled in App.jsx
      });
    });
  };

  const handleJoinRoom = () => {
    const id = prompt("Enter room ID to join:");
    if (!id) return;

    const name = nickname.trim();
    if (!name) {
      setError("Enter nickname to join room!");
      return;
    }

    socket.emit("reserve-nickname", name, (res) => {
      if (!res.success) {
        setError(res.error || "Failed to reserve nickname");
        return;
      }

      socket.emit("join_room", { nickname: name, roomId: id }, (res2) => {
        if (res2.error) {
          alert(res2.error);
        } else {
          setSessionNickname(name);
          console.log(`[ROOM] Joined room: ${id}`);
        }
      });
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && available && !checking) joinMatch();
  };

  return (
    <div className="matchmaking-container">
      <div className="input-wrapper">
        <input
          className={`matchmaking-input ${
            available === true ? "available" : available === false ? "unavailable" : ""
          }`}
          placeholder="Enter nickname"
          value={nickname}
          onChange={handleNicknameChange}
          onKeyPress={handleKeyPress}
          maxLength={64}
        />
        <div className="status-indicator">
          {checking && <span className="checking">⏳</span>}
          {!checking && available === true && <span className="check">✓</span>}
          {!checking && available === false && <span className="cross">✗</span>}
        </div>
      </div>


      {error && <p className="validation-message error">{error}</p>}
      {available === true && !error && nickname && (
        <p className="validation-message success">Nickname available!</p>
      )}

      {available === false && !checking && nickname && (
        <p className="validation-message error">That nickname is taken. Try another.</p>
      )}

      <button
        className="matchmaking-button"
        onClick={joinMatch}
        disabled={!available || checking || !nickname.trim()}
      >
        Find Match
      </button>

      <div className="room-buttons">
        <button 
          className="matchmaking-button outline" 
          onClick={handleCreateRoom}
          disabled={!available || checking || !nickname.trim()}
        >
          Create Room
        </button>
        <button 
          className="matchmaking-button outline" 
          onClick={handleJoinRoom}
        >
          Join Room
        </button>
      </div>
    </div>
  );
}