import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import JSZip from 'jszip';
import { TIME_CONTROLS } from './src/shared/types.ts';
import type {
  BoardSkinId,
  ClientToServerMessage,
  MoveRecord,
  PieceColor,
  PublicRoomSummary,
  RoomResult,
  RoomState,
  ServerToClientMessage,
  TimeControlId,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  name: string;
  roomId: string | null;
}

interface InternalRoom {
  id: string;
  isPublic: boolean;
  skinId: BoardSkinId;
  timeControl: TimeControlId;
  status: 'waiting' | 'active' | 'finished';
  chess: Chess;
  moves: MoveRecord[];
  players: {
    w: { clientId: string; name: string; connected: boolean } | null;
    b: { clientId: string; name: string; connected: boolean } | null;
  };
  members: Set<WebSocket>;
  clocks: { w: number; b: number };
  lastClockUpdateAt: number | null;
  drawOfferFrom: PieceColor | null;
  rematchVotes: Set<PieceColor>;
  result: RoomResult | null;
  createdAt: number;
  lastActivityAt: number;
}

interface QueueEntry {
  ws: WebSocket;
  clientId: string;
  name: string;
  timeControl: TimeControlId;
  skinId: BoardSkinId;
  joinedAt: number;
}

const VALID_SKINS = new Set<BoardSkinId>([
  'walnut-maple',
  'carrara-nero',
  'obsidian-brass',
  'emerald-ivory',
  'arctic-glass',
]);

const VALID_TIME_CONTROLS = new Set<TimeControlId>(['3+0', '5+3', '10+0', 'unlimited']);

const clients = new Map<WebSocket, ConnectedClient>();
const rooms = new Map<string, InternalRoom>();
const matchmakingQueue: QueueEntry[] = [];

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Player';
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 22);
  return cleaned.length > 0 ? cleaned : 'Player';
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function send(ws: WebSocket, msg: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getSpectatorCount(room: InternalRoom): number {
  let count = 0;
  for (const ws of room.members) {
    const client = clients.get(ws);
    if (!client) continue;
    const isWhite = room.players.w?.clientId === client.clientId;
    const isBlack = room.players.b?.clientId === client.clientId;
    if (!isWhite && !isBlack) count++;
  }
  return count;
}

function serializeRoom(room: InternalRoom): RoomState {
  syncRoomClock(room);
  return {
    id: room.id,
    isPublic: room.isPublic,
    skinId: room.skinId,
    timeControl: room.timeControl,
    status: room.status,
    fen: room.chess.fen(),
    turn: room.chess.turn() as PieceColor,
    moves: room.moves,
    players: {
      w: room.players.w ? { ...room.players.w } : null,
      b: room.players.b ? { ...room.players.b } : null,
    },
    spectatorCount: getSpectatorCount(room),
    clocks: { ...room.clocks },
    lastClockUpdateAt: room.lastClockUpdateAt,
    drawOfferFrom: room.drawOfferFrom,
    rematchVotes: Array.from(room.rematchVotes),
    result: room.result,
    createdAt: room.createdAt,
  };
}

function broadcastRoom(room: InternalRoom): void {
  const snapshot = serializeRoom(room);
  const payload = JSON.stringify({ type: 'room:state', room: snapshot } satisfies ServerToClientMessage);
  for (const ws of room.members) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function getPublicRooms(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  for (const room of rooms.values()) {
    if (!room.isPublic || room.status === 'finished') continue;
    const playersCount = (room.players.w ? 1 : 0) + (room.players.b ? 1 : 0);
    if (playersCount === 0) continue;
    const hostName = room.players.w?.name || room.players.b?.name || 'Player';
    list.push({
      id: room.id,
      hostName,
      timeControl: room.timeControl,
      skinId: room.skinId,
      playersCount,
      spectatorCount: getSpectatorCount(room),
      status: room.status,
    });
  }
  list.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'waiting' ? -1 : 1;
    return a.playersCount - b.playersCount;
  });
  return list.slice(0, 20);
}

