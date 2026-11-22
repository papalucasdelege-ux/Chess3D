import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync, spawnSync } from 'child_process';
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

const VALID_SKINS = new Set<BoardSkinId>(['walnut-maple']);

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

  // Automatically strip embedded audio streams (-an) from any lady/portrait video in public/assets
  const verifiedSilentVideos = new Map<string, number>();
  const ensureSilentVideoFile = (absFilePath: string): void => {
    try {
      if (!fs.existsSync(absFilePath) || !/\.(mp4|webm|mov|m4v)$/i.test(absFilePath)) return;
      const stat = fs.statSync(absFilePath);
      if (!stat.isFile()) return;
      if (verifiedSilentVideos.get(absFilePath) === stat.mtimeMs) return;

      const probeOut = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'a',
          '-show_entries',
          'stream=index',
          '-of',
          'csv=p=0',
          absFilePath,
        ],
        { encoding: 'utf8', timeout: 4000 },
      ).trim();

      if (probeOut.length > 0) {
        // Exception for special seduction video: preserve its sound by separating it into seduction.mp3 before muting the video track
        if (path.basename(absFilePath).toLowerCase() === 'angel_case_seduction.mp4') {
          try {
            const voicesFemaleDir = path.resolve(__dirname, 'public', 'voices', 'female');
            const rootSeductionMp3 = path.resolve(__dirname, 'public', 'seduction.mp3');
            const assetSeductionMp3 = path.resolve(__dirname, 'public', 'assets', 'aistudio', 'seduction.mp3');
            const voiceSeductionMp3 = path.join(voicesFemaleDir, 'seduction.mp3');
            fs.mkdirSync(voicesFemaleDir, { recursive: true });
            fs.mkdirSync(path.dirname(assetSeductionMp3), { recursive: true });
            const tmpMp3 = path.join(os.tmpdir(), `seduction_boot_${process.pid}_${Date.now()}.mp3`);
            execFileSync(
              'ffmpeg',
              ['-y', '-loglevel', 'error', '-i', absFilePath, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '2', tmpMp3],
              { timeout: 15000 },
            );
            fs.copyFileSync(tmpMp3, voiceSeductionMp3);
            fs.copyFileSync(tmpMp3, rootSeductionMp3);
            fs.copyFileSync(tmpMp3, assetSeductionMp3);
            fs.unlinkSync(tmpMp3);
          } catch {
            // ignore extraction failure
          }
        }

        const ext = path.extname(absFilePath) || '.mp4';
        const tmpOut = path.join(
          os.tmpdir(),
          `silent_${process.pid}_${Date.now()}${ext}`,
        );
        const faststartArgs = /\.mp4|\.m4v|\.mov/i.test(ext)
          ? ['-movflags', '+faststart']
          : [];
        execFileSync(
          'ffmpeg',
          ['-y', '-loglevel', 'error', '-i', absFilePath, '-c:v', 'copy', '-an', ...faststartArgs, tmpOut],
          { timeout: 10000 },
        );
        fs.copyFileSync(tmpOut, absFilePath);
        fs.unlinkSync(tmpOut);
      }

      const updatedStat = fs.statSync(absFilePath);
      verifiedSilentVideos.set(absFilePath, updatedStat.mtimeMs);
    } catch {
      // Gracefully continue if ffprobe/ffmpeg is unavailable in minimal runtime
    }
  };

  const publicAssetsDir = path.resolve(__dirname, 'public', 'assets');
  const publicVoicesFemaleDir = path.resolve(__dirname, 'public', 'voices', 'female');
  const seductionVoiceMp3Path = path.join(publicVoicesFemaleDir, 'seduction.mp3');
  const seductionRootMp3Path = path.resolve(__dirname, 'public', 'seduction.mp3');
  const sanitizeAllAssetVideosRecursive = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        sanitizeAllAssetVideosRecursive(full);
      } else if (entry.isFile() && /\.(mp4|webm|mov|m4v)$/i.test(entry.name)) {
        ensureSilentVideoFile(full);
      }
    }
  };
  sanitizeAllAssetVideosRecursive(publicAssetsDir);

  // Serve public media assets (including Chess Angel 3:4 portrait MP4 videos, guaranteed audio-free) with Range support
  app.use('/assets', (req, _res, next) => {
    if (/\.(mp4|webm|mov|m4v)$/i.test(req.path)) {
      const candidate = path.resolve(publicAssetsDir, '.' + req.path);
      if (candidate.startsWith(publicAssetsDir + path.sep)) {
        ensureSilentVideoFile(candidate);
      }
    }
    next();
  });
  app.use(
    '/assets',
    express.static(publicAssetsDir, {
      maxAge: '7d',
      fallthrough: true,
    }),
  );

  // Persistent Chess Angel Portrait Video Registry & Automatic Audio-Stripping Uploader
  const aistudioAssetsDir = path.resolve(publicAssetsDir, 'aistudio');
  const angelVideoMapPath = path.join(aistudioAssetsDir, 'angel_video_map.json');

  interface StoredAngelVideoMap {
    idle?: string;
    idleVariants: Record<string, string>;
    defaultSpeaking?: string;
    groups: Record<string, string>;
    cases: Record<string, string>;
    escapes: Record<string, string>;
    escapeEnabled?: Record<string, boolean>;
    caseEscapeCues?: Record<string, Partial<Record<'point_you' | 'push_button', 'on' | 'off'>>>;
    lipSync?: {
      defaultEnabled: boolean;
      groups: Record<string, 'on' | 'off'>;
      cases: Record<string, 'on' | 'off'>;
    };
    videoDurations?: Record<string, number>;
    escapeApexes?: Record<string, number>;
    videoMaxPlays?: Record<string, number>;
    videoPlayToEnd?: Record<string, boolean>;
    seductionAudioUrl?: string;
    seductionAudioDuration?: number;
    seductionAudioVariants?: Record<string, string>;
    seductionAudioDurations?: Record<string, number>;
    seductionTriggerMode?: 'balanced' | 'frequent' | 'dominant' | 'tactical';
  }
  const seductionAssetMp3Path = path.join(aistudioAssetsDir, 'seduction.mp3');

  const cachedVideoDurations = new Map<string, { mtimeMs: number; sec: number }>();
  const getVideoDurationSec = (absPath: string, mtimeMs: number): number | null => {
    const prev = cachedVideoDurations.get(absPath);
    if (prev && prev.mtimeMs === mtimeMs) return prev.sec;
    try {
      const out = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          absPath,
        ],
        { encoding: 'utf8', timeout: 4000 },
      ).trim();
      const d = parseFloat(out);
      if (Number.isFinite(d) && d > 0) {
        const rounded = Number(d.toFixed(1));
        cachedVideoDurations.set(absPath, { mtimeMs, sec: rounded });
        return rounded;
      }
    } catch {
      // ignore
    }
    return null;
  };

  /**
   * Measures the exact timestamp (20fps = 0.05s precision) inside an Escape Overlay .mp4
   * when Chess Angel's hand finishes lifting out of rest to point at "you" or the button below.
   */
  const cachedEscapeApexes = new Map<string, { mtimeMs: number; sec: number }>();
  const getEscapeGestureApexSec = (absPath: string, mtimeMs: number): number | null => {
    const prev = cachedEscapeApexes.get(absPath);
    if (prev && prev.mtimeMs === mtimeMs) return prev.sec;
    try {
      const buf = execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          absPath,
          '-vf',
          'fps=20,crop=iw*0.76:ih*0.44:iw*0.12:ih*0.52,scale=32:32,format=gray',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'gray',
          '-',
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: 6000 },
      );
      const frameBytes = 32 * 32;
      const frameCount = Math.floor(buf.length / frameBytes);
      if (frameCount < 8) return null;

      const baseFrames = Math.min(6, frameCount);
      const base = new Float64Array(frameBytes);
      for (let k = 0; k < baseFrames; k++) {
        const offset = k * frameBytes;
        for (let i = 0; i < frameBytes; i++) {
          base[i] += buf[offset + i] / baseFrames;
        }
      }

      const disp: number[] = new Array(frameCount);
      let maxDisp = 0;
      let maxIdx = 0;
      for (let k = 0; k < frameCount; k++) {
        const offset = k * frameBytes;
        let sum = 0;
        for (let i = 0; i < frameBytes; i++) {
          sum += Math.abs(buf[offset + i] - base[i]);
        }
        const d = sum / frameBytes;
        disp[k] = d;
        if (d > maxDisp) {
          maxDisp = d;
          maxIdx = k;
        }
      }

      if (maxDisp < 2.5) return null;

      let apexIdx = maxIdx;
      for (let k = 5; k < frameCount - 3; k++) {
        if (
          disp[k] >= maxDisp * 0.66 &&
          disp[k] >= disp[k - 1] &&
          disp[k] >= disp[k + 1] * 0.96 &&
          disp[k] >= disp[k + 2] * 0.94
        ) {
          apexIdx = k;
          break;
        }
      }

      const apexSec = Number((apexIdx / 20).toFixed(2));
      cachedEscapeApexes.set(absPath, { mtimeMs, sec: apexSec });
      return apexSec;
    } catch {
      return null;
    }
  };

  const stripQueryFromAssetUrl = (u: string | undefined): string | null => {
    if (!u || typeof u !== 'string') return null;
    const clean = u.split('?')[0];
    if (!clean.startsWith('/assets/aistudio/')) return null;
    return path.basename(clean);
  };

  const readAngelVideoMap = (): StoredAngelVideoMap => {
    const result: StoredAngelVideoMap = {
      idleVariants: {},
      groups: {},
      cases: {},
      escapes: {},
      escapeEnabled: {
        point_you: true,
        push_button: true,
      },
      caseEscapeCues: {},
      lipSync: {
        defaultEnabled: true,
        groups: {},
        cases: {},
      },
      videoDurations: {},
      escapeApexes: {},
      videoMaxPlays: {
        'case:tree_browse': 2,
        'case:seduction': 1,
      },
      videoPlayToEnd: {
        'case:seduction': true,
      },
    };

    try {
      if (fs.existsSync(angelVideoMapPath)) {
        const parsed = JSON.parse(
          fs.readFileSync(angelVideoMapPath, 'utf8'),
        ) as Partial<StoredAngelVideoMap>;
        if (typeof parsed.idle === 'string') {
          result.idle = parsed.idle;
          result.idleVariants.idle_1 = parsed.idle;
        }
        if (parsed.idleVariants && typeof parsed.idleVariants === 'object') {
          for (const [k, v] of Object.entries(parsed.idleVariants)) {
            if (typeof v === 'string') result.idleVariants[k] = v;
          }
        }
        if (typeof parsed.defaultSpeaking === 'string') {
          result.defaultSpeaking = parsed.defaultSpeaking;
        }
        if (parsed.groups && typeof parsed.groups === 'object') {
          for (const [k, v] of Object.entries(parsed.groups)) {
            if (typeof v === 'string') result.groups[k] = v;
          }
        }
        if (parsed.cases && typeof parsed.cases === 'object') {
          for (const [k, v] of Object.entries(parsed.cases)) {
            if (typeof v === 'string') result.cases[k] = v;
          }
        }
        if (parsed.escapes && typeof parsed.escapes === 'object') {
          for (const [k, v] of Object.entries(parsed.escapes)) {
            if (typeof v === 'string') result.escapes[k] = v;
          }
        }
        if (parsed.escapeEnabled && typeof parsed.escapeEnabled === 'object') {
          for (const [k, v] of Object.entries(parsed.escapeEnabled)) {
            if (typeof v === 'boolean' && result.escapeEnabled) {
              result.escapeEnabled[k] = v;
            }
          }
        }
        if (parsed.caseEscapeCues && typeof parsed.caseEscapeCues === 'object') {
          for (const [caseId, cueMap] of Object.entries(parsed.caseEscapeCues)) {
            if (cueMap && typeof cueMap === 'object' && result.caseEscapeCues) {
              const cleaned: Partial<Record<'point_you' | 'push_button', 'on' | 'off'>> = {};
              if (cueMap.point_you === 'on' || cueMap.point_you === 'off') {
                cleaned.point_you = cueMap.point_you;
              }
              if (cueMap.push_button === 'on' || cueMap.push_button === 'off') {
                cleaned.push_button = cueMap.push_button;
              }
              if (Object.keys(cleaned).length > 0) {
                result.caseEscapeCues[caseId] = cleaned;
              }
            }
          }
        }
        if (parsed.lipSync && typeof parsed.lipSync === 'object') {
          result.lipSync = {
            defaultEnabled: parsed.lipSync.defaultEnabled !== false,
            groups: {},
            cases: {},
          };
          if (parsed.lipSync.groups && typeof parsed.lipSync.groups === 'object') {
            for (const [k, v] of Object.entries(parsed.lipSync.groups)) {
              if (v === 'on' || v === 'off') result.lipSync.groups[k] = v;
            }
          }
          if (parsed.lipSync.cases && typeof parsed.lipSync.cases === 'object') {
            for (const [k, v] of Object.entries(parsed.lipSync.cases)) {
              if (v === 'on' || v === 'off') result.lipSync.cases[k] = v;
            }
          }
        }
        if (parsed.videoDurations && typeof parsed.videoDurations === 'object' && result.videoDurations) {
          for (const [k, v] of Object.entries(parsed.videoDurations)) {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
              result.videoDurations[k] = v;
            }
          }
        }
        if (parsed.escapeApexes && typeof parsed.escapeApexes === 'object' && result.escapeApexes) {
          for (const [k, v] of Object.entries(parsed.escapeApexes)) {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
              result.escapeApexes[k] = v;
            }
          }
        }
        if (parsed.videoMaxPlays && typeof parsed.videoMaxPlays === 'object' && result.videoMaxPlays) {
          for (const [k, v] of Object.entries(parsed.videoMaxPlays)) {
            if (typeof v === 'number' && Number.isFinite(v) && v >= -1) {
              result.videoMaxPlays[k] = Math.floor(v);
            }
          }
        }
        if (parsed.videoPlayToEnd && typeof parsed.videoPlayToEnd === 'object' && result.videoPlayToEnd) {
          for (const [k, v] of Object.entries(parsed.videoPlayToEnd)) {
            if (typeof v === 'boolean') {
              result.videoPlayToEnd[k] = v;
            }
          }
        }
        if (typeof parsed.seductionAudioUrl === 'string' && parsed.seductionAudioUrl.length > 0) {
          result.seductionAudioUrl = parsed.seductionAudioUrl;
        }
        if (
          typeof parsed.seductionAudioDuration === 'number' &&
          Number.isFinite(parsed.seductionAudioDuration) &&
          parsed.seductionAudioDuration > 0
        ) {
          result.seductionAudioDuration = parsed.seductionAudioDuration;
        }
        if (parsed.seductionAudioVariants && typeof parsed.seductionAudioVariants === 'object') {
          result.seductionAudioVariants = {};
          for (const [k, v] of Object.entries(parsed.seductionAudioVariants)) {
            if (typeof v === 'string' && v.length > 0) {
              result.seductionAudioVariants[k] = v;
            }
          }
        }
        if (parsed.seductionAudioDurations && typeof parsed.seductionAudioDurations === 'object') {
          result.seductionAudioDurations = {};
          for (const [k, v] of Object.entries(parsed.seductionAudioDurations)) {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
              result.seductionAudioDurations[k] = v;
            }
          }
        }
        if (
          parsed.seductionTriggerMode === 'balanced' ||
          parsed.seductionTriggerMode === 'frequent' ||
          parsed.seductionTriggerMode === 'dominant' ||
          parsed.seductionTriggerMode === 'tactical'
        ) {
          result.seductionTriggerMode = parsed.seductionTriggerMode;
        }
      }
    } catch {
      // Fall back to disk discovery
    }

    // Discover seduction.mp3 duration & cache-busted URL from /public/voices/female/seduction.mp3
    try {
      if (fs.existsSync(seductionVoiceMp3Path)) {
        const sStat = fs.statSync(seductionVoiceMp3Path);
        const sDur = getVideoDurationSec(seductionVoiceMp3Path, sStat.mtimeMs);
        if (sDur !== null) {
          result.seductionAudioDuration = sDur;
        }
        if (!result.seductionAudioUrl) {
          result.seductionAudioUrl = `/voices/female/seduction.mp3?v=${Math.floor(sStat.mtimeMs)}`;
        }
      }
    } catch {
      // ignore
    }

    // Auto-discover all .mp4 files in public/assets/aistudio (and record durations + escape gesture apexes)
    try {
      if (fs.existsSync(aistudioAssetsDir)) {
        for (const entry of fs.readdirSync(aistudioAssetsDir, { withFileTypes: true })) {
          if (
            !entry.isFile() ||
            !/\.(mp4|webm|mov|m4v)$/i.test(entry.name) ||
            entry.name.includes('.opt.') ||
            entry.name.includes('.tmp')
          ) {
            continue;
          }
          const full = path.join(aistudioAssetsDir, entry.name);
          const stat = fs.statSync(full);
          const cleanPublicPath = `/assets/aistudio/${entry.name}`;
          const dur = getVideoDurationSec(full, stat.mtimeMs);
          if (dur !== null && result.videoDurations) {
            result.videoDurations[cleanPublicPath] = dur;
          }

          const m = /^angel_(idle|default|group|case|escape)_([a-z0-9_]+)\.mp4$/i.exec(entry.name);
          if (!m) continue;
          const kind = m[1].toLowerCase();
          const key = m[2].toLowerCase();
          const versionedUrl = `${cleanPublicPath}?v=${Math.floor(stat.mtimeMs)}`;

          if (kind === 'idle') {
            const normKey = key === 'idle_listening' ? 'idle_1' : key;
            const existing = result.idleVariants[normKey];
            if (!existing || stripQueryFromAssetUrl(existing) === entry.name) {
              result.idleVariants[normKey] = versionedUrl;
            }
          } else if (kind === 'default') {
            const existing = result.defaultSpeaking;
            if (!existing || stripQueryFromAssetUrl(existing) === entry.name) {
              result.defaultSpeaking = versionedUrl;
            }
          } else if (kind === 'group') {
            const existing = result.groups[key];
            if (!existing || stripQueryFromAssetUrl(existing) === entry.name) {
              result.groups[key] = versionedUrl;
            }
          } else if (kind === 'case') {
            const existing = result.cases[key];
            if (!existing || stripQueryFromAssetUrl(existing) === entry.name) {
              result.cases[key] = versionedUrl;
            }
          } else if (kind === 'escape') {
            const existing = result.escapes[key];
            if (!existing || stripQueryFromAssetUrl(existing) === entry.name) {
              result.escapes[key] = versionedUrl;
            }
            const apex = getEscapeGestureApexSec(full, stat.mtimeMs);
            if (apex !== null && result.escapeApexes) {
              result.escapeApexes[cleanPublicPath] = apex;
            }
          }
        }
      }
    } catch {
      // Ignore discovery errors
    }

    // Prune stale local angel_*.mp4 entries if their backing file was deleted
    for (const [k, v] of Object.entries(result.idleVariants)) {
      const base = stripQueryFromAssetUrl(v);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.idleVariants[k];
      }
    }
    if (result.defaultSpeaking) {
      const base = stripQueryFromAssetUrl(result.defaultSpeaking);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.defaultSpeaking;
      }
    }
    for (const [k, v] of Object.entries(result.groups)) {
      const base = stripQueryFromAssetUrl(v);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.groups[k];
      }
    }
    for (const [k, v] of Object.entries(result.cases)) {
      const base = stripQueryFromAssetUrl(v);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.cases[k];
      }
    }
    for (const [k, v] of Object.entries(result.escapes)) {
      const base = stripQueryFromAssetUrl(v);
      if (base) {
        const fullEsc = path.join(aistudioAssetsDir, base);
        if (base.startsWith('angel_') && !fs.existsSync(fullEsc)) {
          delete result.escapes[k];
        } else if (fs.existsSync(fullEsc) && result.escapeApexes) {
          const cleanEsc = `/assets/aistudio/${base}`;
          if (result.escapeApexes[cleanEsc] === undefined) {
            const stat = fs.statSync(fullEsc);
            const apex = getEscapeGestureApexSec(fullEsc, stat.mtimeMs);
            if (apex !== null) {
              result.escapeApexes[cleanEsc] = apex;
            }
          }
        }
      }
    }

    if (result.idleVariants.idle_1) {
      result.idle = result.idleVariants.idle_1;
    } else {
      delete result.idle;
    }

    return result;
  };

  const writeAngelVideoMap = (data: StoredAngelVideoMap): void => {
    const toDisk: StoredAngelVideoMap = {
      idle: data.idle,
      idleVariants: data.idleVariants,
      defaultSpeaking: data.defaultSpeaking,
      groups: data.groups,
      cases: data.cases,
      escapes: data.escapes || {},
      escapeEnabled: data.escapeEnabled || { point_you: true, push_button: true },
      caseEscapeCues: data.caseEscapeCues || {},
      lipSync: data.lipSync || { defaultEnabled: true, groups: {}, cases: {} },
      videoDurations: data.videoDurations || {},
      escapeApexes: data.escapeApexes || {},
      videoMaxPlays: data.videoMaxPlays || { 'case:tree_browse': 2, 'case:seduction': 1 },
      videoPlayToEnd: data.videoPlayToEnd || { 'case:seduction': true },
      seductionAudioUrl: data.seductionAudioUrl,
      seductionAudioDuration: data.seductionAudioDuration,
      seductionAudioVariants: data.seductionAudioVariants || {},
      seductionAudioDurations: data.seductionAudioDurations || {},
      seductionTriggerMode: data.seductionTriggerMode || 'balanced',
    };
    fs.mkdirSync(aistudioAssetsDir, { recursive: true });
    fs.writeFileSync(angelVideoMapPath, JSON.stringify(toDisk, null, 2), 'utf8');
  };

  // Sync public/assets/aistudio/angel_video_map.json on startup so static builds & ZIP exports stay 100% self-contained
  try {
    writeAngelVideoMap(readAngelVideoMap());
  } catch {
    // Ignore read-only filesystem in restricted environments
  }

  app.get('/api/angel-videos', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(readAngelVideoMap());
  });

  app.put('/api/angel-videos/lip-sync', express.json(), (req, res) => {
    const body = (req.body || {}) as {
      scope?: string;
      key?: string;
      rule?: string;
    };
    const scope = String(body.scope || '');
    const key = String(body.key || '');
    const rule = String(body.rule || '');

    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    if (!['global', 'group', 'case'].includes(scope)) {
      res.status(400).json({ error: 'Invalid lip-sync scope.' });
      return;
    }
    if (!['on', 'off', 'inherit'].includes(rule)) {
      res.status(400).json({ error: 'Invalid lip-sync rule.' });
      return;
    }
    if (scope !== 'global' && !/^[a-z0-9_]{1,40}$/.test(key)) {
      res.status(400).json({ error: 'Invalid lip-sync target key.' });
      return;
    }

    const map = readAngelVideoMap();
    if (!map.lipSync) {
      map.lipSync = { defaultEnabled: true, groups: {}, cases: {} };
    }

    if (scope === 'global') {
      map.lipSync.defaultEnabled = rule !== 'off';
    } else if (scope === 'group') {
      if (rule === 'inherit') {
        delete map.lipSync.groups[key];
      } else {
        map.lipSync.groups[key] = rule as 'on' | 'off';
      }
    } else {
      if (rule === 'inherit') {
        delete map.lipSync.cases[key];
      } else {
        map.lipSync.cases[key] = rule as 'on' | 'off';
      }
    }

    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/escape-toggle', express.json(), (req, res) => {
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    const body = (req.body || {}) as { key?: string; enabled?: boolean };
    const key = String(body.key || '');
    if (!['point_you', 'push_button'].includes(key) || typeof body.enabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid escape toggle payload.' });
      return;
    }
    const map = readAngelVideoMap();
    if (!map.escapeEnabled) {
      map.escapeEnabled = { point_you: true, push_button: true };
    }
    map.escapeEnabled[key] = body.enabled;
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/case-cue', express.json(), (req, res) => {
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    const body = (req.body || {}) as {
      caseId?: string;
      cueKey?: string;
      rule?: string;
    };
    const caseId = String(body.caseId || '');
    const cueKey = String(body.cueKey || '') as 'point_you' | 'push_button';
    const rule = String(body.rule || '');
    if (
      !/^[a-z0-9_]{1,40}$/.test(caseId) ||
      !['point_you', 'push_button'].includes(cueKey) ||
      !['on', 'off', 'inherit'].includes(rule)
    ) {
      res.status(400).json({ error: 'Invalid per-case cue payload.' });
      return;
    }

    const map = readAngelVideoMap();
    if (!map.caseEscapeCues) {
      map.caseEscapeCues = {};
    }
    if (!map.caseEscapeCues[caseId]) {
      map.caseEscapeCues[caseId] = {};
    }
    if (rule === 'inherit') {
      delete map.caseEscapeCues[caseId][cueKey];
      if (Object.keys(map.caseEscapeCues[caseId]).length === 0) {
        delete map.caseEscapeCues[caseId];
      }
    } else {
      map.caseEscapeCues[caseId][cueKey] = rule as 'on' | 'off';
    }
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/max-plays', express.json(), (req, res) => {
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    const body = (req.body || {}) as {
      slotId?: string;
      maxPlays?: number;
    };
    const slotId = String(body.slotId || '');
    const rawMax = Number(body.maxPlays);
    if (
      !/^(idle|default|group|case|escape):[a-z0-9_]{1,40}$/.test(slotId) ||
      !Number.isFinite(rawMax) ||
      rawMax < -1 ||
      rawMax > 999
    ) {
      res.status(400).json({ error: 'Invalid max-plays payload.' });
      return;
    }

    const intMax = Math.floor(rawMax);
    const map = readAngelVideoMap();
    if (!map.videoMaxPlays) {
      map.videoMaxPlays = { 'case:tree_browse': 2 };
    }

    if (intMax === -1) {
      if (slotId === 'case:tree_browse') {
        map.videoMaxPlays[slotId] = -1;
      } else {
        delete map.videoMaxPlays[slotId];
      }
    } else {
      map.videoMaxPlays[slotId] = intMax;
    }

    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/play-to-end', express.json(), (req, res) => {
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    const body = (req.body || {}) as {
      slotId?: string;
      playToEnd?: boolean;
    };
    const slotId = String(body.slotId || '');
    if (
      !/^(idle|default|group|case|escape):[a-z0-9_]{1,40}$/.test(slotId) ||
      typeof body.playToEnd !== 'boolean'
    ) {
      res.status(400).json({ error: 'Invalid play-to-end payload.' });
      return;
    }

    const map = readAngelVideoMap();
    if (!map.videoPlayToEnd) {
      map.videoPlayToEnd = { 'case:seduction': true };
    }
    if (body.playToEnd) {
      map.videoPlayToEnd[slotId] = true;
    } else if (/^case:seduction(_\d+)?$/.test(slotId)) {
      map.videoPlayToEnd[slotId] = false;
    } else {
      delete map.videoPlayToEnd[slotId];
    }

    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/seduction-mode', express.json(), (req, res) => {
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    const mode = String((req.body || {}).mode || '');
    if (
      mode !== 'balanced' &&
      mode !== 'frequent' &&
      mode !== 'dominant' &&
      mode !== 'tactical'
    ) {
      res.status(400).json({ error: 'Invalid seduction trigger mode.' });
      return;
    }
    const map = readAngelVideoMap();
    map.seductionTriggerMode = mode;
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.post(
    '/api/angel-videos/seduction-audio',
    express.raw({ type: '*/*', limit: '50mb' }),
    (req, res) => {
      if (IS_PROD) {
        res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 64) {
        res.status(400).json({ error: 'Empty or invalid audio file.' });
        return;
      }

      const tmpAudioIn = path.join(
        os.tmpdir(),
        `seduction_audio_in_${process.pid}_${Date.now()}.bin`,
      );
      const tmpAudioOut = path.join(
        os.tmpdir(),
        `seduction_audio_out_${process.pid}_${Date.now()}.mp3`,
      );

      try {
        fs.writeFileSync(tmpAudioIn, body);
        fs.mkdirSync(publicVoicesFemaleDir, { recursive: true });
        fs.mkdirSync(aistudioAssetsDir, { recursive: true });

        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-loglevel',
            'error',
            '-i',
            tmpAudioIn,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '24000',
            '-c:a',
            'libmp3lame',
            '-q:a',
            '2',
            tmpAudioOut,
          ],
          { timeout: 20000 },
        );

        fs.copyFileSync(tmpAudioOut, seductionVoiceMp3Path);
        fs.copyFileSync(tmpAudioOut, seductionRootMp3Path);
        fs.copyFileSync(tmpAudioOut, seductionAssetMp3Path);

        const aStat = fs.statSync(seductionVoiceMp3Path);
        const audioDuration = getVideoDurationSec(seductionVoiceMp3Path, aStat.mtimeMs) ?? 4.5;
        const audioUrl = `/voices/female/seduction.mp3?v=${Date.now()}`;

        const map = readAngelVideoMap();
        map.seductionAudioUrl = audioUrl;
        map.seductionAudioDuration = audioDuration;
        writeAngelVideoMap(map);

        res.json({ ok: true, audioUrl, audioDuration, map });
      } catch (err) {
        console.error('Failed to process seduction.mp3 upload:', err);
        res.status(500).json({ error: 'Failed to transcode seduction.mp3 audio.' });
      } finally {
        try {
          if (fs.existsSync(tmpAudioIn)) fs.unlinkSync(tmpAudioIn);
        } catch {
          // ignore
        }
        try {
          if (fs.existsSync(tmpAudioOut)) fs.unlinkSync(tmpAudioOut);
        } catch {
          // ignore
        }
      }
    },
  );

  app.post(
    '/api/angel-videos/:kind/:key',
    express.raw({ type: '*/*', limit: '80mb' }),
    (req, res) => {
      if (IS_PROD) {
        res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
        return;
      }
      const kind = String(req.params.kind || '');
      const rawKey = String(req.params.key || '');
      const key = kind === 'idle' && rawKey === 'idle_listening' ? 'idle_1' : rawKey;
      if (
        !['idle', 'default', 'group', 'case', 'escape'].includes(kind) ||
        !/^[a-z0-9_]{1,40}$/.test(key)
      ) {
        res.status(400).json({ error: 'Invalid video slot key.' });
        return;
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 64) {
        res.status(400).json({ error: 'Empty or invalid video file.' });
        return;
      }

      fs.mkdirSync(aistudioAssetsDir, { recursive: true });
      const fileName = `angel_${kind}_${key}.mp4`;
      const destAbs = path.join(aistudioAssetsDir, fileName);
      if (!destAbs.startsWith(aistudioAssetsDir + path.sep)) {
        res.status(400).json({ error: 'Invalid destination path.' });
        return;
      }

      const tmpIn = path.join(
        os.tmpdir(),
        `angel_upload_in_${process.pid}_${Date.now()}.mp4`,
      );
      const tmpOut = path.join(
        os.tmpdir(),
        `angel_upload_out_${process.pid}_${Date.now()}.mp4`,
      );

      try {
        fs.writeFileSync(tmpIn, body);
        try {
          // Detect if the uploaded video fades/cuts to black at the tail so Chess Angel never disappears
          let trimEndSec: number | null = null;
          try {
            const durOut = execFileSync(
              'ffprobe',
              [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                tmpIn,
              ],
              { encoding: 'utf8', timeout: 5000 },
            ).trim();
            const duration = parseFloat(durOut);
            if (Number.isFinite(duration) && duration > 1.2) {
              const bd = spawnSync(
                'ffmpeg',
                [
                  '-hide_banner',
                  '-i',
                  tmpIn,
                  '-vf',
                  'blackdetect=d=0.03:pix_th=0.12',
                  '-an',
                  '-f',
                  'null',
                  '-',
                ],
                { encoding: 'utf8', timeout: 12000 },
              );
              const logText = `${bd.stdout || ''}\n${bd.stderr || ''}`;
              const regex = /black_start:([0-9.]+)\s+black_end:([0-9.]+)/g;
              let match: RegExpExecArray | null;
              while ((match = regex.exec(logText)) !== null) {
                const bStart = parseFloat(match[1]);
                const bEnd = parseFloat(match[2]);
                if (
                  Number.isFinite(bStart) &&
                  Number.isFinite(bEnd) &&
                  bStart >= 0.8 &&
                  bEnd >= duration - 0.2
                ) {
                  trimEndSec = Math.max(0.8, bStart - 0.08);
                }
              }
            }
          } catch {
            // Ignore blackdetect errors and proceed with standard silent remux
          }

          // Special exception for "seduction": before stripping video sound (-an), automatically separate
          // any embedded audio track into "seduction.mp3" so her original video voice/sound plays in sync!
          let extractedSeductionAudio = false;
          let extractedAudioUrl: string | undefined;
          let extractedAudioDuration: number | undefined;

          const isSeductionSlot =
            kind === 'case' && (key === 'seduction' || /^seduction_([2-9]|[1-9][0-9]+)$/.test(key));

          if (isSeductionSlot) {
            const tmpSeductionMp3 = path.join(
              os.tmpdir(),
              `seduction_extract_${process.pid}_${Date.now()}.mp3`,
            );
            try {
              const hasAudioOut = execFileSync(
                'ffprobe',
                [
                  '-v',
                  'error',
                  '-select_streams',
                  'a:0',
                  '-show_entries',
                  'stream=codec_type',
                  '-of',
                  'default=noprint_wrappers=1:nokey=1',
                  tmpIn,
                ],
                { encoding: 'utf8', timeout: 4000 },
              ).trim();

              if (hasAudioOut.includes('audio')) {
                const audioArgs = [
                  '-y',
                  '-loglevel',
                  'error',
                  '-i',
                  tmpIn,
                  ...(trimEndSec !== null ? ['-to', trimEndSec.toFixed(3)] : []),
                  '-vn',
                  '-ac',
                  '1',
                  '-ar',
                  '24000',
                  '-c:a',
                  'libmp3lame',
                  '-q:a',
                  '2',
                  tmpSeductionMp3,
                ];
                execFileSync('ffmpeg', audioArgs, { timeout: 20000 });
                fs.mkdirSync(publicVoicesFemaleDir, { recursive: true });
                const mp3Name = `${key}.mp3`;
                const slotVoiceMp3Path = path.join(publicVoicesFemaleDir, mp3Name);
                const slotAssetMp3Path = path.join(aistudioAssetsDir, mp3Name);
                fs.copyFileSync(tmpSeductionMp3, slotVoiceMp3Path);
                fs.copyFileSync(tmpSeductionMp3, slotAssetMp3Path);
                if (key === 'seduction') {
                  fs.copyFileSync(tmpSeductionMp3, seductionRootMp3Path);
                }
                const sStat = fs.statSync(slotVoiceMp3Path);
                extractedAudioDuration =
                  getVideoDurationSec(slotVoiceMp3Path, sStat.mtimeMs) ?? undefined;
                extractedAudioUrl = `/voices/female/${mp3Name}?v=${Date.now()}`;
                extractedSeductionAudio = true;
              }
            } catch {
              // Keep existing seduction audio if uploaded video had no decodable audio stream
            } finally {
              try {
                if (fs.existsSync(tmpSeductionMp3)) fs.unlinkSync(tmpSeductionMp3);
              } catch {
                // ignore
              }
            }
          }

          // Visually lossless 3:4 portrait compression (554x740, SSIM > 0.99, ~4.5x smaller than raw uploads)
          // + optional frame-exact cut before trailing black frames + 100% audio removal (-an)
          const encodeArgs = [
            '-y',
            '-loglevel',
            'error',
            '-i',
            tmpIn,
            ...(trimEndSec !== null ? ['-to', trimEndSec.toFixed(3)] : []),
            '-vf',
            'scale=554:740:force_original_aspect_ratio=increase:flags=lanczos,crop=554:740',
            '-c:v',
            'libx264',
            '-preset',
            'slow',
            '-crf',
            '21',
            '-tune',
            'film',
            '-pix_fmt',
            'yuv420p',
            '-an',
            '-movflags',
            '+faststart',
            tmpOut,
          ];
          execFileSync('ffmpeg', encodeArgs, { timeout: 60000 });

          const inSize = fs.statSync(tmpIn).size;
          const outSize = fs.statSync(tmpOut).size;
          if (trimEndSec === null && outSize >= inSize) {
            // Input was already smaller than CRF 21: keep original video stream, strip audio + faststart only
            execFileSync(
              'ffmpeg',
              [
                '-y',
                '-loglevel',
                'error',
                '-i',
                tmpIn,
                '-c:v',
                'copy',
                '-an',
                '-movflags',
                '+faststart',
                tmpOut,
              ],
              { timeout: 20000 },
            );
          }

          fs.copyFileSync(tmpOut, destAbs);
          const stat = fs.statSync(destAbs);
          verifiedSilentVideos.set(destAbs, stat.mtimeMs);

          const publicUrl = `/assets/aistudio/${fileName}?v=${Date.now()}`;
          const map = readAngelVideoMap();
          if (kind === 'idle') {
            map.idleVariants[key] = publicUrl;
            if (key === 'idle_1') {
              map.idle = publicUrl;
            }
          } else if (kind === 'default') {
            map.defaultSpeaking = publicUrl;
          } else if (kind === 'group') {
            map.groups[key] = publicUrl;
          } else if (kind === 'escape') {
            map.escapes[key] = publicUrl;
          } else {
            map.cases[key] = publicUrl;
          }
          if (extractedSeductionAudio && extractedAudioUrl) {
            if (!map.seductionAudioVariants) map.seductionAudioVariants = {};
            if (!map.seductionAudioDurations) map.seductionAudioDurations = {};
            map.seductionAudioVariants[key] = extractedAudioUrl;
            if (extractedAudioDuration) {
              map.seductionAudioDurations[key] = extractedAudioDuration;
            }
            if (key === 'seduction') {
              map.seductionAudioUrl = extractedAudioUrl;
              if (extractedAudioDuration) {
                map.seductionAudioDuration = extractedAudioDuration;
              }
            }
          }
          writeAngelVideoMap(map);

          res.json({ ok: true, url: publicUrl, extractedAudio: extractedSeductionAudio, map });
          return;
        } catch {
          // Fallback if container codec needs re-mux or ffmpeg unavailable: save & run sanitizer
          fs.copyFileSync(tmpIn, destAbs);
          ensureSilentVideoFile(destAbs);
        }

        const stat = fs.statSync(destAbs);
        verifiedSilentVideos.set(destAbs, stat.mtimeMs);

        const publicUrl = `/assets/aistudio/${fileName}?v=${Date.now()}`;
        const map = readAngelVideoMap();
        if (kind === 'idle') {
          map.idleVariants[key] = publicUrl;
          if (key === 'idle_1') {
            map.idle = publicUrl;
          }
        } else if (kind === 'default') {
          map.defaultSpeaking = publicUrl;
        } else if (kind === 'group') {
          map.groups[key] = publicUrl;
        } else if (kind === 'escape') {
          map.escapes[key] = publicUrl;
        } else {
          map.cases[key] = publicUrl;
        }
        writeAngelVideoMap(map);

        res.json({ ok: true, url: publicUrl, extractedAudio: false, map });
      } catch (err) {
        console.error('Failed to store silent Chess Angel video:', err);
        res.status(500).json({ error: 'Failed to process uploaded video.' });
      } finally {
        try {
          if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        } catch {
          // ignore
        }
        try {
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        } catch {
          // ignore
        }
      }
    },
  );

  app.delete('/api/angel-videos/:kind/:key', (req, res) => {
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio editing is disabled in production.' });
      return;
    }
    const kind = String(req.params.kind || '');
    const rawKey = String(req.params.key || '');
    const key = kind === 'idle' && rawKey === 'idle_listening' ? 'idle_1' : rawKey;
    if (
      !['idle', 'default', 'group', 'case', 'escape'].includes(kind) ||
      !/^[a-z0-9_]{1,40}$/.test(key)
    ) {
      res.status(400).json({ error: 'Invalid video slot key.' });
      return;
    }

    const fileName = `angel_${kind}_${key}.mp4`;
    const destAbs = path.join(aistudioAssetsDir, fileName);
    if (destAbs.startsWith(aistudioAssetsDir + path.sep) && fs.existsSync(destAbs)) {
      try {
        fs.unlinkSync(destAbs);
      } catch {
        // ignore
      }
    }
    if (kind === 'idle' && key === 'idle_1') {
      const legacyAbs = path.join(aistudioAssetsDir, 'angel_idle_idle_listening.mp4');
      if (fs.existsSync(legacyAbs)) {
        try {
          fs.unlinkSync(legacyAbs);
        } catch {
          // ignore
        }
      }
    }

    const map = readAngelVideoMap();
    if (kind === 'idle') {
      delete map.idleVariants[key];
      if (key === 'idle_1') {
        delete map.idle;
      }
    } else if (kind === 'default') {
      delete map.defaultSpeaking;
    } else if (kind === 'group') {
      delete map.groups[key];
    } else if (kind === 'escape') {
      delete map.escapes[key];
    } else {
      delete map.cases[key];
    }
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  // Serve extracted frontal top-view Chess Angel thinking tree JPEG & mid-game video animation with cross-origin headers
  const thinkingTreeJpgPath = path.resolve(
    __dirname,
    'public',
    'chess_angel_thinking_tree_top_view.jpg',
  );
  const thinkingTreeMp4Path = path.resolve(
    __dirname,
    'public',
    'chess_angel_midgame_tree_animation.mp4',
  );
  const thinkingTreeGifPath = path.resolve(
    __dirname,
    'public',
    'chess_angel_midgame_tree_animation.gif',
  );

  app.get('/chess_angel_thinking_tree_top_view.jpg', (_req, res) => {
    if (!fs.existsSync(thinkingTreeJpgPath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(thinkingTreeJpgPath);
  });

  app.get('/api/thinking-tree.jpg', (_req, res) => {
    if (!fs.existsSync(thinkingTreeJpgPath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="chess_angel_thinking_tree_top_view.jpg"',
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(thinkingTreeJpgPath);
  });

  app.get('/chess_angel_midgame_tree_animation.mp4', (_req, res) => {
    if (!fs.existsSync(thinkingTreeMp4Path)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(thinkingTreeMp4Path);
  });

  app.get('/chess_angel_midgame_tree_animation.gif', (_req, res) => {
    if (!fs.existsSync(thinkingTreeGifPath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(thinkingTreeGifPath);
  });

  app.get('/api/thinking-tree-video.mp4', (_req, res) => {
    if (!fs.existsSync(thinkingTreeMp4Path)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="chess_angel_midgame_tree_animation.mp4"',
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(thinkingTreeMp4Path);
  });

  const buildWindowsPlayBat = (): string =>
    [
      '@echo off',
      'setlocal EnableExtensions',
      'title ChessAngel3D',
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
      'rem If ChessAngel3D is already running on port 3000, just open the browser',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:3000/api/health; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1',
      'if not errorlevel 1 (',
      '  echo ChessAngel3D is already running. Opening http://localhost:3000 ...',
      '  start "" "http://localhost:3000"',
      '  exit /b 0',
      ')',
      '',
      'echo ============================================================',
      'echo   ChessAngel3D is starting...',
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
      '  echo ChessAngel3D stopped with an error.',
      '  pause',
      ')',
      'exit /b %errorlevel%',
      '',
    ].join('\r\n');

  const buildWindowsInstallBat = (): string =>
    [
      '@echo off',
      'setlocal EnableExtensions EnableDelayedExpansion',
      'title ChessAngel3D - Windows Installer',
      'cd /d "%~dp0"',
      '',
      'echo ============================================================',
      'echo   ChessAngel3D - One-Click Windows Installer',
      'echo ============================================================',
      'echo.',
      '',
      'if not exist "package.json" (',
      '  echo [ERROR] package.json was not found in this folder.',
      '  echo Please extract the full chessangel3d.zip archive first, then run',
      '  echo install-and-play.bat from inside the extracted chessangel3d folder.',
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
      '  echo [ACTION REQUIRED] Node.js 20+ is needed to run ChessAngel3D locally.',
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
      'echo [2/4] Installing ChessAngel3D packages (this may take 1-2 minutes)...',
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
      'echo [3/4] Building ChessAngel3D for fast local play...',
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
      'echo [4/4] Creating Desktop shortcut (ChessAngel3D)...',
      'set "APP_DIR=%~dp0"',
      'if "%APP_DIR:~-1%"=="\\" set "APP_DIR=%APP_DIR:~0,-1%"',
      'set "TARGET_BAT=%APP_DIR%\\play-chessangel3d.bat"',
      'if not exist "%TARGET_BAT%" set "TARGET_BAT=%APP_DIR%\\install-and-play.bat"',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath(\'Desktop\'); $s = $ws.CreateShortcut((Join-Path $desktop \'ChessAngel3D.lnk\')); $s.TargetPath = $env:TARGET_BAT; $s.WorkingDirectory = $env:APP_DIR; $s.Description = \'Play ChessAngel3D\'; $s.Save()" >nul 2>&1',
      'if errorlevel 1 (',
      '  echo       Skipped Desktop shortcut. You can launch anytime via play-chessangel3d.bat.',
      ') else (',
      '  echo       Desktop shortcut "ChessAngel3D" created!',
      ')',
      'echo.',
      'echo Installation complete! Launching ChessAngel3D...',
      'echo.',
      'if exist "%~dp0play-chessangel3d.bat" (',
      '  call "%~dp0play-chessangel3d.bat"',
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
      const rootFolder = zip.folder('chessangel3d')!;

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

      try {
        writeAngelVideoMap(readAngelVideoMap());
      } catch {
        // Ignore if read-only
      }

      addDirRecursive('src');
      addDirRecursive('public');

      rootFolder.file('install-and-play.bat', buildWindowsInstallBat());
      rootFolder.file('play-chessangel3d.bat', buildWindowsPlayBat());

      const readme = [
        '# ChessAngel3D',
        '',
        'A full-stack 3D chess application featuring hand-carved wooden Staunton pieces, Chess Angel (a mathematical routine opponent with bundled offline female voice commentary & 3D search-tree animations), real-time multiplayer, game replays, and an integrated multi-PV analysis engine.',
        '',
        '## Windows Easy Install (One-Click)',
        '',
        '1. Extract this ZIP archive to any folder (for example `C:\\Games\\chessangel3d`).',
        '2. Double-click **`install-and-play.bat`**.',
        '   - Automatically checks for Node.js (and installs Node.js LTS via `winget` if missing).',
        '   - Installs dependencies and builds ChessAngel3D for fast local play.',
        '   - Creates a **ChessAngel3D** shortcut on your Windows Desktop.',
        '   - Opens ChessAngel3D automatically in your browser at `http://localhost:3000`.',
        '3. Next time, just double-click the **ChessAngel3D** Desktop shortcut (or `play-chessangel3d.bat`).',
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
        'Once running in Chrome, Edge, or Safari, you can install ChessAngel3D to your desktop or home screen as an offline-capable PWA.',
        '',
      ].join('\n');
      rootFolder.file('README.md', readme);

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="chessangel3d.zip"');
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
    console.log(`ChessAngel3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
