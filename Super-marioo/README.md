# Super Mario — Browser Platformer

A Super Mario-style side-scrolling platformer that runs in the browser, with an Express server for static files and a high-score leaderboard.

## Requirements

- [Node.js](https://nodejs.org/) **18** or newer
- npm (included with Node.js)

## Run locally

1. **Clone or download** this repository, then open a terminal in the project folder:

   ```bash
   cd supermario
   ```

2. **Install dependencies** (first time only):

   ```bash
   npm install
   ```

3. **Start the server**:

   ```bash
   npm start
   ```

4. **Open the game** in your browser:

   ```
   http://localhost:3000
   ```

The server prints the URL when it starts. Press `Ctrl+C` in the terminal to stop it.

### Change the port

By default the app uses port **3000**. To use another port:

**PowerShell**

```powershell
$env:PORT=3001; npm start
```

**Command Prompt (cmd)**

```cmd
set PORT=3001 && npm start
```

Then open `http://localhost:3001` (or whatever port you chose).

## How to play

| Action | Keys |
|--------|------|
| Move left | `←` or `A` |
| Move right | `→` or `D` |
| Jump | `↑`, `W`, or `Space` |

From the main menu you can start a run, pick a map, and change your avatar. Each full game is **3 levels** in a row.

## Project layout

```
supermario/
├── public/          # Game UI (HTML, CSS, JavaScript)
├── server/          # Express API and static file server
├── data/            # High scores (created automatically at runtime)
├── package.json
└── README.md
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the game server |
| `npm run dev` | Same as `npm start` |

## API (optional)

- `GET /api/health` — server health check
- `GET /api/scores` — leaderboard
- `POST /api/scores` — submit a score (`{ "name": "...", "score": 123 }`)
