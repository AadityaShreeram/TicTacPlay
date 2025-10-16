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
    console.log("[MOUNT] Matchmaking component mounted");
    console.log("[MOUNT] existingName:", existingName);

    if (socket && !existingName) {
      console.log("[MOUNT] Checking for session nickname...");
      socket.emit("get-session-nickname", (response) => {
        console.log("[MOUNT] Session nickname response:", response);
        if (response.nickname) {
          console.log("[MOUNT] ✓ Found session nickname:", response.nickname);
          setSessionNickname(response.nickname);
          setNickname(response.nickname);
          setAvailable(true);
        } else {
          console.log("[MOUNT] No session nickname found");
        }
      });
    } else if (existingName) {
      console.log("[MOUNT] Using existingName:", existingName);
      setSessionNickname(existingName);
      setNickname(existingName);
      setAvailable(true);
    }
  }, [socket, existingName]);

  const checkNickname = useCallback(
    (value) => {
      console.log("[CHECK] Checking nickname:", value);

      if (!value || value.trim().length === 0) {
        console.log("[CHECK] Empty nickname, skipping check");
        setAvailable(null);
        setError("");
        return;
      }

      setChecking(true);
      socket.emit("check-nickname", value.trim(), (response) => {
        console.log("[CHECK] Response:", response);
        setChecking(false);
        if (response.error) {
          console.log("[CHECK] Error:", response.error);
          setAvailable(false);
          setError(response.error);
        } else {
          console.log("[CHECK] Available:", response.available);
          setAvailable(response.available);
          setError("");
        }
      });
    },
    [socket]
  );

  const handleNicknameChange = (e) => {
    const value = e.target.value;
    console.log("[INPUT] Nickname changed to:", value);
    console.log("[INPUT] Session nickname:", sessionNickname);

    setNickname(value);

    if (sessionNickname && value.toLowerCase() === sessionNickname.toLowerCase()) {
      console.log("[INPUT] ✓ Matches session nickname — marking as available");
      setAvailable(true);
      setError("");
      return;
    }

    setAvailable(null);
    setError("");

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      checkNickname(value);
    }, 300);
  };

  const joinMatch = () => {
    const name = nickname.trim();
    console.log("[JOIN] Attempting to join match");
    console.log("[JOIN] Nickname:", name);
    console.log("[JOIN] Session nickname:", sessionNickname);
    console.log("[JOIN] Available:", available);
    console.log("[JOIN] Checking:", checking);

    if (!name) {
      setError("Enter nickname!");
      return;
    }

    if (checking) {
      console.log("[JOIN] ✗ Still checking nickname...");
      setError("Please wait for nickname validation");
      return;
    }

    if (!available) {
      console.log("[JOIN] ✗ Nickname not available");
      setError("Nickname not available");
      return;
    }

    if (!sessionNickname || name.toLowerCase() !== sessionNickname.toLowerCase()) {
      console.log("[JOIN] Reserving new nickname:", name);
      socket.emit("reserve-nickname", name, (response) => {
        console.log("[JOIN] Reserve response:", response);
        if (response.success) {
          console.log("[JOIN] ✓ Nickname reserved — finding match...");
          setSessionNickname(response.nickname);
          onFindMatch(response.nickname);
        } else {
          console.log("[JOIN] ✗ Failed to reserve:", response.error);
          setError(response.error || "Failed to reserve nickname");
          setAvailable(false);
        }
      });
    } else {
      console.log("[JOIN] ✓ Using existing session nickname — finding match...");
      onFindMatch(name);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && available && !checking) {
      joinMatch();
    }
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

      {error && <p className="error-message">{error}</p>}
      {available === true && !error && nickname && (
        <p className="success-message">Nickname available!</p>
      )}

      {available === false && !checking && nickname && (
  <p className="error-message">Choose a unique nickname</p>
)}


      <button
        className="matchmaking-button"
        onClick={joinMatch}
        disabled={!available || checking || !nickname.trim()}
      >
        Find Match
      </button>
    </div>
  );
}