function broadcastLobbyUpdates(): void {
  const publicRooms = getPublicRooms();
  const roomsPayload = JSON.stringify({ type: 'rooms:list', rooms: publicRooms } satisfies ServerToClientMessage);
  const presencePayload = JSON.stringify({
    type: 'server:presence',
    onlineCount: clients.size,
    queueCount: matchmakingQueue.length,
  } satisfies ServerToClientMessage);

  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(presencePayload);
      ws.send(roomsPayload);
    }
  }
}

function syncRoomClock(room: InternalRoom): boolean {
  const spec = TIME_CONTROLS[room.timeControl];
  if (!spec || spec.initialMs <= 0) return false;
  if (room.status !== 'active' || room.moves.length === 0 || room.lastClockUpdateAt === null) {
    return false;
  }

  const now = Date.now();
  const elapsed = Math.max(0, now - room.lastClockUpdateAt);
  const activeColor = room.chess.turn() as PieceColor;
  room.clocks[activeColor] = Math.max(0, room.clocks[activeColor] - elapsed);
  room.lastClockUpdateAt = now;

  if (room.clocks[activeColor] <= 0) {
    room.status = 'finished';
    room.result = {
      winner: activeColor === 'w' ? 'b' : 'w',
      reason: 'timeout',
    };
    room.lastClockUpdateAt = null;
    room.drawOfferFrom = null;
    return true;
  }
  return false;
}

function removeFromQueue(ws: WebSocket): boolean {
  const idx = matchmakingQueue.findIndex((q) => q.ws === ws);
  if (idx !== -1) {
    matchmakingQueue.splice(idx, 1);
    return true;
  }
  return false;
}

function leaveCurrentRoom(ws: WebSocket, markDisconnectOnly = false): void {
  const client = clients.get(ws);
  if (!client || !client.roomId) return;

  const room = rooms.get(client.roomId);
  client.roomId = null;
  if (!room) return;

  room.members.delete(ws);

  if (room.players.w?.clientId === client.clientId) {
    if (markDisconnectOnly && room.status === 'active') {
      room.players.w.connected = false;
    } else if (room.status === 'waiting') {
      room.players.w = null;
    } else {
      room.players.w.connected = false;
    }
  }
  if (room.players.b?.clientId === client.clientId) {
    if (markDisconnectOnly && room.status === 'active') {
      room.players.b.connected = false;
    } else if (room.status === 'waiting') {
      room.players.b = null;
    } else {
      room.players.b.connected = false;
    }
  }

  const anyConnectedPlayer =
    Boolean(room.players.w?.connected) || Boolean(room.players.b?.connected);

  if (room.members.size === 0 && !anyConnectedPlayer && room.status !== 'active') {
    rooms.delete(room.id);
  } else {
    broadcastRoom(room);
  }
  broadcastLobbyUpdates();
}

function createRoomInstance(
  timeControl: TimeControlId,
  skinId: BoardSkinId,
  isPublic: boolean,
): InternalRoom {
  const spec = TIME_CONTROLS[timeControl];
  const now = Date.now();
  const room: InternalRoom = {
    id: generateRoomCode(),
    isPublic,
    skinId,
    timeControl,
    status: 'waiting',
    chess: new Chess(),
    moves: [],
    players: { w: null, b: null },
    members: new Set(),
    clocks: { w: spec.initialMs, b: spec.initialMs },
    lastClockUpdateAt: null,
    drawOfferFrom: null,
    rematchVotes: new Set(),
    result: null,
    createdAt: now,
    lastActivityAt: now,
  };
  rooms.set(room.id, room);
  return room;
}

function evaluateGameOver(chess: Chess): RoomResult | null {
  if (chess.isCheckmate()) {
    const winner: PieceColor = chess.turn() === 'w' ? 'b' : 'w';
    return { winner, reason: 'checkmate' };
  }
  if (chess.isStalemate()) {
    return { winner: 'draw', reason: 'stalemate' };
  }
  if (chess.isInsufficientMaterial()) {
    return { winner: 'draw', reason: 'insufficient' };
  }
  if (chess.isThreefoldRepetition()) {
    return { winner: 'draw', reason: 'threefold' };
  }
  if (chess.isDraw()) {
    return { winner: 'draw', reason: 'fifty-move' };
  }
  return null;
}

