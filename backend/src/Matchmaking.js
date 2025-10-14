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

  async removeBySocket(socketId) {
    const list = await this.redis.lrange(QUEUE_KEY, 0, -1);
    for (const item of list) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.socketId === socketId) {
          await this.redis.lrem(QUEUE_KEY, 0, item);
        }
      } catch (e) {
      }
    }
  }

  async tryMatch() {
    const multi = this.redis.multi();
    multi.lpop(QUEUE_KEY);
    multi.lpop(QUEUE_KEY);
    const results = await multi.exec();
    if (!results) return null;

    const aRaw = results[0][1];
    const bRaw = results[1][1];

    if (aRaw && bRaw) {
      try {
        const a = JSON.parse(aRaw);
        const b = JSON.parse(bRaw);
        return { a, b };
      } catch (e) {
        return null;
      }
    } else if (aRaw && !bRaw) {
      await this.redis.lpush(QUEUE_KEY, aRaw);
      return null;
    } else {
      return null;
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
