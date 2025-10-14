import React from "react";

export default function Cell({ value, onClick }) {
  return (
    <div className="cell" onClick={onClick}>
      {value && (
        <span style={{ color: value === "x" ? "#fff300" : "#f5f5f5" }}>
          {value.toUpperCase()}
        </span>
      )}
    </div>
  );
}