function handleMessage(ws: WebSocket, raw: string): void {
  const client = clients.get(ws);
  if (!client) return;

  let msg: ClientToServerMessage;
  try {
    msg = JSON.parse(raw) as ClientToServerMessage;
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'client:hello': {
      if (typeof msg.clientId === 'string' && msg.clientId.length >= 6 && msg.clientId.length <= 64) {
        client.clientId = msg.clientId;
      }
      client.name = sanitizeName(msg.name);
      send(ws, {
        type: 'server:welcome',
        clientId: client.clientId,
        onlineCount: clients.size,
      });
      send(ws, { type: 'rooms:list', rooms: getPublicRooms() });
      break;
    }

    case 'rooms:list': {
      send(ws, { type: 'rooms:list', rooms: getPublicRooms() });
      break;
    }

    case 'room:create': {
      removeFromQueue(ws);
      leaveCurrentRoom(ws);

      client.name = sanitizeName(msg.name);
      const tc: TimeControlId = VALID_TIME_CONTROLS.has(msg.timeControl)
        ? msg.timeControl
        : '5+3';
      const skin: BoardSkinId = VALID_SKINS.has(msg.skinId) ? msg.skinId : 'walnut-maple';
      const room = createRoomInstance(tc, skin, Boolean(msg.isPublic));

      const chosenColor: PieceColor =
        msg.preferredColor === 'w' || msg.preferredColor === 'b'
          ? msg.preferredColor
          : Math.random() < 0.5
            ? 'w'
            : 'b';

      room.players[chosenColor] = {
        clientId: client.clientId,
        name: client.name,
        connected: true,
      };
      room.members.add(ws);
      client.roomId = room.id;

      send(ws, {
        type: 'room:joined',
        room: serializeRoom(room),
        role: chosenColor,
      });
      broadcastLobbyUpdates();
      break;
    }

    case 'room:join': {
      removeFromQueue(ws);
      const normalizedId = String(msg.roomId || '')
        .trim()
        .toUpperCase()
        .slice(0, 12);
      const room = rooms.get(normalizedId);
      if (!room) {
        send(ws, { type: 'room:error', message: `Room "${normalizedId}" was not found.` });
        return;
      }

      if (client.roomId && client.roomId !== room.id) {
        leaveCurrentRoom(ws);
      }

      client.name = sanitizeName(msg.name);
      room.members.add(ws);
      client.roomId = room.id;
      room.lastActivityAt = Date.now();

      let role: PieceColor | 'spectator' = 'spectator';

      if (room.players.w?.clientId === client.clientId) {
        room.players.w.connected = true;
        room.players.w.name = client.name;
        role = 'w';
      } else if (room.players.b?.clientId === client.clientId) {
        room.players.b.connected = true;
        room.players.b.name = client.name;
        role = 'b';
      } else if (!room.players.w) {
        room.players.w = { clientId: client.clientId, name: client.name, connected: true };
        role = 'w';
      } else if (!room.players.b) {
        room.players.b = { clientId: client.clientId, name: client.name, connected: true };
        role = 'b';
      }

      if (room.players.w && room.players.b && room.status === 'waiting') {
        room.status = 'active';
      }

      send(ws, { type: 'room:joined', room: serializeRoom(room), role });
      broadcastRoom(room);
      broadcastLobbyUpdates();
      break;
    }

    case 'room:leave': {
      removeFromQueue(ws);
      leaveCurrentRoom(ws);
      break;
    }

    case 'matchmaking:join': {
      leaveCurrentRoom(ws);
      removeFromQueue(ws);
      client.name = sanitizeName(msg.name);
      const tc: TimeControlId = VALID_TIME_CONTROLS.has(msg.timeControl)
        ? msg.timeControl
        : '5+3';
      const skin: BoardSkinId = VALID_SKINS.has(msg.skinId) ? msg.skinId : 'walnut-maple';

      const matchIdx = matchmakingQueue.findIndex(
        (entry) => entry.timeControl === tc && entry.clientId !== client.clientId && entry.ws.readyState === WebSocket.OPEN,
      );

      if (matchIdx !== -1) {
        const opponent = matchmakingQueue.splice(matchIdx, 1)[0];
        const room = createRoomInstance(tc, opponent.skinId || skin, false);
        const swap = Math.random() < 0.5;
        const whiteEntry = swap
          ? { ws, clientId: client.clientId, name: client.name }
          : { ws: opponent.ws, clientId: opponent.clientId, name: opponent.name };
        const blackEntry = swap
          ? { ws: opponent.ws, clientId: opponent.clientId, name: opponent.name }
          : { ws, clientId: client.clientId, name: client.name };

        room.players.w = {
          clientId: whiteEntry.clientId,
          name: whiteEntry.name,
          connected: true,
        };
        room.players.b = {
          clientId: blackEntry.clientId,
          name: blackEntry.name,
          connected: true,
        };
        room.status = 'active';
        room.members.add(whiteEntry.ws);
        room.members.add(blackEntry.ws);

        const whiteClient = clients.get(whiteEntry.ws);
        const blackClient = clients.get(blackEntry.ws);
        if (whiteClient) whiteClient.roomId = room.id;
        if (blackClient) blackClient.roomId = room.id;

        const snapshot = serializeRoom(room);
        send(whiteEntry.ws, { type: 'room:joined', room: snapshot, role: 'w' });
        send(blackEntry.ws, { type: 'room:joined', room: snapshot, role: 'b' });
      } else {
        matchmakingQueue.push({
          ws,
          clientId: client.clientId,
          name: client.name,
          timeControl: tc,
          skinId: skin,
          joinedAt: Date.now(),
        });
        send(ws, {
          type: 'matchmaking:queued',
          position: matchmakingQueue.length,
          timeControl: tc,
        });
      }
      broadcastLobbyUpdates();
      break;
    }

    case 'matchmaking:cancel': {
      if (removeFromQueue(ws)) {
        send(ws, { type: 'matchmaking:cancelled' });
        broadcastLobbyUpdates();
      }
      break;
    }

    case 'game:move': {
      const room = rooms.get(msg.roomId);
      if (!room || client.roomId !== room.id) return;

      if (syncRoomClock(room)) {
        broadcastRoom(room);
        return;
      }

      if (room.status !== 'active') {
        send(ws, {
          type: 'game:move-rejected',
          reason: room.status === 'waiting' ? 'Waiting for opponent to join.' : 'Game is already over.',
          fen: room.chess.fen(),
        });
        return;
      }

      const activeTurn = room.chess.turn() as PieceColor;
      const seatedPlayer = room.players[activeTurn];
      if (!seatedPlayer || seatedPlayer.clientId !== client.clientId) {
        send(ws, {
          type: 'game:move-rejected',
          reason: 'Not your turn.',
          fen: room.chess.fen(),
        });
        return;
      }

      try {
        const moveResult = room.chess.move({
          from: msg.from,
          to: msg.to,
          promotion: msg.promotion || 'q',
        });

        if (!moveResult) {
          send(ws, {
            type: 'game:move-rejected',
            reason: 'Illegal move.',
            fen: room.chess.fen(),
          });
          return;
        }

        const spec = TIME_CONTROLS[room.timeControl];
        if (spec.initialMs > 0) {
          if (room.moves.length > 0 && spec.incrementMs > 0) {
            room.clocks[activeTurn] += spec.incrementMs;
          }
          room.lastClockUpdateAt = Date.now();
        }

        const record: MoveRecord = {
          ply: room.moves.length + 1,
          san: moveResult.san,
          uci: `${moveResult.from}${moveResult.to}${moveResult.promotion || ''}`,
          from: moveResult.from,
          to: moveResult.to,
          color: moveResult.color as PieceColor,
          piece: moveResult.piece as MoveRecord['piece'],
          captured: moveResult.captured as MoveRecord['captured'],
          promotion: moveResult.promotion as MoveRecord['promotion'],
          fen: room.chess.fen(),
          timestamp: Date.now(),
        };

        room.moves.push(record);
        room.drawOfferFrom = null;
        room.lastActivityAt = Date.now();

        const over = evaluateGameOver(room.chess);
        if (over) {
          room.status = 'finished';
          room.result = over;
          room.lastClockUpdateAt = null;
        }

        broadcastRoom(room);
      } catch {
        send(ws, {
          type: 'game:move-rejected',
          reason: 'Invalid move.',
          fen: room.chess.fen(),
        });
      }
      break;
    }

    case 'game:resign': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'active') return;
      const role: PieceColor | null =
        room.players.w?.clientId === client.clientId
          ? 'w'
          : room.players.b?.clientId === client.clientId
            ? 'b'
            : null;
      if (!role) return;

      syncRoomClock(room);
      room.status = 'finished';
      room.result = { winner: role === 'w' ? 'b' : 'w', reason: 'resignation' };
      room.lastClockUpdateAt = null;
      room.drawOfferFrom = null;
      broadcastRoom(room);
      broadcastLobbyUpdates();
      break;
    }

    case 'game:draw-offer': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'active') return;
      const role: PieceColor | null =
        room.players.w?.clientId === client.clientId
          ? 'w'
          : room.players.b?.clientId === client.clientId
            ? 'b'
            : null;
      if (!role) return;
      room.drawOfferFrom = role;
      broadcastRoom(room);
      break;
    }

    case 'game:draw-respond': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'active' || !room.drawOfferFrom) return;
      const role: PieceColor | null =
        room.players.w?.clientId === client.clientId
          ? 'w'
          : room.players.b?.clientId === client.clientId
            ? 'b'
            : null;
      if (!role || role === room.drawOfferFrom) return;

      if (msg.accept) {
        room.status = 'finished';
        room.result = { winner: 'draw', reason: 'agreement' };
        room.lastClockUpdateAt = null;
      }
      room.drawOfferFrom = null;
      broadcastRoom(room);
      break;
    }

    case 'game:rematch': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'finished') return;
      const role: PieceColor | null =
        room.players.w?.clientId === client.clientId
          ? 'w'
          : room.players.b?.clientId === client.clientId
            ? 'b'
            : null;
      if (!role) return;

      room.rematchVotes.add(role);
      if (room.rematchVotes.has('w') && room.rematchVotes.has('b')) {
        // Swap colors for rematch
        const prevW = room.players.w;
        room.players.w = room.players.b;
        room.players.b = prevW;
        room.chess = new Chess();
        room.moves = [];
        room.status = 'active';
        room.result = null;
        room.drawOfferFrom = null;
        room.rematchVotes.clear();
        const spec = TIME_CONTROLS[room.timeControl];
        room.clocks = { w: spec.initialMs, b: spec.initialMs };
        room.lastClockUpdateAt = null;
        room.lastActivityAt = Date.now();

        const snapshot = serializeRoom(room);
        for (const memberWs of room.members) {
          const member = clients.get(memberWs);
          if (!member) continue;
          const newRole: PieceColor | 'spectator' =
            room.players.w?.clientId === member.clientId
              ? 'w'
              : room.players.b?.clientId === member.clientId
                ? 'b'
                : 'spectator';
          send(memberWs, { type: 'room:joined', room: snapshot, role: newRole });
        }
      } else {
        broadcastRoom(room);
      }
      break;
    }

    case 'room:skin': {
      const room = rooms.get(msg.roomId);
      if (!room || !VALID_SKINS.has(msg.skinId)) return;
      const isPlayer =
        room.players.w?.clientId === client.clientId ||
        room.players.b?.clientId === client.clientId;
      if (!isPlayer) return;
      room.skinId = msg.skinId;
      broadcastRoom(room);
      broadcastLobbyUpdates();
      break;
    }
  }
}

