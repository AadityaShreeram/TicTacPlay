import React from "react";
import Cell from "./Cell";

export default function Board({ board, onClick }) {
  return (
    <div className="board">
      {board.map((cell, i) => (
        <Cell key={i} value={cell} onClick={() => onClick(i)} />
      ))}
    </div>
  );
}
