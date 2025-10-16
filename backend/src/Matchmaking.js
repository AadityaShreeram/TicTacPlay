const IORedis = require('ioredis');
const dotenv = require('dotenv');
const pool = require('./db');
dotenv.config();

const redis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
});

const QUEUE_KEY = 'tic:match:queue';
const ACTIVE_NICKNAMES_KEY = 'tic:active:nicknames';
const SOCKET_NICKNAME_PREFIX = 'tic:socket:nick:';
const LOCK_PREFIX = 'lock:nickname:';

class Matchmaking {
  constructor() {
    this.redis = redis;
  }

  async isNicknameAvailable(nickname, socketId = null) {
    const normalized = nickname.trim().toLowerCase();

    if (socketId) {
      const current = await this.getNicknameBySocket(socketId);
      if (current && current === normalized) return true;
    }

    const inRedis = await this.redis.sismember(ACTIVE_NICKNAMES_KEY, normalized);
    if (inRedis) return false;

    const [rows] = await pool.query(
      'SELECT nickname FROM leaderboard WHERE LOWER(nickname) = ?',
      [normalized]
    );
    if (rows.length > 0) return false;

    return true;
  }

async reserveNickname(socketId, nickname) {
  const normalized = nickname.trim().toLowerCase();
  const current = await this.getNicknameBySocket(socketId);

  if (current && current === normalized) {
    return normalized;
  }

  if (current) await this.releaseNickname(socketId);

  const lockKey = `${LOCK_PREFIX}${normalized}`;
  const lockValue = socketId;
  const gotLock = await this.redis.set(lockKey, lockValue, 'NX', 'EX', 5);
  if (!gotLock) {
    console.warn(`[LOCK] Nickname "${normalized}" already locked by another socket`);
    return false;
  }

  try {
    const available = await this.isNicknameAvailable(normalized);
    if (!available) {
      await this.redis.del(lockKey);
      return false;
    }

    const pipeline = this.redis.multi();
    pipeline.sadd(ACTIVE_NICKNAMES_KEY, normalized);
    pipeline.set(`${SOCKET_NICKNAME_PREFIX}${socketId}`, normalized, 'EX', 86400);
    await pipeline.exec();

    return normalized; 
  } catch (err) {
    console.error('[ERROR] reserveNickname failed:', err);
    return false;
  } finally {
    const currentLock = await this.redis.get(lockKey);
    if (currentLock === lockValue) await this.redis.del(lockKey);
  }
}

  async getNicknameBySocket(socketId) {
    const nick = await this.redis.get(`${SOCKET_NICKNAME_PREFIX}${socketId}`);
    return nick ? nick.toLowerCase() : null;
  }

  async releaseNickname(socketId) {
    const nickname = await this.getNicknameBySocket(socketId);
    if (nickname) {
      const pipeline = this.redis.multi();
      pipeline.srem(ACTIVE_NICKNAMES_KEY, nickname);
      pipeline.del(`${SOCKET_NICKNAME_PREFIX}${socketId}`);
      await pipeline.exec();
    }
  }

  async enqueue({ socketId, nickname }) {
    try {
      const payload = JSON.stringify({ socketId, nickname });
      await this.redis.rpush(QUEUE_KEY, payload);
      console.log(`[QUEUE] Enqueued ${nickname} (${socketId})`);
    } catch (err) {
      console.error('[ERROR] enqueue failed:', err);
      throw err;
    }
  }

  async removeBySocket(socketId) {
    try {
      const list = await this.redis.lrange(QUEUE_KEY, 0, -1);
      for (const item of list) {
        try {
          const parsed = JSON.parse(item);
          if (parsed.socketId === socketId) {
            await this.redis.lrem(QUEUE_KEY, 0, item);
            console.log(`[QUEUE] Removed ${parsed.nickname} (${socketId})`);
          }
        } catch {}
      }
    } catch (err) {
      console.error('[ERROR] removeBySocket failed:', err);
    }
  }

  async tryMatch() {
    try {
      const multi = this.redis.multi();
      multi.lpop(QUEUE_KEY);
      multi.lpop(QUEUE_KEY);
      const results = await multi.exec();

      if (!results) return null;

      const aRaw = results[0][1];
      const bRaw = results[1][1];

      if (aRaw && bRaw) {
        const a = JSON.parse(aRaw);
        const b = JSON.parse(bRaw);
        console.log(`[MATCH] ${a.nickname} vs ${b.nickname}`);
        return { a, b };
      } else if (aRaw && !bRaw) {
        await this.redis.lpush(QUEUE_KEY, aRaw);
      }
      return null;
    } catch (err) {
      console.error('[ERROR] tryMatch failed:', err);
      throw err;
    }
  }

  async queueLen() {
    return await this.redis.llen(QUEUE_KEY);
  }

  async close() {
    await this.redis.quit();
  }
}

module.exports = Matchmaking;
