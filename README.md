# 🎮 TicTacPlay

**TicTacPlay** is a **backend-driven**, real-time multiplayer **Tic-Tac-Toe** platform featuring matchmaking, custom rooms, and a live leaderboard.

Built with **Node.js**, **Socket.IO**, **MySQL**, and **Redis**, it focuses on **scalable backend architecture**, **real-time synchronization**, and **state management**.

The frontend (built with React + Vite) serves as a **mobile-first interface** to the backend logic powering matchmaking, game sessions, and leaderboard computation.

---

## 🧩 Project Overview

TicTacPlay allows players to:

* Reserve a **unique nickname** via Redis locks.
* **Join random matchmaking queues** or **create/join custom rooms**.
* Play **Tic-Tac-Toe in real time** through Socket.IO events.
* View a **live leaderboard** computed dynamically from MySQL and Redis data.
* **Play again** instantly using Redis queue persistence or custom room replays.

> The system focuses on **real-time backend orchestration** — the frontend only mirrors backend events.

---

## 🌐 Live Validation Links

* 🎨 **Frontend (Play Here):** [https://tic-tac-play-gules.vercel.app/](https://tic-tac-play-gules.vercel.app/)
* ⚙️ **Backend (API Validation):** [https://tictacplay-production.up.railway.app/](https://tictacplay-production.up.railway.app/)

---

## 🏗 Architecture

### ⚙️ Tech Stack & Reasoning

| Component                   | Choice & Reasoning                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| **Backend**                 | **Node.js + Express** — lightweight, non-blocking, event-driven core for real-time APIs. |
| **Real-Time Communication** | **Socket.IO** — maintains live, bi-directional state sync between players and server.    |
| **Database**                | **MySQL** — stores persistent leaderboard and game history with indexed lookups.         |
| **In-Memory Store**         | **Redis** — powers matchmaking, nickname locking, and low-latency session tracking.      |
| **Frontend**                | **React (Vite)** — mobile-optimized interface consuming backend sockets & APIs.          |
| **Deployment**              | **Railway** for backend hosting, **Vercel** for frontend deployment.                     |

---

## ⚙️ Backend Design Highlights

### 🧠 Core Backend Responsibilities

* **Real-time Matchmaking Queue** (Redis)
* **Player State & Nickname Locks**
* **Game Session Management**
* **Result Recording & Leaderboard Updates**
* **Socket.IO Room Management**
* **Race-condition Prevention** using Redis locks
* **Low-latency broadcasting** with Socket.IO

### 🧮 Leaderboard Calculation Logic

Weighted scoring based on wins, draws, losses, and total game duration:

```js
score = (wins * 3 + draws * 1 - losses * 1) * (1 - (total_time_seconds / (total_time_seconds + 100)))
```

This discourages short, farmed matches and rewards fair gameplay.

---

## ⚡ Redis Usage

* **Matchmaking Queue:** O(1) enqueue/dequeue using `RPUSH` / `LPOP`.
* **Nickname Reservation:** Prevents duplicate usernames with Redis locks.
* **Socket Mapping:** Maps active socket IDs ↔ nicknames.
* **Real-time Player Tracking:** Fast updates for joins, leaves, and replays.

---

## 💾 MySQL Usage

* Persistent storage of **leaderboard data** and **match history**.
* Indexed on `nickname` for quick search and updates.
* Combined with Redis for **read-heavy hybrid caching**.

---

## 🔌 Node.js + Socket.IO Architecture

* Handles **thousands of concurrent players** efficiently.
* Manages **real-time game state sync** with acknowledgment events.
* Uses **Socket.IO rooms** for isolated matches and broadcast events.
* Employs Redis pub/sub for **distributed event coordination** (scalable to multi-instance).

---

## 💻 Frontend (Mobile UI)

* Built with **React + Vite**, the UI mirrors backend events via WebSocket streams.
* Designed specifically for **mobile devices**, ensuring responsive layouts and fast gameplay feedback.

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/<your-username>/TicTacPlay.git
cd TicTacPlay
```

---

### 2️⃣ Backend Setup

```bash
cd backend
npm install
```

#### Create a `.env` file inside `/backend`:

```env
PORT=4000

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DATABASE=tictacplay

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
```

#### Start the backend:

```bash
npm start
```

Backend runs at:
👉 **[http://localhost:4000](http://localhost:4000)**

---

### 3️⃣ Frontend Setup

```bash
cd ../frontend
npm install
```

#### Create a `.env` file inside `/frontend`:

```env
VITE_BACKEND_URL=http://localhost:4000
```

#### Start the frontend:

```bash
npm run dev
```

Frontend runs at:
👉 **[http://localhost:5173](http://localhost:5173)**

---

### 4️⃣ Database Setup

Create a MySQL database named **tictacplay**:

```sql
CREATE DATABASE tictacplay;
```

Run any migration scripts or let the backend auto-create tables on first use.

---

## 🚀 Deployment

| Component    | Platform                       | Description                               |
| ------------ | ------------------------------ | ----------------------------------------- |
| **Frontend** |  Vercel                        | Mobile UI served globally via CDN         |
| **Backend**  |  Railway                       | Node.js + Express server hosting          |
| **Database** | MySQL (Railway)                | Persistent leaderboard & history          |
| **Cache**    | Redis (Railway)                | Real-time matchmaking and session storage |

**CORS Settings:** Restricted to trusted origins (or `*` for public testing).

---


## 🔍 Real-Time Backend Systems

### 🧩 Matchmaking Queue

* Queue managed entirely in **Redis** with atomic operations.
* Ensures **no duplicate entries** using nickname-based locks.

### 🏆 Leaderboard

* Computed from MySQL data and cached in Redis.
* Supports **O(log n)** nickname searches.

### 🕹 Room and Replay Logic

* **Custom Rooms:** Created with 6-digit codes.
* **Normal Matches:** Re-enqueue players for replay after a match.
* Auto-win detection when opponent disconnects.

---

## 🔮 Future Improvements

* 🎥 **Spectator Mode** using Socket.IO rooms.
* 💾 **Persistent Replays** stored in MySQL or AWS S3.
* 🔎 **Advanced Leaderboard Filters** — by nickname, wins, or duration using Redis sorted sets.
* 🤖 **Skill-Based Matchmaking** — dynamic pairing using historical scores.

---

> *“Play fair, play fast — and may the best backend win!”*
