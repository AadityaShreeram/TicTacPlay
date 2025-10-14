// Matchmaking backed by Redis list
// Uses a Redis list "tic:match:queue" to store JSON-encoded { socketId, nickname }

const IORedis = require('ioredis');
const dotenv = require('dotenv');
dotenv.config();

const redis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false
});

const QUEUE_KEY = 'tic:match:queue';

class Matchmaking {
  constructor() {
    this.redis = redis;
  }

  // enqueue a player
  async enqueue({ socketId, nickname }) {
    const payload = JSON.stringify({ socketId, nickname });
    await this.redis.rpush(QUEUE_KEY, payload);
  }

  // remove a player by socketId (if they cancel / disconnect)
  async removeBySocket(socketId) {
    // Remove all occurrences from list (count 0 => all)
    // Must pass exact string; we'll create pattern by scanning but simpler to LREM by exact item.
    const list = await this.redis.lrange(QUEUE_KEY, 0, -1);
    for (const item of list) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.socketId === socketId) {
          await this.redis.lrem(QUEUE_KEY, 0, item);
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // try to atomically pop two players and return pair object or null if not enough players
  async tryMatch() {
    // We'll attempt to LPOP twice in a MULTI/EXEC to reduce race conditions.
    const multi = this.redis.multi();
    multi.lpop(QUEUE_KEY);
    multi.lpop(QUEUE_KEY);
    const results = await multi.exec();
    // results is array of [err, value] pairs. In ioredis `multi.exec()` returns array of results.
    if (!results) return null;

    const aRaw = results[0][1];
    const bRaw = results[1][1];

    if (aRaw && bRaw) {
      try {
        const a = JSON.parse(aRaw);
        const b = JSON.parse(bRaw);
        return { a, b };
      } catch (e) {
        // parse error - skip
        return null;
      }
    } else if (aRaw && !bRaw) {
      // Only one popped -> push it back (avoid losing)
      await this.redis.lpush(QUEUE_KEY, aRaw);
      return null;
    } else {
      // none popped
      return null;
    }
  }

  // helper to check queue length (optional)
  async queueLen() {
    return await this.redis.llen(QUEUE_KEY);
  }

  async close() {
    await this.redis.quit();
  }
}

module.exports = Matchmaking;
