import React from "react";
import Cell from "./Cell";

export default function Board({ board, onClick, turn }) {
  const safeBoard = board || Array(9).fill(null);
  return (
    <div className="board">
      {safeBoard.map((cell, i) => (
        <Cell key={i} value={cell} onClick={() => onClick(i)} disabled={cell || turn !== undefined && turn !== null && turn !== (i % 2 === 0 ? "x" : "o")} />
      ))}
    </div>
  );
}