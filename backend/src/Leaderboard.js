const pool = require('./db');

async function recordResult({ x, o, winner, moves }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ensurePlayer = async (nick) => {
      if (!nick) return;
      const [rows] = await conn.query('SELECT id FROM leaderboard WHERE nickname = ?', [nick]);
      if (rows.length === 0) {
        await conn.query('INSERT INTO leaderboard (nickname, wins, losses, draws) VALUES (?, 0, 0, 0)', [nick]);
      }
    };

    await ensurePlayer(x);
    await ensurePlayer(o);

    if (winner === 'draw') {
      // increment draws for both players (if both exist)
      await conn.query('UPDATE leaderboard SET draws = draws + 1 WHERE nickname IN (?, ?)', [x, o]);
    } else if (winner === x) {
      await conn.query('UPDATE leaderboard SET wins = wins + 1 WHERE nickname = ?', [x]);
      await conn.query('UPDATE leaderboard SET losses = losses + 1 WHERE nickname = ?', [o]);
    } else if (winner === o) {
      await conn.query('UPDATE leaderboard SET wins = wins + 1 WHERE nickname = ?', [o]);
      await conn.query('UPDATE leaderboard SET losses = losses + 1 WHERE nickname = ?', [x]);
    }

    await conn.query('INSERT INTO game_history (player_x, player_o, winner, moves) VALUES (?, ?, ?, ?)', [x, o, winner, JSON.stringify(moves || [])]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getLeaderboard(limit = 50) {
  const [rows] = await pool.query('SELECT nickname, wins, losses, draws, updated_at FROM leaderboard ORDER BY wins DESC, draws DESC, updated_at DESC LIMIT ?', [limit]);
  return rows;
}

async function resetLeaderboard() {
  await pool.query('DELETE FROM leaderboard');
  await pool.query('DELETE FROM game_history');
}

module.exports = { recordResult, getLeaderboard, resetLeaderboard };