// Periodic server-side clock timeout & stale room cleanup
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (syncRoomClock(room)) {
      broadcastRoom(room);
    }
    if (room.members.size === 0 && now - room.lastActivityAt > 15 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 1000);

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      online: clients.size,
      activeRooms: rooms.size,
      queueSize: matchmakingQueue.length,
    });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getPublicRooms() });
  });

  // Serve bundled MP3 voice clips directly so they never fall through to SPA HTML
  app.use(
    '/voices',
    express.static(path.resolve(__dirname, 'public', 'voices'), {
      maxAge: '7d',
      fallthrough: false,
    }),
  );

  const buildWindowsPlayBat = (): string =>
    [
      '@echo off',
      'setlocal EnableExtensions',
      'title Chess3D',
      'cd /d "%~dp0"',
      '',
      'where node >nul 2>&1',
      'if errorlevel 1 (',
      '  if exist "%ProgramFiles%\\nodejs\\node.exe" set "PATH=%ProgramFiles%\\nodejs;%PATH%"',
      '  if exist "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe" set "PATH=%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
      ')',
      '',
      'if not exist "node_modules" (',
      '  call "%~dp0install-and-play.bat"',
      '  exit /b %errorlevel%',
      ')',
      'if not exist "dist\\index.html" (',
      '  call "%~dp0install-and-play.bat"',
      '  exit /b %errorlevel%',
      ')',
      '',
      'rem If Chess3D is already running on port 3000, just open the browser',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:3000/api/health; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1',
      'if not errorlevel 1 (',
      '  echo Chess3D is already running. Opening http://localhost:3000 ...',
      '  start "" "http://localhost:3000"',
      '  exit /b 0',
      ')',
      '',
      'echo ============================================================',
      'echo   Chess3D is starting...',
      'echo   Browser URL: http://localhost:3000',
      'echo   Keep this window open while playing. Close it to stop.',
      'echo ============================================================',
      'echo.',
      '',
      'set "NODE_ENV=production"',
      'set "PORT=3000"',
      'start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"',
      '',
      'if exist "node_modules\\.bin\\tsx.cmd" (',
      '  call "node_modules\\.bin\\tsx.cmd" server.ts',
      ') else (',
      '  call npx tsx server.ts',
      ')',
      '',
      'if errorlevel 1 (',
      '  echo.',
      '  echo Chess3D stopped with an error.',
      '  pause',
      ')',
      'exit /b %errorlevel%',
      '',
    ].join('\r\n');

  const buildWindowsInstallBat = (): string =>
    [
      '@echo off',
      'setlocal EnableExtensions EnableDelayedExpansion',
      'title Chess3D - Windows Installer',
      'cd /d "%~dp0"',
      '',
      'echo ============================================================',
      'echo   Chess3D - One-Click Windows Installer',
      'echo ============================================================',
      'echo.',
      '',
      'if not exist "package.json" (',
      '  echo [ERROR] package.json was not found in this folder.',
      '  echo Please extract the full chess3d.zip archive first, then run',
      '  echo install-and-play.bat from inside the extracted chess3d folder.',
      '  echo.',
      '  pause',
      '  exit /b 1',
      ')',
      '',
      'echo [1/4] Checking Node.js installation...',
      'where node >nul 2>&1',
      'if errorlevel 1 (',
      '  if exist "%ProgramFiles%\\nodejs\\node.exe" set "PATH=%ProgramFiles%\\nodejs;%PATH%"',
      '  if exist "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe" set "PATH=%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
      ')',
      '',
      'where node >nul 2>&1',
      'if errorlevel 1 (',
      '  echo Node.js was not found. Attempting automatic install via winget...',
      '  where winget >nul 2>&1',
      '  if not errorlevel 1 (',
      '    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements',
      '    if exist "%ProgramFiles%\\nodejs\\node.exe" set "PATH=%ProgramFiles%\\nodejs;%PATH%"',
      '    if exist "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe" set "PATH=%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"',
      '  )',
      ')',
      '',
      'where node >nul 2>&1',
      'if errorlevel 1 (',
      '  echo.',
      '  echo [ACTION REQUIRED] Node.js 20+ is needed to run Chess3D locally.',
      '  echo Opening https://nodejs.org/ in your browser...',
      '  start "" "https://nodejs.org/"',
      '  echo Install Node.js LTS, then double-click install-and-play.bat again.',
      '  echo.',
      '  pause',
      '  exit /b 1',
      ')',
      '',
      'for /f "delims=" %%v in (\'node -v\') do echo       Found Node.js %%v',
      'echo.',
      '',
      'echo [2/4] Installing Chess3D packages (this may take 1-2 minutes)...',
      'call npm install --no-audit --no-fund',
      'if errorlevel 1 (',
      '  echo.',
      '  echo [ERROR] npm install failed. Check your internet connection and try again.',
      '  echo.',
      '  pause',
      '  exit /b 1',
      ')',
      'echo.',
      '',
      'echo [3/4] Building Chess3D for fast local play...',
      'call npm run build',
      'if errorlevel 1 (',
      '  echo.',
      '  echo [ERROR] Build failed. See messages above for details.',
      '  echo.',
      '  pause',
      '  exit /b 1',
      ')',
      'echo.',
      '',
      'echo [4/4] Creating Desktop shortcut (Chess3D)...',
      'set "APP_DIR=%~dp0"',
      'if "%APP_DIR:~-1%"=="\\" set "APP_DIR=%APP_DIR:~0,-1%"',
      'set "TARGET_BAT=%APP_DIR%\\play-chess3d.bat"',
      'if not exist "%TARGET_BAT%" set "TARGET_BAT=%APP_DIR%\\install-and-play.bat"',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath(\'Desktop\'); $s = $ws.CreateShortcut((Join-Path $desktop \'Chess3D.lnk\')); $s.TargetPath = $env:TARGET_BAT; $s.WorkingDirectory = $env:APP_DIR; $s.Description = \'Play Chess3D\'; $s.Save()" >nul 2>&1',
      'if errorlevel 1 (',
      '  echo       Skipped Desktop shortcut. You can launch anytime via play-chess3d.bat.',
      ') else (',
      '  echo       Desktop shortcut "Chess3D" created!',
      ')',
      'echo.',
      'echo Installation complete! Launching Chess3D...',
      'echo.',
      'if exist "%~dp0play-chess3d.bat" (',
      '  call "%~dp0play-chess3d.bat"',
      '  exit /b %errorlevel%',
      ')',
      'set "NODE_ENV=production"',
      'set "PORT=3000"',
      'start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"',
      'if exist "node_modules\\.bin\\tsx.cmd" (',
      '  call "node_modules\\.bin\\tsx.cmd" server.ts',
      ') else (',
      '  call npx tsx server.ts',
      ')',
      'exit /b %errorlevel%',
      '',
    ].join('\r\n');

  // Standalone download for the Windows installer batch file
  app.get('/api/download-bat', (_req, res) => {
    const content = buildWindowsInstallBat();
    res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="install-and-play.bat"');
    res.send(content);
  });

  // Download the entire game as a clean, runnable ZIP archive (includes Windows .bat installers)
  app.get('/api/download-game', async (_req, res) => {
    try {
      const zip = new JSZip();
      const rootDir = __dirname;
      const rootFolder = zip.folder('chess3d')!;

      const topLevelFiles = [
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'index.html',
        'server.ts',
        'metadata.json',
        '.env.example',
        '.gitignore',
      ];

      for (const fileName of topLevelFiles) {
        const fullPath = path.join(rootDir, fileName);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          rootFolder.file(fileName, fs.readFileSync(fullPath));
        }
      }

      const addDirRecursive = (dirRel: string) => {
        const absDir = path.join(rootDir, dirRel);
        if (!fs.existsSync(absDir)) return;
        for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
            continue;
          }
          const relPath = path.posix.join(dirRel.replace(/\\/g, '/'), entry.name);
          const absPath = path.join(absDir, entry.name);
          if (entry.isDirectory()) {
            addDirRecursive(relPath);
          } else if (entry.isFile()) {
            rootFolder.file(relPath, fs.readFileSync(absPath));
          }
        }
      };

      addDirRecursive('src');
      addDirRecursive('public');

      rootFolder.file('install-and-play.bat', buildWindowsInstallBat());
      rootFolder.file('play-chess3d.bat', buildWindowsPlayBat());

      const readme = [
        '# Chess3D',
        '',
        'A full-stack 3D chess game featuring hand-carved wooden Staunton pieces, bundled offline MP3 voice commentary, real-time multiplayer, custom board skins, game replays, and an integrated multi-PV analysis & AI engine.',
        '',
        '## Windows Easy Install (One-Click)',
        '',
        '1. Extract this ZIP archive to any folder (for example `C:\\Games\\chess3d`).',
        '2. Double-click **`install-and-play.bat`**.',
        '   - Automatically checks for Node.js (and installs Node.js LTS via `winget` if missing).',
        '   - Installs dependencies and builds Chess3D for fast local play.',
        '   - Creates a **Chess3D** shortcut on your Windows Desktop.',
        '   - Opens Chess3D automatically in your browser at `http://localhost:3000`.',
        '3. Next time, just double-click the **Chess3D** Desktop shortcut (or `play-chess3d.bat`).',
        '',
        '## Manual Start (macOS / Linux / Windows)',
        '',
        '1. Make sure you have Node.js 20+ installed.',
        '2. Install dependencies:',
        '   ```bash',
        '   npm install',
        '   ```',
        '3. Build and start the game server:',
        '   ```bash',
        '   npm run build',
        '   NODE_ENV=production npx tsx server.ts',
        '   ```',
        '4. Open http://localhost:3000 in your browser.',
        '',
        '## Offline App Mode',
        '',
        'Once running in Chrome, Edge, or Safari, you can install Chess3D to your desktop or home screen as an offline-capable PWA.',
        '',
      ].join('\n');
      rootFolder.file('README.md', readme);

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="chess3d.zip"');
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      console.error('Failed to package game ZIP:', err);
      res.status(500).json({ error: 'Unable to package game archive.' });
    }
  });

  const server = http.createServer(app);

  // Attach WebSocket server on dedicated /ws endpoint via explicit upgrade routing
  const wss = new WebSocketServer({ noServer: true });
  const viteHmrWss = new WebSocketServer({ noServer: true });

  viteHmrWss.on('connection', (ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected' }));
    }
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    const proto = String(request.headers['sec-websocket-protocol'] || '');
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (!IS_PROD && proto.includes('vite-hmr')) {
      // Quietly acknowledge Vite dev client's WS handshake so @vite/client never logs a WS error
      viteHmrWss.handleUpgrade(request, socket, head, (ws) => {
        viteHmrWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const tempId = `p_${Math.random().toString(36).slice(2, 10)}`;
    clients.set(ws, {
      ws,
      clientId: tempId,
      name: 'Player',
      roomId: null,
    });

    broadcastLobbyUpdates();

    ws.on('message', (data) => {
      handleMessage(ws, typeof data === 'string' ? data : data.toString('utf8'));
    });

    ws.on('close', () => {
      removeFromQueue(ws);
      leaveCurrentRoom(ws, true);
      clients.delete(ws);
      broadcastLobbyUpdates();
    });

    ws.on('error', () => {
      removeFromQueue(ws);
      leaveCurrentRoom(ws, true);
      clients.delete(ws);
    });
  });

  const distDir = path.resolve(__dirname, 'dist');
  if (IS_PROD && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    // In dev middleware mode with HMR disabled, replace Vite's unused HMR WebSocket
    // transport (which otherwise targets port 24678) with a synchronous no-op connected
    // transport so plugins like vite-plugin-pwa can call hot.send() cleanly without
    // WebSocket or SendBeforeConnectError failures.
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result?.code) {
          next();
          return;
        }
        const patched = result.code
          .replace(/const hmrPort\s*=\s*\d+;/g, 'const hmrPort = null;')
          .replace(
            /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
            'const transport = normalizeModuleRunnerTransport({ connect(handlers) { handlers.onMessage({ type: "connected" }); }, disconnect() {}, send() {} });',
          );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(patched);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chess3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
