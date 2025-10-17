const pool = require('./db');

async function recordResult({ x, o, winner, moves, duration }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ensurePlayer = async (nick) => {
      if (!nick) return;
      const [rows] = await conn.query(
        'SELECT id FROM leaderboard WHERE nickname = ?',
        [nick]
      );
      if (rows.length === 0) {
        await conn.query(
          'INSERT INTO leaderboard (nickname, wins, losses, draws, total_time_seconds) VALUES (?, 0, 0, 0, 0)',
          [nick]
        );
      }
    };

    await ensurePlayer(x);
    await ensurePlayer(o);
    console.log(`[RECORD] Committing transaction for room with winner ${winner}`);
    if (winner === 'draw') {
      await conn.query(
        'UPDATE leaderboard SET draws = draws + 1, total_time_seconds = total_time_seconds + ? WHERE nickname IN (?, ?)',
        [duration || 0, x, o]
      );
    } else if (winner === x) {
      await conn.query('UPDATE leaderboard SET wins = wins + 1, total_time_seconds = total_time_seconds + ? WHERE nickname = ?', [duration || 0, x]);
      await conn.query('UPDATE leaderboard SET losses = losses + 1, total_time_seconds = total_time_seconds + ? WHERE nickname = ?', [duration || 0, o]);
      await updateFastestWin(conn, x, duration);
    } else if (winner === o) {
      await conn.query('UPDATE leaderboard SET wins = wins + 1, total_time_seconds = total_time_seconds + ? WHERE nickname = ?', [duration || 0, o]);
      await conn.query('UPDATE leaderboard SET losses = losses + 1, total_time_seconds = total_time_seconds + ? WHERE nickname = ?', [duration || 0, x]);
      await updateFastestWin(conn, o, duration);
    }

    await conn.query(
      'INSERT INTO game_history (player_x, player_o, winner, moves, duration_seconds) VALUES (?, ?, ?, ?, ?)',
      [x, o, winner, JSON.stringify(moves || []), duration || null]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateFastestWin(conn, nickname, duration) {
  if (!duration) return;
  const [rows] = await conn.query(
    'SELECT fastest_win FROM leaderboard WHERE nickname = ?',
    [nickname]
  );
  const prev = rows[0]?.fastest_win;
  if (!prev || duration < prev) {
    await conn.query('UPDATE leaderboard SET fastest_win = ? WHERE nickname = ?', [
      duration,
      nickname,
    ]);
  }
}

async function getLeaderboard(limit = 20, currentNickname = null) {
  try {
    const [rows] = await pool.query(
      `SELECT
        nickname,
        wins,
        losses,
        draws,
        total_time_seconds,
        fastest_win,
        updated_at,
        (wins * 3 + draws * 1 - losses * 1) AS score
      FROM leaderboard
      ORDER BY score DESC, wins DESC, fastest_win ASC, updated_at DESC
      LIMIT ?`,
      [limit]
    );
    
    console.log("Leaderboard rows:", rows); 
    
    return rows.map(row => ({
      ...row,
      nickname: row.nickname === currentNickname ? `${row.nickname} (you)` : row.nickname,
      total_minutes: Math.floor((row.total_time_seconds || 0) / 60),
      score: Math.round((row.score) * (1 - (row.total_time_seconds / (row.total_time_seconds + 100))) * 10) / 10 // Apply time-weighted adjustment to the base score
    }));
  } catch (err) {
    console.error("Leaderboard query error:", err);
    return []; 
  }
}

async function resetLeaderboard() {
  await pool.query('DELETE FROM leaderboard');
  await pool.query('DELETE FROM game_history');
}

module.exports = { recordResult, getLeaderboard, resetLeaderboard };