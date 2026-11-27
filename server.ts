import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { GoogleGenAI } from '@google/genai';
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
  msgWindowStart: number;
  msgCount: number;
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

const MAX_ACTIVE_ROOMS = 500;
const MAX_WS_CLIENTS = 1000;
const MAX_MATCHMAKING_QUEUE = 200;
const WS_RATE_WINDOW_MS = 5_000;
const WS_RATE_MAX_MSGS = 50;

function isSafeMapKey(key: string): boolean {
  if (!/^[a-z0-9_]{1,40}$/.test(key)) return false;
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function isSafeLocalMediaUrl(u: unknown): u is string {
  return (
    typeof u === 'string' &&
    u.length > 0 &&
    u.length <= 240 &&
    (u.startsWith('/assets/') || u.startsWith('/voices/'))
  );
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
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
      w: room.players.w
        ? { name: room.players.w.name, connected: room.players.w.connected }
        : null,
      b: room.players.b
        ? { name: room.players.b.name, connected: room.players.b.connected }
        : null,
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
      if (
        typeof msg.clientId === 'string' &&
        /^[A-Za-z0-9_-]{16,64}$/.test(msg.clientId)
      ) {
        const claimedByActiveSocket = Array.from(clients.values()).some(
          (other) =>
            other !== client &&
            other.clientId === msg.clientId &&
            other.ws.readyState === WebSocket.OPEN,
        );
        if (!claimedByActiveSocket) {
          client.clientId = msg.clientId;
        }
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
      if (rooms.size >= MAX_ACTIVE_ROOMS) {
        send(ws, { type: 'room:error', message: 'Server room capacity reached. Try again shortly.' });
        return;
      }
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
          : crypto.randomInt(0, 2) === 0
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
        if (rooms.size >= MAX_ACTIVE_ROOMS) {
          send(ws, { type: 'room:error', message: 'Server room capacity reached. Try again shortly.' });
          return;
        }
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
        if (matchmakingQueue.length >= MAX_MATCHMAKING_QUEUE) {
          send(ws, { type: 'room:error', message: 'Matchmaking queue is full. Try again shortly.' });
          return;
        }
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
      if (!room || client.roomId !== room.id || room.status !== 'active') return;
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
      if (!room || client.roomId !== room.id || room.status !== 'active') return;
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
      if (!room || client.roomId !== room.id || room.status !== 'active' || !room.drawOfferFrom) return;
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
      if (!room || client.roomId !== room.id || room.status !== 'finished') return;
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
      if (!room || client.roomId !== room.id || !VALID_SKINS.has(msg.skinId)) return;
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
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=(self)',
    );
    const scriptPolicy = IS_PROD
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        scriptPolicy,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'frame-ancestors *',
      ].join('; '),
    );
    const pathname = req.path || '';
    const lowerPath = pathname.toLowerCase();
    // Block source maps and raw project/server configuration files from being copied
    if (
      lowerPath.endsWith('.map') ||
      lowerPath === '/server.ts' ||
      lowerPath === '/package.json' ||
      lowerPath === '/package-lock.json' ||
      lowerPath === '/bun.lock' ||
      lowerPath === '/bun.lockb' ||
      lowerPath === '/tsconfig.json' ||
      lowerPath === '/vite.config.ts' ||
      lowerPath.startsWith('/.env') ||
      lowerPath.startsWith('/.git') ||
      (IS_PROD && lowerPath.startsWith('/src/') && !lowerPath.startsWith('/src/assets/'))
    ) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    // Block AI / LLM / technical-scraper User-Agents while allowing standard SEO search engines on "/"
    const ua = String(req.headers['user-agent'] || '');
    const isAiCrawler =
      /GPTBot|OAI-SearchBot|ChatGPT-User|Google-Extended|GoogleOther|Google-CloudVertexBot|PerplexityBot|Perplexity-User|ClaudeBot|Claude-Web|Claude-SearchBot|anthropic-ai|CCBot|Meta-ExternalAgent|Meta-ExternalFetcher|Applebot-Extended|Bytespider|Amazonbot|YouBot|DuckAssistBot|MistralAI-User|cohere-ai|Diffbot|ImagesiftBot|omgili|Timpibot|Webzio-Extended|Scrapy/i.test(
        ua,
      );
    if (isAiCrawler && lowerPath !== '/robots.txt') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive, noai, noimageai');
      res.status(403).type('text/plain').send('Forbidden');
      return;
    }

    if (
      lowerPath.startsWith('/assets/') ||
      lowerPath.startsWith('/voices/') ||
      lowerPath.startsWith('/api/') ||
      lowerPath.startsWith('/chess_angel_') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.json') ||
      lowerPath.endsWith('.webmanifest')
    ) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive, noai, noimageai');
    } else {
      res.setHeader('X-Robots-Tag', 'index, follow, noarchive, noai, noimageai');
    }

    // Keep PWA shell, service worker, manifest, and video registry always freshly revalidated
    if (
      lowerPath === '/' ||
      lowerPath === '/index.html' ||
      lowerPath === '/sw.js' ||
      lowerPath === '/registerSW.js' ||
      lowerPath === '/manifest.webmanifest' ||
      lowerPath === '/assets/aistudio/angel_video_map.json'
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));

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

  // Serve bundled MP3 voice clips directly (resolving public/voices or dist/voices in production)
  const resolvedVoicesDir = fs.existsSync(path.resolve(__dirname, 'public', 'voices'))
    ? path.resolve(__dirname, 'public', 'voices')
    : path.resolve(__dirname, 'dist', 'voices');
  app.use(
    '/voices',
    express.static(resolvedVoicesDir, {
      maxAge: 0,
      acceptRanges: true,
      fallthrough: true,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      },
    }),
  );
  app.use('/voices', (_req, res) => {
    res.status(404).end();
  });

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

  const publicAssetsDir = fs.existsSync(path.resolve(__dirname, 'public', 'assets'))
    ? path.resolve(__dirname, 'public', 'assets')
    : path.resolve(__dirname, 'dist', 'assets');
  const publicVoicesFemaleDir = path.join(resolvedVoicesDir, 'female');
  const seductionVoiceMp3Path = path.join(publicVoicesFemaleDir, 'seduction.mp3');
  const seductionRootMp3Path = fs.existsSync(path.resolve(__dirname, 'public', 'seduction.mp3'))
    ? path.resolve(__dirname, 'public', 'seduction.mp3')
    : path.resolve(__dirname, 'dist', 'seduction.mp3');
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
  if (!IS_PROD) {
    sanitizeAllAssetVideosRecursive(publicAssetsDir);
  }

  // Serve public media assets (including Chess Angel 3:4 portrait MP4 videos, guaranteed audio-free) with HTTP 206 Range support
  app.use('/assets', (req, _res, next) => {
    // Transparent fallback: if /assets/aistudio/angel_(case|idle|escape|default|special)_<key>.mp4 is requested
    // when only builtin_<key>.mp4 exists on disk, rewrite cleanly to the builtin file so <video> never 404s
    const mReq = /^\/aistudio\/angel_(case|idle|escape|default|special)_([a-z0-9_]+)\.mp4$/i.exec(req.path);
    if (mReq) {
      const requestedAbs = path.resolve(publicAssetsDir, '.' + req.path);
      if (
        requestedAbs.startsWith(publicAssetsDir + path.sep) &&
        !fs.existsSync(requestedAbs)
      ) {
        const kind = mReq[1].toLowerCase();
        const key = mReq[2].toLowerCase();
        const builtinName =
          kind === 'default'
            ? 'builtin_default_speaking.mp4'
            : kind === 'escape'
              ? `builtin_escape_${key}.mp4`
              : `builtin_${key}.mp4`;
        const builtinAbs = path.resolve(publicAssetsDir, 'aistudio', builtinName);
        if (fs.existsSync(builtinAbs)) {
          const qIdx = req.url.indexOf('?');
          const qs = qIdx >= 0 ? req.url.slice(qIdx) : '';
          req.url = `/aistudio/${builtinName}${qs}`;
        }
      }
    }
    if (!IS_PROD && /\.(mp4|webm|mov|m4v)$/i.test(req.path)) {
      const candidate = path.resolve(publicAssetsDir, '.' + req.path);
      if (candidate.startsWith(publicAssetsDir + path.sep)) {
        ensureSilentVideoFile(candidate);
      }
    }
    next();
  });
  const setAssetCacheHeaders = (res: express.Response, filePath: string): void => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('/angel_video_map.json')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }
    // Only Vite content-hashed JS/CSS chunks under /dist/assets/ get immutable long caching;
    // unhashed media under /assets/aistudio/ always revalidate so replaced files renew immediately.
    if (
      IS_PROD &&
      !normalized.includes('/aistudio/') &&
      /\-[a-z0-9_-]{6,}\.(js|css)$/i.test(normalized)
    ) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  };
  const distAssetsDir = path.resolve(__dirname, 'dist', 'assets');
  if (IS_PROD && fs.existsSync(distAssetsDir)) {
    app.use(
      '/assets',
      express.static(distAssetsDir, {
        maxAge: 0,
        acceptRanges: true,
        fallthrough: true,
        setHeaders: setAssetCacheHeaders,
      }),
    );
  }
  app.use(
    '/assets',
    express.static(publicAssetsDir, {
      maxAge: 0,
      acceptRanges: true,
      fallthrough: true,
      setHeaders: setAssetCacheHeaders,
    }),
  );
  // Strict 404 guard so missing /assets/* files NEVER fall through to Vite SPA index.html (text/html)
  app.use('/assets', (_req, res) => {
    res.status(404).end();
  });

  // Persistent Chess Angel Portrait Video Registry & Automatic Audio-Stripping Uploader
  const aistudioAssetsDir = path.resolve(publicAssetsDir, 'aistudio');
  const angelVideoMapPath = path.join(aistudioAssetsDir, 'angel_video_map.json');

  type AngelCompressionPreset = 'lossless_21' | 'balanced_24' | 'mobile_27' | 'mute_only';

  interface StoredVideoOptimizedInfo {
    size: number;
    crf: number;
    width: number;
    height: number;
  }

  interface StoredAngelVideoMap {
    idle?: string;
    idleVariants: Record<string, string>;
    mouseIdle?: string;
    mouseIdleWake?: string;
    mouseIdleTimeoutSec?: number;
    mouseIdleHoldSec?: Record<string, number>;
    dogRunVideo?: string;
    dogRunJumpSec?: number;
    dogRunExitYPx?: number;
    dogRunExitXPx?: number;
    openingFlowchartStartSec?: number;
    openingFlowchartDensity?: number;
    angelBgTransparency?: number;
    danceStarsVideo?: string;
    defaultSpeaking?: string;
    groups: Record<string, string>;
    cases: Record<string, string>;
    escapes: Record<string, string>;
    escapeEnabled?: Record<string, boolean>;
    caseEscapeCues?: Record<
      string,
      Partial<Record<'point_you' | 'point_me' | 'push_button', 'on' | 'off'>>
    >;
    lipSync?: {
      defaultEnabled: boolean;
      groups: Record<string, 'on' | 'off'>;
      cases: Record<string, 'on' | 'off'>;
    };
    videoDurations?: Record<string, number>;
    videoSizes?: Record<string, number>;
    videoOptimized?: Record<string, StoredVideoOptimizedInfo>;
    compressionPreset?: AngelCompressionPreset;
    escapeApexes?: Record<string, number>;
    videoMaxPlays?: Record<string, number>;
    videoPlayToEnd?: Record<string, boolean>;
    seductionAudioUrl?: string;
    seductionAudioDuration?: number;
    seductionAudioVariants?: Record<string, string>;
    seductionAudioDurations?: Record<string, number>;
    seductionTriggerMode?: 'balanced' | 'frequent' | 'dominant' | 'tactical';
    thankJanAudioUrl?: string;
    thankJanAudioDuration?: number;
    udoBarkAudioUrl?: string;
    musicTracks?: Array<{ id: string; title: string; url: string }>;
  }
  const seductionAssetMp3Path = path.join(aistudioAssetsDir, 'seduction.mp3');
  const udoBarkAssetMp3Path = path.join(aistudioAssetsDir, 'udo_bark.mp3');

  const formatMusicTrackTitle = (filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.includes('a_beautiful_queen_and_her_infinite_re')) {
      return "Queen's Infinite Reign";
    }
    if (lower.includes('chess_angle_rap') || lower.includes('chess_angel_rap')) {
      return 'Chess Angel Rap';
    }
    if (lower.includes('angle_45923f8a') || /^angle_[0-9a-f]{8}\.mp3$/.test(lower)) {
      return 'Chess Angel';
    }
    const base = filename
      .replace(/\.mp3$/i, '')
      .replace(/_[0-9a-f]{8}$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) return 'Chess Angel Track';
    return base.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 48);
  };

  const musicTrackSortRank = (filename: string): number => {
    const lower = filename.toLowerCase();
    if (lower.includes('a_beautiful_queen')) return 0;
    if (lower.includes('chess_angle_rap') || lower.includes('chess_angel_rap')) return 1;
    if (lower.includes('angle_45923f8a') || /^angle_[0-9a-f]{8}\.mp3$/.test(lower)) return 2;
    return 3;
  };

  const discoverMusicTracks = (): Array<{ id: string; title: string; url: string }> => {
    const tracks: Array<{ id: string; title: string; url: string }> = [];
    const seenUrls = new Set<string>();
    const excluded = new Set([
      'seduction.mp3',
      'seduction_6.mp3',
      'thank_jan.mp3',
      'angle_45923f8a.mp3',
      'udo_bark.mp3',
    ]);
    try {
      if (fs.existsSync(aistudioAssetsDir)) {
        const rawCandidates = fs
          .readdirSync(aistudioAssetsDir, { withFileTypes: true })
          .filter((e) => {
            if (!e.isFile() || !/\.mp3$/i.test(e.name)) return false;
            if (excluded.has(e.name.toLowerCase()) || e.name.includes('.tmp')) return false;
            try {
              return fs.statSync(path.join(aistudioAssetsDir, e.name)).size >= 200 * 1024;
            } catch {
              return false;
            }
          });
        const isQueen = (n: string) =>
          n.toLowerCase().includes('a_beautiful_queen_and_her_infinite_re');
        const isRap = (n: string) => {
          const l = n.toLowerCase();
          return l.includes('chess_angle_rap') || l.includes('chess_angel_rap');
        };
        const isMeditational = (n: string) => {
          const l = n.toLowerCase();
          return l === 'meditational.mp3' || l.startsWith('meditational_');
        };
        const isLegacyAngle = (n: string) => {
          const l = n.toLowerCase();
          return l === 'angle_45923f8a.mp3' || /^angle_[0-9a-f]{8}\.mp3$/.test(l);
        };
        const dedicatedAngel = rawCandidates
          .filter(
            (e) =>
              !isQueen(e.name) &&
              !isRap(e.name) &&
              !isMeditational(e.name) &&
              !isLegacyAngle(e.name),
          )
          .sort((a, b) => {
            const la = a.name.toLowerCase();
            const lb = b.name.toLowerCase();
            if (la === 'chess_angle_2f568dfd.mp3') return -1;
            if (lb === 'chess_angle_2f568dfd.mp3') return 1;
            if (la === 'chess_angel_theme.mp3') return -1;
            if (lb === 'chess_angel_theme.mp3') return 1;
            return (
              fs.statSync(path.join(aistudioAssetsDir, b.name)).mtimeMs -
              fs.statSync(path.join(aistudioAssetsDir, a.name)).mtimeMs
            );
          })[0];
        const mp3Entries = rawCandidates
          .filter((e) => !(dedicatedAngel && isLegacyAngle(e.name)))
          .sort((a, b) => {
            const rank = (name: string) => {
              if (isQueen(name)) return 0;
              if (isRap(name)) return 1;
              if (dedicatedAngel && name === dedicatedAngel.name) return 2;
              if (isLegacyAngle(name)) return 2;
              if (isMeditational(name)) return 3;
              return 4;
            };
            const rankDiff = rank(a.name) - rank(b.name);
            return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
          });
        const seenIds = new Set<string>();
        for (const entry of mp3Entries) {
          const url = `/assets/aistudio/${entry.name}`;
          if (seenUrls.has(url)) continue;
          const isChosenAngel =
            (dedicatedAngel && entry.name === dedicatedAngel.name) ||
            (!dedicatedAngel && isLegacyAngle(entry.name));
          if (!isChosenAngel && entry.name.toLowerCase() === 'chess_angel_theme.mp3') {
            continue;
          }
          const id = isQueen(entry.name)
            ? 'queen_infinite_reign'
            : isRap(entry.name)
              ? 'chess_angel_rap'
              : isChosenAngel
                ? 'chess_angel_theme'
                : isMeditational(entry.name)
                  ? 'meditational'
                  : entry.name
                      .replace(/\.mp3$/i, '')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '_')
                      .replace(/^_+|_+$/g, '') || 'chess_angel_track';
          if (seenIds.has(id)) continue;
          seenUrls.add(url);
          seenIds.add(id);
          const title = isQueen(entry.name)
            ? "Queen's Infinite Reign"
            : isRap(entry.name)
              ? 'Chess Angel Rap'
              : isChosenAngel
                ? 'Chess Angel'
                : isMeditational(entry.name)
                  ? 'Meditational'
                  : formatMusicTrackTitle(entry.name);
          tracks.push({ id, title, url });
        }
      }
    } catch {
      // ignore discovery errors
    }
    return tracks;
  };
  const execFileAsync = promisify(execFile);

  const presetToCrf = (preset: AngelCompressionPreset | undefined): number | null => {
    if (preset === 'mute_only') return null;
    if (preset === 'balanced_24') return 24;
    if (preset === 'mobile_27') return 27;
    return 21;
  };

  interface BackdropCalibrationSpec {
    cutR: number;
    cutG: number;
    cutB: number;
    gammaR: number;
    gammaG: number;
    gammaB: number;
    whiteBalanceAdjusted: boolean;
    needsBackdropFix: boolean;
  }

  /**
   * Probes up to 12 frames across a portrait video to measure its outer dark-background RGB
   * and any chromatic color cast, returning per-channel black-point cuts + white-balance gammas
   * so the video's dark background becomes 100% identical to the game's #000000 (0, 0, 0).
   */
  const probeVideoBackdropCalibration = (inputPath: string): BackdropCalibrationSpec => {
    const fallback: BackdropCalibrationSpec = {
      cutR: 3,
      cutG: 3,
      cutB: 3,
      gammaR: 1,
      gammaG: 1,
      gammaB: 1,
      whiteBalanceAdjusted: false,
      needsBackdropFix: true,
    };

    try {
      const metaOut = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=color_range,color_space,color_transfer,color_primaries',
          '-of',
          'csv=p=0',
          inputPath,
        ],
        { encoding: 'utf8', timeout: 4000 },
      ).trim();
      const hasExactBt709Tags = metaOut.startsWith('tv,bt709,bt709,bt709');

      const raw = execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          inputPath,
          '-vf',
          'fps=3,scale=96:128:flags=area',
          '-frames:v',
          '12',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-',
        ],
        { maxBuffer: 6 * 1024 * 1024, timeout: 10000 },
      );

      const W = 96;
      const H = 128;
      const frameBytes = W * H * 3;
      const frameCount = Math.floor(raw.length / frameBytes);
      if (frameCount <= 0) return fallback;

      const bgR: number[] = [];
      const bgG: number[] = [];
      const bgB: number[] = [];
      const cornerR: number[] = [];
      const cornerG: number[] = [];
      const cornerB: number[] = [];
      let maxObservedBg = 0;

      for (let fr = 0; fr < frameCount; fr++) {
        const base = fr * frameBytes;
        for (let y = 0; y < 88; y++) {
          for (let x = 0; x < W; x++) {
            const isStrictCorner = y < 12 && (x < 6 || x >= W - 6);
            const isMargin =
              y < 5 ||
              ((x < 11 || x >= W - 11) && y < 48) ||
              ((x < 5 || x >= W - 5) && y < 88);
            if (!isMargin) continue;

            const idx = base + (y * W + x) * 3;
            const r = raw[idx];
            const g = raw[idx + 1];
            const b = raw[idx + 2];
            const peak = Math.max(r, g, b);
            if (peak < 62) {
              bgR.push(r);
              bgG.push(g);
              bgB.push(b);
              if (peak > maxObservedBg) maxObservedBg = peak;
              if (isStrictCorner) {
                cornerR.push(r);
                cornerG.push(g);
                cornerB.push(b);
              }
            }
          }
        }
      }

      if (bgR.length < 16) return fallback;

      bgR.sort((a, b) => a - b);
      bgG.sort((a, b) => a - b);
      bgB.sort((a, b) => a - b);
      cornerR.sort((a, b) => a - b);
      cornerG.sort((a, b) => a - b);
      cornerB.sort((a, b) => a - b);

      const pct = (arr: number[], q: number) =>
        arr.length > 0 ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : 0;

      const medR = pct(bgR, 0.5);
      const medG = pct(bgG, 0.5);
      const medB = pct(bgB, 0.5);
      const p90R = pct(bgR, 0.9);
      const p90G = pct(bgG, 0.9);
      const p90B = pct(bgB, 0.9);
      const c95R = pct(cornerR, 0.95);
      const c95G = pct(cornerG, 0.95);
      const c95B = pct(cornerB, 0.95);

      const cutR = Math.min(48, Math.max(3, Math.max(c95R, p90R) + 3));
      const cutG = Math.min(48, Math.max(3, Math.max(c95G, p90G) + 3));
      const cutB = Math.min(48, Math.max(3, Math.max(c95B, p90B) + 3));

      const avgMed = (medR + medG + medB) / 3;
      const maxCast = Math.max(
        Math.abs(medR - avgMed),
        Math.abs(medG - avgMed),
        Math.abs(medB - avgMed),
      );
      const gammaR = Math.max(0.92, Math.min(1.08, 1 + (medR - avgMed) * 0.0065));
      const gammaG = Math.max(0.92, Math.min(1.08, 1 + (medG - avgMed) * 0.0065));
      const gammaB = Math.max(0.92, Math.min(1.08, 1 + (medB - avgMed) * 0.0065));

      const hasNonZeroBg =
        c95R > 0 || c95G > 0 || c95B > 0 || p90R > 0 || p90G > 0 || p90B > 0 || maxObservedBg > 1;

      return {
        cutR,
        cutG,
        cutB,
        gammaR,
        gammaG,
        gammaB,
        whiteBalanceAdjusted: maxCast >= 1.5,
        needsBackdropFix: hasNonZeroBg || !hasExactBt709Tags,
      };
    } catch {
      return fallback;
    }
  };

  const buildLutRgbChannelExpr = (cut: number, knee: number, gamma: number): string => {
    const denom = Math.max(1, 255 - cut).toFixed(1);
    return `if(lte(val,${cut}),0,clip(pow((val-${cut})/${denom}*if(lt(val,${cut + knee}),(val-${cut})/${knee},1),${gamma.toFixed(4)})*255,0,255))`;
  };

  /**
   * Visually lossless 3:4 portrait compression & color-calibration routine (554x740 Lanczos,
   * automatic #000000 dark-background + white-balance LUT calibration, BT.709 VUI tags, libx264 slow,
   * yuv420p, audio-stripped -an, +faststart).
   */
  const compressPortraitMp4Async = async (
    inputPath: string,
    outputPath: string,
    opts: { crf: number | null; trimEndSec?: number | null; enforceBackdropMatch?: boolean },
  ): Promise<{
    inBytes: number;
    outBytes: number;
    compressed: boolean;
    crfApplied: number;
    backdropCalibrated: boolean;
    whiteBalanceAdjusted: boolean;
  }> => {
    const inBytes = fs.statSync(inputPath).size;
    const trimArgs =
      opts.trimEndSec !== null && opts.trimEndSec !== undefined
        ? ['-to', opts.trimEndSec.toFixed(3)]
        : [];
    const enforceBackdrop = opts.enforceBackdropMatch !== false;
    const calib = enforceBackdrop
      ? probeVideoBackdropCalibration(inputPath)
      : {
          cutR: 3,
          cutG: 3,
          cutB: 3,
          gammaR: 1,
          gammaG: 1,
          gammaB: 1,
          whiteBalanceAdjusted: false,
          needsBackdropFix: false,
        };

    if (opts.crf === null && trimArgs.length === 0 && !calib.needsBackdropFix) {
      await execFileAsync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-i', inputPath, '-c:v', 'copy', '-an', '-movflags', '+faststart', outputPath],
        { timeout: 25000 },
      );
      const outBytes = fs.statSync(outputPath).size;
      return {
        inBytes,
        outBytes,
        compressed: false,
        crfApplied: 0,
        backdropCalibrated: false,
        whiteBalanceAdjusted: false,
      };
    }

    const effectiveCrf = opts.crf ?? 19;
    const knee = 9;
    const rExpr = buildLutRgbChannelExpr(calib.cutR, knee, calib.gammaR);
    const gExpr = buildLutRgbChannelExpr(calib.cutG, knee, calib.gammaG);
    const bExpr = buildLutRgbChannelExpr(calib.cutB, knee, calib.gammaB);
    const vfChain = [
      'scale=560:752:force_original_aspect_ratio=increase:flags=lanczos',
      'crop=560:752',
      'format=rgb24',
      `lutrgb=r='${rExpr}':g='${gExpr}':b='${bExpr}'`,
      'scale=out_color_matrix=bt709:out_range=tv',
      'format=yuv420p',
    ].join(',');

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        ...trimArgs,
        '-vf',
        vfChain,
        '-r',
        '24',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        String(effectiveCrf),
        '-profile:v',
        'main',
        '-level',
        '3.1',
        '-bf',
        '0',
        '-refs',
        '2',
        '-g',
        '24',
        '-keyint_min',
        '12',
        '-pix_fmt',
        'yuv420p',
        '-color_range',
        'tv',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-an',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { timeout: 90000 },
    );

    const outBytes = fs.statSync(outputPath).size;

    return {
      inBytes,
      outBytes,
      compressed: outBytes < inBytes,
      crfApplied: effectiveCrf,
      backdropCalibrated: true,
      whiteBalanceAdjusted: calib.whiteBalanceAdjusted,
    };
  };

  const cachedVideoDims = new Map<string, { mtimeMs: number; width: number; height: number }>();
  const getVideoDimensions = (
    absPath: string,
    mtimeMs: number,
  ): { width: number; height: number } | null => {
    const prev = cachedVideoDims.get(absPath);
    if (prev && prev.mtimeMs === mtimeMs) {
      return { width: prev.width, height: prev.height };
    }
    try {
      const out = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height',
          '-of',
          'csv=s=x:p=0',
          absPath,
        ],
        { encoding: 'utf8', timeout: 4000 },
      )
        .trim()
        .split('\n')[0];
      const parts = out.split('x');
      if (parts.length >= 2) {
        const w = parseInt(parts[0], 10);
        const h = parseInt(parts[1], 10);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          cachedVideoDims.set(absPath, { mtimeMs, width: w, height: h });
          return { width: w, height: h };
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const recordedVideoOptByPath = new Map<string, StoredVideoOptimizedInfo>();

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

  /**
   * Detects if a custom Mouse-Idle video contains BOTH falling-asleep AND waking-up in a single clip
   * (e.g., standing -> laying head down in middle -> standing back up at end). If so, returns the exact
   * timestamp inside the deep-sleep trough where playback should pause and hold until the mouse moves again!
   * Returns `null` when the clip ends in the sleeping pose (meaning play to the final frame and hold there).
   */
  const cachedMouseSleepHolds = new Map<string, { mtimeMs: number; sec: number | null }>();
  const getMouseIdleSleepHoldSec = (absPath: string, mtimeMs: number): number | null => {
    const prev = cachedMouseSleepHolds.get(absPath);
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
          'fps=4,crop=iw:ih*0.45:0:0,scale=16:16,format=gray',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'gray',
          '-',
        ],
        { maxBuffer: 4 * 1024 * 1024, timeout: 6000 },
      );
      const frameBytes = 16 * 16;
      const frameCount = Math.floor(buf.length / frameBytes);
      if (frameCount < 10) {
        cachedMouseSleepHolds.set(absPath, { mtimeMs, sec: null });
        return null;
      }

      const upperMeans: number[] = new Array(frameCount);
      for (let k = 0; k < frameCount; k++) {
        const offset = k * frameBytes;
        let sum = 0;
        for (let i = 0; i < frameBytes; i++) {
          sum += buf[offset + i];
        }
        upperMeans[k] = sum / frameBytes;
      }

      const startAvg = (upperMeans[0] + upperMeans[1] + upperMeans[2]) / 3;
      const endAvg =
        (upperMeans[frameCount - 1] + upperMeans[frameCount - 2] + upperMeans[frameCount - 3]) / 3;
      let minVal = Infinity;
      for (let k = 2; k < frameCount - 2; k++) {
        if (upperMeans[k] < minVal) minVal = upperMeans[k];
      }

      // If she starts upright (startAvg > 28), lowers her head to sleep (minVal < startAvg * 0.55),
      // AND rises back upright before the end of the file (endAvg > startAvg * 0.72):
      if (startAvg > 28 && minVal < startAvg * 0.55 && endAvg > startAvg * 0.72) {
        let lastTroughIdx = -1;
        const troughCeil = minVal + Math.max(2.5, (startAvg - minVal) * 0.14);
        for (let k = 2; k < frameCount - 2; k++) {
          if (upperMeans[k] <= troughCeil) {
            lastTroughIdx = k;
          }
        }
        if (lastTroughIdx >= 3) {
          const holdIdx = Math.max(2, lastTroughIdx - 1);
          const holdSec = Number((holdIdx / 4).toFixed(2));
          cachedMouseSleepHolds.set(absPath, { mtimeMs, sec: holdSec });
          return holdSec;
        }
      }

      cachedMouseSleepHolds.set(absPath, { mtimeMs, sec: null });
      return null;
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
      mouseIdleTimeoutSec: 20,
      mouseIdleHoldSec: {},
      dogRunJumpSec: 6.2,
      dogRunExitYPx: 361,
      dogRunExitXPx: 123,
      openingFlowchartStartSec: 4.65,
      openingFlowchartDensity: 1.0,
      angelBgTransparency: 0.3,
      groups: {},
      cases: {},
      escapes: {},
      escapeEnabled: {
        point_you: true,
        point_me: true,
        push_button: true,
      },
      caseEscapeCues: {},
      lipSync: {
        defaultEnabled: true,
        groups: {},
        cases: {},
      },
      videoDurations: {},
      videoSizes: {},
      videoOptimized: {},
      compressionPreset: 'lossless_21',
      escapeApexes: {},
      videoMaxPlays: {
        'case:tree_browse': 6,
        'case:hesitate_hint': 6,
      },
      videoPlayToEnd: {
        'case:seduction': true,
      },
    };

    const persistedOpt: Record<string, StoredVideoOptimizedInfo> = {};

    try {
      if (fs.existsSync(angelVideoMapPath)) {
        const parsed = JSON.parse(
          fs.readFileSync(angelVideoMapPath, 'utf8'),
        ) as Partial<StoredAngelVideoMap>;
        if (isSafeLocalMediaUrl(parsed.idle)) {
          const clean = parsed.idle.split('?')[0];
          result.idle = clean;
          result.idleVariants.idle_1 = clean;
        }
        if (parsed.idleVariants && typeof parsed.idleVariants === 'object') {
          for (const [k, v] of Object.entries(parsed.idleVariants)) {
            if (isSafeMapKey(k) && isSafeLocalMediaUrl(v)) result.idleVariants[k] = v.split('?')[0];
          }
        }
        if (isSafeLocalMediaUrl(parsed.mouseIdle)) {
          result.mouseIdle = parsed.mouseIdle.split('?')[0];
        }
        if (isSafeLocalMediaUrl(parsed.mouseIdleWake)) {
          result.mouseIdleWake = parsed.mouseIdleWake.split('?')[0];
        }
        if (
          typeof parsed.mouseIdleTimeoutSec === 'number' &&
          Number.isFinite(parsed.mouseIdleTimeoutSec) &&
          (parsed.mouseIdleTimeoutSec === 0 ||
            (parsed.mouseIdleTimeoutSec >= 5 && parsed.mouseIdleTimeoutSec <= 600))
        ) {
          result.mouseIdleTimeoutSec = Math.round(parsed.mouseIdleTimeoutSec);
        }
        if (
          parsed.mouseIdleHoldSec &&
          typeof parsed.mouseIdleHoldSec === 'object' &&
          result.mouseIdleHoldSec
        ) {
          for (const [k, v] of Object.entries(parsed.mouseIdleHoldSec)) {
            if (isSafeLocalMediaUrl(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
              result.mouseIdleHoldSec[k.split('?')[0]] = v;
            }
          }
        }
        if (isSafeLocalMediaUrl(parsed.dogRunVideo)) {
          result.dogRunVideo = parsed.dogRunVideo.split('?')[0];
        }
        if (isSafeLocalMediaUrl(parsed.danceStarsVideo)) {
          result.danceStarsVideo = parsed.danceStarsVideo.split('?')[0];
        }
        if (
          typeof parsed.dogRunJumpSec === 'number' &&
          Number.isFinite(parsed.dogRunJumpSec) &&
          parsed.dogRunJumpSec >= 0 &&
          parsed.dogRunJumpSec <= 30
        ) {
          result.dogRunJumpSec = Math.round(parsed.dogRunJumpSec * 10) / 10;
        }
        if (
          typeof parsed.dogRunExitYPx === 'number' &&
          Number.isFinite(parsed.dogRunExitYPx) &&
          parsed.dogRunExitYPx >= 0 &&
          parsed.dogRunExitYPx <= 752
        ) {
          result.dogRunExitYPx = Math.round(parsed.dogRunExitYPx);
        }
        if (
          typeof parsed.dogRunExitXPx === 'number' &&
          Number.isFinite(parsed.dogRunExitXPx) &&
          parsed.dogRunExitXPx >= -80 &&
          parsed.dogRunExitXPx <= 560
        ) {
          result.dogRunExitXPx = Math.round(parsed.dogRunExitXPx);
        }
        if (
          typeof parsed.openingFlowchartStartSec === 'number' &&
          Number.isFinite(parsed.openingFlowchartStartSec) &&
          parsed.openingFlowchartStartSec >= 0 &&
          parsed.openingFlowchartStartSec <= 15
        ) {
          result.openingFlowchartStartSec = Math.round(parsed.openingFlowchartStartSec * 100) / 100;
        }
        if (
          typeof parsed.openingFlowchartDensity === 'number' &&
          Number.isFinite(parsed.openingFlowchartDensity) &&
          parsed.openingFlowchartDensity >= 0.25 &&
          parsed.openingFlowchartDensity <= 2.5
        ) {
          result.openingFlowchartDensity = Math.round(parsed.openingFlowchartDensity * 100) / 100;
        }
        if (
          typeof parsed.angelBgTransparency === 'number' &&
          Number.isFinite(parsed.angelBgTransparency) &&
          parsed.angelBgTransparency >= 0 &&
          parsed.angelBgTransparency <= 1
        ) {
          result.angelBgTransparency = Math.round(parsed.angelBgTransparency * 100) / 100;
        }
        if (isSafeLocalMediaUrl(parsed.defaultSpeaking)) {
          result.defaultSpeaking = parsed.defaultSpeaking.split('?')[0];
        }
        if (parsed.groups && typeof parsed.groups === 'object') {
          for (const [k, v] of Object.entries(parsed.groups)) {
            if (isSafeMapKey(k) && isSafeLocalMediaUrl(v)) result.groups[k] = v.split('?')[0];
          }
        }
        if (parsed.cases && typeof parsed.cases === 'object') {
          for (const [k, v] of Object.entries(parsed.cases)) {
            if (isSafeMapKey(k) && isSafeLocalMediaUrl(v)) result.cases[k] = v.split('?')[0];
          }
        }
        if (parsed.escapes && typeof parsed.escapes === 'object') {
          for (const [k, v] of Object.entries(parsed.escapes)) {
            if (isSafeMapKey(k) && isSafeLocalMediaUrl(v)) result.escapes[k] = v.split('?')[0];
          }
        }
        if (parsed.escapeEnabled && typeof parsed.escapeEnabled === 'object') {
          for (const [k, v] of Object.entries(parsed.escapeEnabled)) {
            if (isSafeMapKey(k) && typeof v === 'boolean' && result.escapeEnabled) {
              result.escapeEnabled[k] = v;
            }
          }
        }
        if (parsed.caseEscapeCues && typeof parsed.caseEscapeCues === 'object') {
          for (const [caseId, cueMap] of Object.entries(parsed.caseEscapeCues)) {
            if (isSafeMapKey(caseId) && cueMap && typeof cueMap === 'object' && result.caseEscapeCues) {
              const cleaned: Partial<
                Record<'point_you' | 'point_me' | 'push_button', 'on' | 'off'>
              > = {};
              if (cueMap.point_you === 'on' || cueMap.point_you === 'off') {
                cleaned.point_you = cueMap.point_you;
              }
              if (cueMap.point_me === 'on' || cueMap.point_me === 'off') {
                cleaned.point_me = cueMap.point_me;
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
              if (isSafeMapKey(k) && (v === 'on' || v === 'off')) result.lipSync.groups[k] = v;
            }
          }
          if (parsed.lipSync.cases && typeof parsed.lipSync.cases === 'object') {
            for (const [k, v] of Object.entries(parsed.lipSync.cases)) {
              if (isSafeMapKey(k) && (v === 'on' || v === 'off')) result.lipSync.cases[k] = v;
            }
          }
        }
        if (parsed.videoDurations && typeof parsed.videoDurations === 'object' && result.videoDurations) {
          for (const [k, v] of Object.entries(parsed.videoDurations)) {
            if (isSafeLocalMediaUrl(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
              result.videoDurations[k] = v;
            }
          }
        }
        if (parsed.escapeApexes && typeof parsed.escapeApexes === 'object' && result.escapeApexes) {
          for (const [k, v] of Object.entries(parsed.escapeApexes)) {
            if (isSafeLocalMediaUrl(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
              result.escapeApexes[k] = v;
            }
          }
        }
        if (parsed.videoMaxPlays && typeof parsed.videoMaxPlays === 'object' && result.videoMaxPlays) {
          for (const [k, v] of Object.entries(parsed.videoMaxPlays)) {
            if (
              /^(idle|mouse_idle|special|default|group|case|escape):[a-z0-9_]{1,40}$/.test(k) &&
              !k.endsWith(':__proto__') &&
              !k.endsWith(':constructor') &&
              !k.endsWith(':prototype') &&
              typeof v === 'number' &&
              Number.isFinite(v) &&
              v >= -1
            ) {
              result.videoMaxPlays[k] = Math.floor(v);
            }
          }
        }
        if (parsed.videoPlayToEnd && typeof parsed.videoPlayToEnd === 'object' && result.videoPlayToEnd) {
          for (const [k, v] of Object.entries(parsed.videoPlayToEnd)) {
            if (
              /^(idle|mouse_idle|special|default|group|case|escape):[a-z0-9_]{1,40}$/.test(k) &&
              !k.endsWith(':__proto__') &&
              !k.endsWith(':constructor') &&
              !k.endsWith(':prototype') &&
              typeof v === 'boolean'
            ) {
              result.videoPlayToEnd[k] = v;
            }
          }
        }
        if (isSafeLocalMediaUrl(parsed.seductionAudioUrl)) {
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
            if (isSafeMapKey(k) && isSafeLocalMediaUrl(v)) {
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
        if (isSafeLocalMediaUrl(parsed.thankJanAudioUrl)) {
          result.thankJanAudioUrl = parsed.thankJanAudioUrl;
        }
        if (isSafeLocalMediaUrl(parsed.udoBarkAudioUrl)) {
          result.udoBarkAudioUrl = parsed.udoBarkAudioUrl.split('?')[0];
        }
        if (
          typeof parsed.thankJanAudioDuration === 'number' &&
          Number.isFinite(parsed.thankJanAudioDuration) &&
          parsed.thankJanAudioDuration > 0
        ) {
          result.thankJanAudioDuration = parsed.thankJanAudioDuration;
        }
        if (
          parsed.compressionPreset === 'lossless_21' ||
          parsed.compressionPreset === 'balanced_24' ||
          parsed.compressionPreset === 'mobile_27' ||
          parsed.compressionPreset === 'mute_only'
        ) {
          result.compressionPreset = parsed.compressionPreset;
        }
        if (parsed.videoOptimized && typeof parsed.videoOptimized === 'object') {
          for (const [k, v] of Object.entries(parsed.videoOptimized)) {
            if (
              v &&
              typeof v === 'object' &&
              typeof v.size === 'number' &&
              typeof v.crf === 'number' &&
              typeof v.width === 'number' &&
              typeof v.height === 'number'
            ) {
              persistedOpt[k] = {
                size: v.size,
                crf: v.crf,
                width: v.width,
                height: v.height,
              };
            }
          }
        }
      }
    } catch {
      // Fall back to disk discovery
    }

    // Discover seduction audio duration & canonical URL (prefer uploaded MP3 in /assets/aistudio/)
    try {
      const uploadedSeductionUrl =
        '/assets/aistudio/Chess_Angle__a_beautiful_queen_and_her_infinite_re_8a3d493b.mp3';
      const uploadedSeductionPath = path.join(
        aistudioAssetsDir,
        'Chess_Angle__a_beautiful_queen_and_her_infinite_re_8a3d493b.mp3',
      );
      if (!result.seductionAudioUrl) {
        result.seductionAudioUrl = fs.existsSync(uploadedSeductionPath)
          ? uploadedSeductionUrl
          : '/voices/female/seduction.mp3';
      } else {
        result.seductionAudioUrl = result.seductionAudioUrl.split('?')[0];
      }

      const activeSedDiskPath = result.seductionAudioUrl.startsWith('/assets/aistudio/')
        ? path.join(aistudioAssetsDir, path.basename(result.seductionAudioUrl))
        : seductionVoiceMp3Path;

      if (fs.existsSync(activeSedDiskPath)) {
        const sStat = fs.statSync(activeSedDiskPath);
        if (!IS_PROD || !result.seductionAudioDuration) {
          const sDur = getVideoDurationSec(activeSedDiskPath, sStat.mtimeMs);
          if (sDur !== null) {
            result.seductionAudioDuration = sDur;
          }
        }
      }
      const voicesFemaleDir = path.dirname(seductionVoiceMp3Path);
      if (fs.existsSync(voicesFemaleDir)) {
        result.seductionAudioVariants = result.seductionAudioVariants || {};
        result.seductionAudioDurations = result.seductionAudioDurations || {};
        for (const entry of fs.readdirSync(voicesFemaleDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const sm = /^seduction_(\d+)\.mp3$/i.exec(entry.name);
          if (!sm) continue;
          const variantKey = `seduction_${sm[1]}`;
          const fullMp3 = path.join(voicesFemaleDir, entry.name);
          const vStat = fs.statSync(fullMp3);
          const existingUrl = result.seductionAudioVariants[variantKey];
          if (!existingUrl || (!IS_PROD && stripQueryFromAssetUrl(existingUrl) === entry.name)) {
            result.seductionAudioVariants[variantKey] = `/voices/female/${entry.name}`;
          }
          if (!IS_PROD || !result.seductionAudioDurations[variantKey]) {
            const vDur = getVideoDurationSec(fullMp3, vStat.mtimeMs);
            if (vDur !== null) {
              result.seductionAudioDurations[variantKey] = vDur;
            }
          }
        }
        const thankJanMp3 = path.join(voicesFemaleDir, 'thank_jan.mp3');
        if (fs.existsSync(thankJanMp3)) {
          const tStat = fs.statSync(thankJanMp3);
          if (!IS_PROD || !result.thankJanAudioDuration) {
            const tDur = getVideoDurationSec(thankJanMp3, tStat.mtimeMs);
            if (tDur !== null) {
              result.thankJanAudioDuration = tDur;
            }
          }
          if (!result.thankJanAudioUrl) {
            result.thankJanAudioUrl = '/voices/female/thank_jan.mp3';
          } else {
            result.thankJanAudioUrl = result.thankJanAudioUrl.split('?')[0];
          }
        }
      }
      if (fs.existsSync(udoBarkAssetMp3Path)) {
        result.udoBarkAudioUrl = '/assets/aistudio/udo_bark.mp3';
      } else if (result.udoBarkAudioUrl === '/assets/aistudio/udo_bark.mp3') {
        delete result.udoBarkAudioUrl;
      }
    } catch {
      // ignore
    }

    // Auto-discover all .mp4 files in public/assets/aistudio (in production, reuse pre-baked angel_video_map.json metadata without spawning ffprobe)
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
          if (result.videoSizes) {
            result.videoSizes[cleanPublicPath] = stat.size;
          }
          let dur: number | null = result.videoDurations?.[cleanPublicPath] ?? null;
          if (!IS_PROD || dur === null) {
            const probedDur = getVideoDurationSec(full, stat.mtimeMs);
            if (probedDur !== null) {
              dur = probedDur;
              if (result.videoDurations) {
                result.videoDurations[cleanPublicPath] = probedDur;
              }
            }
          }
          if (result.videoOptimized) {
            const memOpt = recordedVideoOptByPath.get(cleanPublicPath);
            const diskOpt = persistedOpt[cleanPublicPath];
            if (memOpt && memOpt.size === stat.size) {
              result.videoOptimized[cleanPublicPath] = memOpt;
            } else if (diskOpt && diskOpt.size === stat.size) {
              result.videoOptimized[cleanPublicPath] = diskOpt;
            } else if (!IS_PROD) {
              const dims = getVideoDimensions(full, stat.mtimeMs);
              const kbps = dur && dur > 0 ? (stat.size * 8) / (dur * 1000) : 9999;
              const autoOptimized =
                Boolean(dims && dims.width === 560 && dims.height === 752 && kbps <= 2600);
              const inferred: StoredVideoOptimizedInfo = {
                size: stat.size,
                crf: autoOptimized ? 21 : 0,
                width: dims?.width || 0,
                height: dims?.height || 0,
              };
              result.videoOptimized[cleanPublicPath] = inferred;
              recordedVideoOptByPath.set(cleanPublicPath, inferred);
            }
          }

          const m = /^angel_(idle|mouse_idle|special|default|group|case|escape)_([a-z0-9_]+)\.mp4$/i.exec(
            entry.name,
          );
          if (!m) continue;
          const kind = m[1].toLowerCase();
          const key = m[2].toLowerCase();
          const canonicalUrl = cleanPublicPath;

          if (kind === 'idle') {
            const normKey = key === 'idle_listening' ? 'idle_1' : key;
            const existing = result.idleVariants[normKey];
            if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
              result.idleVariants[normKey] = canonicalUrl;
            }
          } else if (kind === 'mouse_idle') {
            if (key === 'wake') {
              const existing = result.mouseIdleWake;
              if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
                result.mouseIdleWake = canonicalUrl;
              }
            } else {
              const existing = result.mouseIdle;
              if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
                result.mouseIdle = canonicalUrl;
              }
              if (!IS_PROD || result.mouseIdleHoldSec?.[cleanPublicPath] === undefined) {
                const holdSec = getMouseIdleSleepHoldSec(full, stat.mtimeMs);
                if (result.mouseIdleHoldSec) {
                  if (holdSec !== null) {
                    result.mouseIdleHoldSec[cleanPublicPath] = holdSec;
                  } else {
                    delete result.mouseIdleHoldSec[cleanPublicPath];
                  }
                }
              }
            }
          } else if (kind === 'special') {
            if (key === 'dog_run') {
              const existing = result.dogRunVideo;
              if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
                result.dogRunVideo = canonicalUrl;
              }
            } else if (key === 'dance_stars') {
              const existing = result.danceStarsVideo;
              if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
                result.danceStarsVideo = canonicalUrl;
              }
            }
          } else if (kind === 'default') {
            const existing = result.defaultSpeaking;
            if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
              result.defaultSpeaking = canonicalUrl;
            }
          } else if (kind === 'group') {
            const existing = result.groups[key];
            if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
              result.groups[key] = canonicalUrl;
            }
          } else if (kind === 'case') {
            const existing = result.cases[key];
            if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
              result.cases[key] = canonicalUrl;
            }
          } else if (kind === 'escape') {
            const existing = result.escapes[key];
            if (!existing || (!IS_PROD && stripQueryFromAssetUrl(existing) === entry.name)) {
              result.escapes[key] = canonicalUrl;
            }
            if (!IS_PROD || result.escapeApexes?.[cleanPublicPath] === undefined) {
              const apex = getEscapeGestureApexSec(full, stat.mtimeMs);
              if (apex !== null && result.escapeApexes) {
                result.escapeApexes[cleanPublicPath] = apex;
              }
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
    if (result.mouseIdle) {
      const base = stripQueryFromAssetUrl(result.mouseIdle);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.mouseIdle;
      }
    }
    if (result.mouseIdleWake) {
      const base = stripQueryFromAssetUrl(result.mouseIdleWake);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.mouseIdleWake;
      }
    }
    if (result.dogRunVideo) {
      const base = stripQueryFromAssetUrl(result.dogRunVideo);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.dogRunVideo;
      }
    }
    if (result.danceStarsVideo) {
      const base = stripQueryFromAssetUrl(result.danceStarsVideo);
      if (base && base.startsWith('angel_') && !fs.existsSync(path.join(aistudioAssetsDir, base))) {
        delete result.danceStarsVideo;
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

    // Populate builtin_*.mp4 videos for any slot that has no custom angel_*.mp4 override
    try {
      if (fs.existsSync(aistudioAssetsDir)) {
        for (const entry of fs.readdirSync(aistudioAssetsDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const mBuiltin = /^builtin_([a-z0-9_]+)\.mp4$/i.exec(entry.name);
          if (!mBuiltin) continue;
          const bKey = mBuiltin[1].toLowerCase();
          const cleanPublicPath = `/assets/aistudio/${entry.name}`;
          if (bKey === 'default_speaking') {
            if (!result.defaultSpeaking) result.defaultSpeaking = cleanPublicPath;
          } else if (bKey === 'mouse_idle_sleep') {
            if (!result.mouseIdle) result.mouseIdle = cleanPublicPath;
          } else if (bKey === 'mouse_wake_up') {
            if (!result.mouseIdleWake) result.mouseIdleWake = cleanPublicPath;
          } else if (bKey === 'dog_run') {
            if (!result.dogRunVideo) result.dogRunVideo = cleanPublicPath;
          } else if (bKey === 'dance_stars') {
            if (!result.danceStarsVideo) result.danceStarsVideo = cleanPublicPath;
          } else if (bKey.startsWith('idle_')) {
            if (!result.idleVariants[bKey]) result.idleVariants[bKey] = cleanPublicPath;
          } else if (bKey.startsWith('escape_')) {
            const escKey = bKey.slice('escape_'.length);
            if (!result.escapes[escKey]) result.escapes[escKey] = cleanPublicPath;
          } else if (!result.cases[bKey]) {
            result.cases[bKey] = cleanPublicPath;
          }
        }
      }
    } catch {
      // Ignore builtin discovery errors
    }

    // Prune nonexistent seductionAudioVariants (.mp3 files missing on disk)
    if (result.seductionAudioVariants) {
      for (const [k, v] of Object.entries(result.seductionAudioVariants)) {
        const fname = stripQueryFromAssetUrl(v);
        if (!fname || !fs.existsSync(path.join(publicVoicesFemaleDir, fname))) {
          delete result.seductionAudioVariants[k];
          if (result.seductionAudioDurations) {
            delete result.seductionAudioDurations[k];
          }
        }
      }
    }

    if (result.idleVariants.idle_1) {
      result.idle = result.idleVariants.idle_1;
    } else {
      delete result.idle;
    }

    const discoveredMusic = discoverMusicTracks();
    if (discoveredMusic.length > 0) {
      result.musicTracks = discoveredMusic;
    }

    return result;
  };

  const writeAngelVideoMap = (data: StoredAngelVideoMap): void => {
    const toDisk: StoredAngelVideoMap = {
      idle: data.idle,
      idleVariants: data.idleVariants,
      mouseIdle: data.mouseIdle,
      mouseIdleWake: data.mouseIdleWake,
      mouseIdleTimeoutSec:
        typeof data.mouseIdleTimeoutSec === 'number' ? data.mouseIdleTimeoutSec : 20,
      mouseIdleHoldSec: data.mouseIdleHoldSec || {},
      dogRunVideo: data.dogRunVideo,
      dogRunJumpSec:
        typeof data.dogRunJumpSec === 'number' ? data.dogRunJumpSec : 6.2,
      dogRunExitYPx:
        typeof data.dogRunExitYPx === 'number' ? Math.round(data.dogRunExitYPx) : 361,
      dogRunExitXPx:
        typeof data.dogRunExitXPx === 'number' ? Math.round(data.dogRunExitXPx) : 123,
      openingFlowchartStartSec:
        typeof data.openingFlowchartStartSec === 'number'
          ? Math.round(data.openingFlowchartStartSec * 100) / 100
          : 4.65,
      openingFlowchartDensity:
        typeof data.openingFlowchartDensity === 'number'
          ? Math.round(data.openingFlowchartDensity * 100) / 100
          : 1.0,
      angelBgTransparency:
        typeof data.angelBgTransparency === 'number'
          ? Math.round(data.angelBgTransparency * 100) / 100
          : 0.3,
      danceStarsVideo: data.danceStarsVideo,
      defaultSpeaking: data.defaultSpeaking,
      groups: data.groups,
      cases: data.cases,
      escapes: data.escapes || {},
      escapeEnabled: data.escapeEnabled || {
        point_you: true,
        point_me: true,
        push_button: true,
      },
      caseEscapeCues: data.caseEscapeCues || {},
      lipSync: data.lipSync || { defaultEnabled: true, groups: {}, cases: {} },
      videoDurations: data.videoDurations || {},
      videoSizes: data.videoSizes || {},
      videoOptimized: data.videoOptimized || {},
      compressionPreset: data.compressionPreset || 'lossless_21',
      escapeApexes: data.escapeApexes || {},
      videoMaxPlays: data.videoMaxPlays || {
        'case:tree_browse': 6,
        'case:hesitate_hint': 6,
      },
      videoPlayToEnd: data.videoPlayToEnd || { 'case:seduction': true },
      seductionAudioUrl: data.seductionAudioUrl,
      seductionAudioDuration: data.seductionAudioDuration,
      seductionAudioVariants: data.seductionAudioVariants || {},
      seductionAudioDurations: data.seductionAudioDurations || {},
      seductionTriggerMode: data.seductionTriggerMode || 'balanced',
      thankJanAudioUrl: data.thankJanAudioUrl,
      thankJanAudioDuration: data.thankJanAudioDuration,
      udoBarkAudioUrl: data.udoBarkAudioUrl,
      musicTracks: data.musicTracks || discoverMusicTracks(),
    };
    fs.mkdirSync(aistudioAssetsDir, { recursive: true });
    fs.writeFileSync(angelVideoMapPath, JSON.stringify(toDisk, null, 2), 'utf8');
  };

  // Sync public/assets/aistudio/angel_video_map.json in dev so static builds & ZIP exports stay 100% self-contained
  if (!IS_PROD) {
    try {
      writeAngelVideoMap(readAngelVideoMap());
    } catch {
      // Ignore read-only filesystem in restricted environments
    }
  }

  // ============================================================================
  // Video Studio Production Lock, Developer Password Gate & Cross-Site Guard (Dev-Only)
  // ============================================================================
  const STUDIO_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const STUDIO_LOGIN_WINDOW_MS = 5 * 60 * 1000;
  const STUDIO_LOGIN_MAX_ATTEMPTS = 8;

  const studioSessions = new Map<string, number>(); // token -> expiresAtMs
  const studioLoginAttempts = new Map<string, number[]>(); // ip -> timestamps
  const STUDIO_AUTH_HASH_FILE = path.resolve(__dirname, '.studio-auth-hash.json');

  const loadPersistedStudioPasswordRecord = (): { saltHex: string; hashHex: string } | null => {
    if (IS_PROD) return null;
    try {
      if (!fs.existsSync(STUDIO_AUTH_HASH_FILE)) return null;
      const parsed = JSON.parse(fs.readFileSync(STUDIO_AUTH_HASH_FILE, 'utf8')) as {
        saltHex?: unknown;
        hashHex?: unknown;
      };
      if (
        typeof parsed.saltHex === 'string' &&
        /^[0-9a-f]{32}$/i.test(parsed.saltHex) &&
        typeof parsed.hashHex === 'string' &&
        /^[0-9a-f]{128}$/i.test(parsed.hashHex)
      ) {
        return { saltHex: parsed.saltHex, hashHex: parsed.hashHex };
      }
    } catch {
      // Ignore unreadable/corrupt dev auth hash file
    }
    return null;
  };

  const persistStudioPasswordRecord = (rec: { saltHex: string; hashHex: string }): void => {
    if (IS_PROD) return;
    try {
      fs.writeFileSync(STUDIO_AUTH_HASH_FILE, JSON.stringify(rec, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Ignore read-only filesystem
    }
  };

  let claimedStudioPasswordRecord: { saltHex: string; hashHex: string } | null =
    loadPersistedStudioPasswordRecord();

  const getConfiguredEnvStudioPassword = (): string => {
    const raw = process.env.STUDIO_DEV_PASSWORD;
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
  };

  const hashStudioPassword = (password: string, saltHex?: string): { saltHex: string; hashHex: string } => {
    const salt = saltHex || crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return { saltHex: salt, hashHex: derived };
  };

  const timingSafeEqualStrings = (a: string, b: string): boolean => {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  };

  const issueStudioSessionToken = (): string => {
    const now = Date.now();
    for (const [tok, exp] of studioSessions.entries()) {
      if (exp <= now) studioSessions.delete(tok);
    }
    const token = crypto.randomBytes(32).toString('hex');
    studioSessions.set(token, now + STUDIO_SESSION_TTL_MS);
    return token;
  };

  const extractStudioBearerToken = (req: express.Request): string | null => {
    const auth = String(req.headers.authorization || '').trim();
    if (!auth.toLowerCase().startsWith('bearer ')) return null;
    const token = auth.slice(7).trim();
    return token.length >= 32 && token.length <= 128 ? token : null;
  };

  const isStudioBearerValid = (req: express.Request): boolean => {
    const token = extractStudioBearerToken(req);
    if (!token) return false;
    const exp = studioSessions.get(token);
    if (!exp) return false;
    if (exp <= Date.now()) {
      studioSessions.delete(token);
      return false;
    }
    return true;
  };

  const requireStudioDevHostAndOrigin = (
    req: express.Request,
    res: express.Response,
    requireOriginHeader = true,
  ): boolean => {
    // Video Studio mutations, file uploads, FFmpeg transcodes, and password auth are strictly
    // disabled in production builds and on shared public preview hosts (`ais-pre-*`).
    if (IS_PROD) {
      res.status(403).json({ error: 'Video Studio is disabled in production builds.' });
      return false;
    }

    const forwardedHost = String(req.headers['x-forwarded-host'] || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const directHost = String(req.headers.host || '').trim().toLowerCase();
    const activeHost = forwardedHost || directHost;
    if (activeHost.startsWith('ais-pre-')) {
      res.status(403).json({ error: 'Video Studio is disabled on shared preview hosts.' });
      return false;
    }

    const requestedWith = String(req.headers['x-requested-with'] || '');
    if (requestedWith !== 'ChessAngelVideoStudio') {
      res.status(403).json({ error: 'Forbidden cross-origin Studio request.' });
      return false;
    }

    if (!requireOriginHeader) return true;

    // Require a valid same-origin Origin or Referer header on all Studio mutations & auth posts
    const originSource =
      typeof req.headers.origin === 'string' && req.headers.origin.length > 0
        ? req.headers.origin
        : typeof req.headers.referer === 'string' && req.headers.referer.length > 0
          ? req.headers.referer
          : '';
    if (!originSource) {
      res.status(403).json({ error: 'Missing Origin header for Studio mutation.' });
      return false;
    }

    try {
      const originHost = new URL(originSource).host.toLowerCase();
      if (
        !originHost ||
        (forwardedHost && originHost !== forwardedHost && originHost !== directHost) ||
        (!forwardedHost && directHost && originHost !== directHost)
      ) {
        res.status(403).json({ error: 'Cross-origin Studio mutation blocked.' });
        return false;
      }
    } catch {
      res.status(403).json({ error: 'Invalid Origin header.' });
      return false;
    }

    return true;
  };

  const requireStudioDeveloperAuth = (
    req: express.Request,
    res: express.Response,
  ): boolean => {
    if (!requireStudioDevHostAndOrigin(req, res, true)) return false;
    if (!isStudioBearerValid(req)) {
      res.status(401).json({ error: 'Developer password authentication required.' });
      return false;
    }
    return true;
  };

  app.get('/api/studio-auth/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireStudioDevHostAndOrigin(req, res, false)) return;
    const envPw = getConfiguredEnvStudioPassword();
    const source: 'env' | 'claimed' | 'unconfigured' = envPw
      ? 'env'
      : claimedStudioPasswordRecord
        ? 'claimed'
        : 'unconfigured';
    res.json({
      configured: source !== 'unconfigured',
      source,
      authenticated: isStudioBearerValid(req),
    });
  });

  app.post('/api/studio-auth/setup', express.json(), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireStudioDevHostAndOrigin(req, res, true)) return;
    if (getConfiguredEnvStudioPassword() || claimedStudioPasswordRecord) {
      res.status(409).json({ error: 'Developer password is already configured.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 1 || password.length > 128) {
      res.status(400).json({ error: 'Developer passcode must be between 1 and 128 characters.' });
      return;
    }
    claimedStudioPasswordRecord = hashStudioPassword(password);
    persistStudioPasswordRecord(claimedStudioPasswordRecord);
    const token = issueStudioSessionToken();
    res.json({ ok: true, token });
  });

  app.post('/api/studio-auth/login', express.json(), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireStudioDevHostAndOrigin(req, res, true)) return;

    const clientIp = String(req.ip || req.socket.remoteAddress || 'local');
    const now = Date.now();
    const recent = (studioLoginAttempts.get(clientIp) || []).filter(
      (t) => now - t <= STUDIO_LOGIN_WINDOW_MS,
    );
    if (recent.length >= STUDIO_LOGIN_MAX_ATTEMPTS) {
      studioLoginAttempts.set(clientIp, recent);
      res.status(429).json({ error: 'Too many failed attempts. Please wait a few minutes.' });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const envPw = getConfiguredEnvStudioPassword();
    if (!envPw && !claimedStudioPasswordRecord) {
      res.status(412).json({ error: 'Developer password has not been set up yet.' });
      return;
    }

    let valid = false;
    if (envPw) {
      // Configured environment secret always takes precedence over any claimed fallback hash
      valid = timingSafeEqualStrings(password, envPw);
    } else if (claimedStudioPasswordRecord) {
      const candidate = hashStudioPassword(password, claimedStudioPasswordRecord.saltHex);
      valid = timingSafeEqualStrings(candidate.hashHex, claimedStudioPasswordRecord.hashHex);
    }

    if (!valid) {
      recent.push(now);
      studioLoginAttempts.set(clientIp, recent);
      res.status(401).json({ error: 'Incorrect developer password.' });
      return;
    }

    studioLoginAttempts.delete(clientIp);
    const token = issueStudioSessionToken();
    res.json({ ok: true, token });
  });

  app.post('/api/studio-auth/logout', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireStudioDevHostAndOrigin(req, res, true)) return;
    const token = extractStudioBearerToken(req);
    if (token) {
      studioSessions.delete(token);
    }
    res.json({ ok: true });
  });

  app.get('/api/angel-videos', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(readAngelVideoMap());
  });

  // Strictly disable all Video Studio mutation endpoints in consumer production builds
  app.use('/api/angel-videos', (req, res, next) => {
    if (IS_PROD && req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(403).json({ error: 'Video Studio endpoints are disabled in production.' });
      return;
    }
    next();
  });

  app.put('/api/angel-videos/lip-sync', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      scope?: string;
      key?: string;
      rule?: string;
    };
    const scope = String(body.scope || '');
    const key = String(body.key || '');
    const rule = String(body.rule || '');

    if (!['global', 'group', 'case'].includes(scope)) {
      res.status(400).json({ error: 'Invalid lip-sync scope.' });
      return;
    }
    if (!['on', 'off', 'inherit'].includes(rule)) {
      res.status(400).json({ error: 'Invalid lip-sync rule.' });
      return;
    }
    if (scope !== 'global' && !isSafeMapKey(key)) {
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

  const VALID_ESCAPE_CUE_KEYS = ['point_you', 'point_me', 'push_button'] as const;

  app.put('/api/angel-videos/escape-toggle', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as { key?: string; enabled?: boolean };
    const key = String(body.key || '');
    if (
      !VALID_ESCAPE_CUE_KEYS.includes(key as (typeof VALID_ESCAPE_CUE_KEYS)[number]) ||
      typeof body.enabled !== 'boolean'
    ) {
      res.status(400).json({ error: 'Invalid escape toggle payload.' });
      return;
    }
    const map = readAngelVideoMap();
    if (!map.escapeEnabled) {
      map.escapeEnabled = { point_you: true, point_me: true, push_button: true };
    }
    map.escapeEnabled[key] = body.enabled;
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/case-cue', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      caseId?: string;
      cueKey?: string;
      rule?: string;
    };
    const caseId = String(body.caseId || '');
    const cueKey = String(body.cueKey || '') as 'point_you' | 'point_me' | 'push_button';
    const rule = String(body.rule || '');
    if (
      !isSafeMapKey(caseId) ||
      !VALID_ESCAPE_CUE_KEYS.includes(cueKey) ||
      !['on', 'off', 'inherit'].includes(rule)
    ) {
      res.status(400).json({ error: 'Invalid per-case cue payload.' });
      return;
    }

    const map = readAngelVideoMap();
    if (!map.caseEscapeCues) {
      map.caseEscapeCues = {};
    }
    if (!Object.hasOwn(map.caseEscapeCues, caseId) || !map.caseEscapeCues[caseId]) {
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
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      slotId?: string;
      maxPlays?: number;
    };
    const slotId = String(body.slotId || '');
    const slotSuffix = slotId.split(':')[1] || '';
    const rawMax = Number(body.maxPlays);
    if (
      !/^(idle|mouse_idle|special|default|group|case|escape):[a-z0-9_]{1,40}$/.test(slotId) ||
      !isSafeMapKey(slotSuffix) ||
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
      map.videoMaxPlays = { 'case:tree_browse': 6, 'case:hesitate_hint': 6 };
    }

    if (intMax === -1) {
      if (
        slotId === 'case:tree_browse' ||
        slotId === 'case:seduction' ||
        slotId === 'idle:idle_7' ||
        slotId === 'idle:idle_8'
      ) {
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
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      slotId?: string;
      playToEnd?: boolean;
    };
    const slotId = String(body.slotId || '');
    const slotSuffix = slotId.split(':')[1] || '';
    if (
      !/^(idle|mouse_idle|special|default|group|case|escape):[a-z0-9_]{1,40}$/.test(slotId) ||
      !isSafeMapKey(slotSuffix) ||
      typeof body.playToEnd !== 'boolean'
    ) {
      res.status(400).json({ error: 'Invalid play-to-end payload.' });
      return;
    }

    const map = readAngelVideoMap();
    if (!map.videoPlayToEnd) {
      map.videoPlayToEnd = { 'case:seduction': true };
    }
    // Persist both explicit `true` (No Cut) and explicit `false` (Developer Consented to Allow Cut)
    map.videoPlayToEnd[slotId] = body.playToEnd;

    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/mouse-idle-timeout', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const raw = Number((req.body || {}).timeoutSec);
    if (!Number.isFinite(raw) || (raw !== 0 && (raw < 5 || raw > 600))) {
      res.status(400).json({ error: 'Invalid mouse-idle timeout.' });
      return;
    }
    const map = readAngelVideoMap();
    map.mouseIdleTimeoutSec = Math.round(raw);
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/dog-run-jump', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      jumpSec?: unknown;
      exitYPx?: unknown;
      exitXPx?: unknown;
    };
    const hasJumpSec = body.jumpSec !== undefined;
    const hasExitY = body.exitYPx !== undefined;
    const hasExitX = body.exitXPx !== undefined;
    if (!hasJumpSec && !hasExitY && !hasExitX) {
      res.status(400).json({ error: 'Missing dog jump-out parameters.' });
      return;
    }

    const map = readAngelVideoMap();
    if (hasJumpSec) {
      const raw = Number(body.jumpSec);
      if (!Number.isFinite(raw) || raw < 0 || raw > 30) {
        res.status(400).json({ error: 'Invalid dog jump-out timing.' });
        return;
      }
      map.dogRunJumpSec = Math.round(raw * 10) / 10;
    }
    if (hasExitY) {
      const rawY = Number(body.exitYPx);
      if (!Number.isFinite(rawY) || rawY < 0 || rawY > 752) {
        res.status(400).json({ error: 'Invalid dog jump-out Y pixel (0..752).' });
        return;
      }
      map.dogRunExitYPx = Math.round(rawY);
    }
    if (hasExitX) {
      const rawX = Number(body.exitXPx);
      if (!Number.isFinite(rawX) || rawX < -80 || rawX > 560) {
        res.status(400).json({ error: 'Invalid dog jump-out X pixel (-80..560).' });
        return;
      }
      map.dogRunExitXPx = Math.round(rawX);
    }

    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/opening-flowchart', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      startSec?: unknown;
      density?: unknown;
    };
    const hasStartSec = body.startSec !== undefined;
    const hasDensity = body.density !== undefined;
    if (!hasStartSec && !hasDensity) {
      res.status(400).json({ error: 'Missing opening flowchart parameters.' });
      return;
    }

    const map = readAngelVideoMap();
    if (hasStartSec) {
      const rawStart = Number(body.startSec);
      if (!Number.isFinite(rawStart) || rawStart < 0 || rawStart > 15) {
        res.status(400).json({ error: 'Invalid opening flowchart start timer (0..15s).' });
        return;
      }
      map.openingFlowchartStartSec = Math.round(rawStart * 100) / 100;
    }
    if (hasDensity) {
      const rawDensity = Number(body.density);
      if (!Number.isFinite(rawDensity) || rawDensity < 0.25 || rawDensity > 2.5) {
        res.status(400).json({ error: 'Invalid opening flowchart density (0.25..2.5).' });
        return;
      }
      map.openingFlowchartDensity = Math.round(rawDensity * 100) / 100;
    }

    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/bg-transparency', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const raw = Number((req.body || {}).transparency);
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
      res.status(400).json({ error: 'Invalid background transparency strength (0..1).' });
      return;
    }
    const map = readAngelVideoMap();
    map.angelBgTransparency = Math.round(raw * 100) / 100;
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.put('/api/angel-videos/seduction-mode', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
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
      if (!requireStudioDeveloperAuth(req, res)) return;
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
    '/api/angel-videos/udo-bark-audio',
    express.raw({ type: '*/*', limit: '25mb' }),
    (req, res) => {
      if (!requireStudioDeveloperAuth(req, res)) return;
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 64) {
        res.status(400).json({ error: 'Empty or invalid barking audio file.' });
        return;
      }

      const tmpAudioIn = path.join(
        os.tmpdir(),
        `udo_bark_in_${process.pid}_${Date.now()}.bin`,
      );
      const tmpAudioOut = path.join(
        os.tmpdir(),
        `udo_bark_out_${process.pid}_${Date.now()}.mp3`,
      );

      try {
        fs.mkdirSync(aistudioAssetsDir, { recursive: true });
        const looksLikeMp3 =
          (body.length >= 3 && body[0] === 0x49 && body[1] === 0x44 && body[2] === 0x33) ||
          (body.length >= 2 && body[0] === 0xff && (body[1] & 0xe0) === 0xe0);

        if (looksLikeMp3 && body.length <= 512 * 1024) {
          // Preserve user-submitted MP3 bytes directly without re-synthesizing
          fs.writeFileSync(udoBarkAssetMp3Path, body);
        } else {
          // Gently convert/reduce size to lightweight mono MP3 while preserving original recording
          fs.writeFileSync(tmpAudioIn, body);
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
              '-b:a',
              '96k',
              tmpAudioOut,
            ],
            { timeout: 20000 },
          );
          fs.copyFileSync(tmpAudioOut, udoBarkAssetMp3Path);
        }

        const audioUrl = `/assets/aistudio/udo_bark.mp3?v=${Date.now()}`;
        const map = readAngelVideoMap();
        map.udoBarkAudioUrl = '/assets/aistudio/udo_bark.mp3';
        writeAngelVideoMap(map);

        res.json({ ok: true, audioUrl, map });
      } catch (err) {
        console.error('Failed to process Udo bark audio upload:', err);
        res.status(500).json({ error: 'Failed to save Udo barking audio.' });
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

  app.delete('/api/angel-videos/udo-bark-audio', (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    try {
      if (fs.existsSync(udoBarkAssetMp3Path)) {
        fs.unlinkSync(udoBarkAssetMp3Path);
      }
      const map = readAngelVideoMap();
      delete map.udoBarkAudioUrl;
      writeAngelVideoMap(map);
      res.json({ ok: true, map });
    } catch (err) {
      console.error('Failed to delete Udo bark audio:', err);
      res.status(500).json({ error: 'Failed to clear Udo barking audio.' });
    }
  });

  app.put('/api/angel-videos/compression-preset', express.json(), (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const preset = String((req.body || {}).preset || '') as AngelCompressionPreset;
    if (!['lossless_21', 'balanced_24', 'mobile_27', 'mute_only'].includes(preset)) {
      res.status(400).json({ error: 'Invalid compression preset.' });
      return;
    }
    const map = readAngelVideoMap();
    map.compressionPreset = preset;
    writeAngelVideoMap(map);
    res.json({ ok: true, map });
  });

  app.post('/api/angel-videos/compress', express.json(), async (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const body = (req.body || {}) as {
      preset?: AngelCompressionPreset;
      targetUrl?: string;
      force?: boolean;
    };
    const initialMap = readAngelVideoMap();
    const chosenPreset: AngelCompressionPreset =
      body.preset && ['lossless_21', 'balanced_24', 'mobile_27'].includes(body.preset)
        ? body.preset
        : initialMap.compressionPreset && initialMap.compressionPreset !== 'mute_only'
          ? initialMap.compressionPreset
          : 'lossless_21';
    const targetCrf = presetToCrf(chosenPreset) ?? 21;
    const force = Boolean(body.force);

    let targetFileName: string | null = null;
    if (typeof body.targetUrl === 'string' && body.targetUrl.trim().length > 0) {
      targetFileName = stripQueryFromAssetUrl(body.targetUrl.trim());
      if (!targetFileName) {
        res.status(400).json({ error: 'Target video is not a local Studio MP4 asset.' });
        return;
      }
    }

    try {
      if (!fs.existsSync(aistudioAssetsDir)) {
        res.json({
          ok: true,
          crf: targetCrf,
          totalFiles: 0,
          compressedCount: 0,
          skippedCount: 0,
          beforeBytes: 0,
          afterBytes: 0,
          map: initialMap,
        });
        return;
      }

      const entries = fs
        .readdirSync(aistudioAssetsDir, { withFileTypes: true })
        .filter(
          (e) =>
            e.isFile() &&
            /\.(mp4|webm|mov|m4v)$/i.test(e.name) &&
            !e.name.includes('.opt.') &&
            !e.name.includes('.tmp') &&
            (!targetFileName || e.name === targetFileName),
        );

      let compressedCount = 0;
      let skippedCount = 0;
      let beforeBytes = 0;
      let afterBytes = 0;

      for (const entry of entries) {
        const full = path.join(aistudioAssetsDir, entry.name);
        if (!full.startsWith(aistudioAssetsDir + path.sep)) continue;
        const cleanPublicPath = `/assets/aistudio/${entry.name}`;
        const statBefore = fs.statSync(full);
        beforeBytes += statBefore.size;

        const existingOpt = initialMap.videoOptimized?.[cleanPublicPath];
        const alreadyAtTarget =
          !force &&
          Boolean(
            existingOpt &&
              existingOpt.size === statBefore.size &&
              existingOpt.width === 560 &&
              existingOpt.height === 752 &&
              existingOpt.crf >= targetCrf,
          );

        if (alreadyAtTarget) {
          skippedCount += 1;
          afterBytes += statBefore.size;
          continue;
        }

        const tmpOpt = path.join(
          os.tmpdir(),
          `angel_batch_opt_${process.pid}_${Date.now()}_${entry.name}`,
        );
        try {
          const comp = await compressPortraitMp4Async(full, tmpOpt, {
            crf: targetCrf,
            trimEndSec: null,
            enforceBackdropMatch: true,
          });
          const needsDimNormalize =
            !existingOpt || existingOpt.width !== 560 || existingOpt.height !== 752;
          if (
            comp.outBytes > 1000 &&
            (comp.outBytes < statBefore.size || comp.backdropCalibrated || needsDimNormalize)
          ) {
            fs.copyFileSync(tmpOpt, full);
            const statAfter = fs.statSync(full);
            verifiedSilentVideos.set(full, statAfter.mtimeMs);
            afterBytes += statAfter.size;
            compressedCount += 1;
            const info: StoredVideoOptimizedInfo = {
              size: statAfter.size,
              crf: targetCrf,
              width: 560,
              height: 752,
            };
            recordedVideoOptByPath.set(cleanPublicPath, info);
          } else {
            skippedCount += 1;
            afterBytes += statBefore.size;
            const dims = getVideoDimensions(full, statBefore.mtimeMs);
            const info: StoredVideoOptimizedInfo = {
              size: statBefore.size,
              crf: Math.max(existingOpt?.crf || 0, targetCrf),
              width: dims?.width || 560,
              height: dims?.height || 752,
            };
            recordedVideoOptByPath.set(cleanPublicPath, info);
          }
        } finally {
          try {
            if (fs.existsSync(tmpOpt)) fs.unlinkSync(tmpOpt);
          } catch {
            // ignore
          }
        }
      }

      const updatedMap = readAngelVideoMap();
      if (body.preset && ['lossless_21', 'balanced_24', 'mobile_27'].includes(body.preset)) {
        updatedMap.compressionPreset = body.preset;
      }
      writeAngelVideoMap(updatedMap);

      res.json({
        ok: true,
        crf: targetCrf,
        totalFiles: entries.length,
        compressedCount,
        skippedCount,
        beforeBytes,
        afterBytes,
        map: updatedMap,
      });
    } catch (err) {
      console.error('Failed to compress Studio portrait videos:', err);
      res.status(500).json({ error: 'Video compression routine failed.' });
    }
  });

  app.post(
    '/api/angel-videos/:kind/:key',
    express.raw({ type: '*/*', limit: '80mb' }),
    async (req, res) => {
      if (!requireStudioDeveloperAuth(req, res)) return;
      const kind = String(req.params.kind || '');
      const rawKey = String(req.params.key || '');
      const key = kind === 'idle' && rawKey === 'idle_listening' ? 'idle_1' : rawKey;
      if (
        !['idle', 'mouse_idle', 'special', 'default', 'group', 'case', 'escape'].includes(kind) ||
        !isSafeMapKey(key)
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
      const cleanUploadedPath = `/assets/aistudio/${fileName}`;
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
        const inBytesRaw = body.length;
        try {
          // Never auto-trim uploaded .mp4 files on disk without developer consent;
          // dark mid-clip choreography (e.g. ducking out of frame in lost_queen) and full tails are preserved 100%.

          // Special exception for "seduction": before stripping video sound (-an),
          // automatically separate any embedded audio track into "<key>.mp3" so her original video voice/sound plays in sync!
          // For "thank_jan", always strip the video's original sound so Chess Angel's dedicated voice clip plays cleanly.
          let extractedSlotAudio = false;
          let extractedAudioUrl: string | undefined;
          let extractedAudioDuration: number | undefined;

          const isSeductionSlot =
            kind === 'case' && (key === 'seduction' || /^seduction_([2-9]|[1-9][0-9]+)$/.test(key));

          if (isSeductionSlot) {
            const tmpSeductionMp3 = path.join(
              os.tmpdir(),
              `${key}_extract_${process.pid}_${Date.now()}.mp3`,
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
                extractedSlotAudio = true;
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

          const preMap = readAngelVideoMap();
          const activePreset = preMap.compressionPreset || 'lossless_21';
          const targetCrf = presetToCrf(activePreset);
          const comp = await compressPortraitMp4Async(tmpIn, tmpOut, {
            crf: targetCrf,
            trimEndSec: null,
            enforceBackdropMatch: true,
          });

          fs.copyFileSync(tmpOut, destAbs);
          const stat = fs.statSync(destAbs);
          verifiedSilentVideos.set(destAbs, stat.mtimeMs);
          const dims = getVideoDimensions(destAbs, stat.mtimeMs);
          recordedVideoOptByPath.set(cleanUploadedPath, {
            size: stat.size,
            crf: comp.crfApplied,
            width: dims?.width || 560,
            height: dims?.height || 752,
          });

          const publicUrl = `/assets/aistudio/${fileName}?v=${Date.now()}`;
          const map = readAngelVideoMap();
          if (kind === 'idle') {
            map.idleVariants[key] = publicUrl;
            if (key === 'idle_1') {
              map.idle = publicUrl;
            }
          } else if (kind === 'mouse_idle') {
            if (key === 'wake') {
              map.mouseIdleWake = publicUrl;
            } else {
              map.mouseIdle = publicUrl;
              const freshHold = getMouseIdleSleepHoldSec(destAbs, stat.mtimeMs);
              if (!map.mouseIdleHoldSec) map.mouseIdleHoldSec = {};
              if (freshHold !== null) {
                map.mouseIdleHoldSec[cleanUploadedPath] = freshHold;
              } else {
                delete map.mouseIdleHoldSec[cleanUploadedPath];
              }
            }
          } else if (kind === 'special') {
            if (key === 'dog_run') {
              map.dogRunVideo = publicUrl;
            } else if (key === 'dance_stars') {
              map.danceStarsVideo = publicUrl;
            }
          } else if (kind === 'default') {
            map.defaultSpeaking = publicUrl;
          } else if (kind === 'group') {
            map.groups[key] = publicUrl;
          } else if (kind === 'escape') {
            map.escapes[key] = publicUrl;
            const freshApex = getEscapeGestureApexSec(destAbs, stat.mtimeMs);
            if (freshApex !== null && map.escapeApexes) {
              map.escapeApexes[cleanUploadedPath] = freshApex;
            }
          } else {
            map.cases[key] = publicUrl;
          }
          if (extractedSlotAudio && extractedAudioUrl) {
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

          res.json({
            ok: true,
            url: publicUrl,
            extractedAudio: extractedSlotAudio,
            inBytes: comp.inBytes,
            outBytes: stat.size,
            compressed: stat.size < comp.inBytes,
            crf: comp.crfApplied,
            map,
          });
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
        } else if (kind === 'mouse_idle') {
          if (key === 'wake') {
            map.mouseIdleWake = publicUrl;
          } else {
            map.mouseIdle = publicUrl;
          }
        } else if (kind === 'special') {
          if (key === 'dog_run') {
            map.dogRunVideo = publicUrl;
          } else if (key === 'dance_stars') {
            map.danceStarsVideo = publicUrl;
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

        res.json({
          ok: true,
          url: publicUrl,
          extractedAudio: false,
          inBytes: inBytesRaw,
          outBytes: stat.size,
          compressed: stat.size < inBytesRaw,
          crf: 0,
          map,
        });
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

  // All bundled / locked-in portrait videos are protected on disk against accidental unlink
  const LOCKED_AISTUDIO_VIDEOS = new Set<string>([
    'angel_case_angel_modal_off.mp4',
    'angel_case_angel_modal_on.mp4',
    'angel_case_ask_promotion_2.mp4',
    'angel_case_calc_offer.mp4',
    'angel_case_calc_pure.mp4',
    'angel_case_calc_showing.mp4',
    'angel_case_castled.mp4',
    'angel_case_checkmate_win.mp4',
    'angel_case_draw.mp4',
    'angel_case_intro.mp4',
    'angel_case_lost_queen.mp4',
    'angel_case_new_match.mp4',
    'angel_case_seduction.mp4',
    'angel_case_seduction_2.mp4',
    'angel_case_seduction_3.mp4',
    'angel_case_stalemate.mp4',
    'angel_case_tree_browse.mp4',
    'angel_case_trial_confirm_1.mp4',
    'angel_case_trial_confirm_2.mp4',
    'angel_case_undo_done.mp4',
    'angel_case_undo_done_2.mp4',
    'angel_case_warn_double.mp4',
    'angel_case_warn_fork_2step.mp4',
    'angel_case_warn_fork_2step_2.mp4',
    'angel_case_warn_king_file.mp4',
    'angel_case_warn_mate.mp4',
    'angel_case_warn_pawn_promo.mp4',
    'angel_case_watch_bishop.mp4',
    'angel_default_speaking_default.mp4',
    'angel_escape_point_me.mp4',
    'angel_escape_point_me_2.mp4',
    'angel_escape_point_me_3.mp4',
    'angel_escape_point_you.mp4',
    'angel_escape_point_you_2.mp4',
    'angel_escape_point_you_3.mp4',
    'angel_escape_point_you_5.mp4',
    'angel_escape_point_you_6.mp4',
    'angel_escape_push_button.mp4',
    'angel_escape_push_button_2.mp4',
    'angel_idle_idle_2.mp4',
    'angel_idle_idle_3.mp4',
    'angel_idle_idle_4.mp4',
    'angel_idle_idle_5.mp4',
    'angel_idle_idle_6.mp4',
    'angel_idle_idle_7.mp4',
  ]);

  const LOCKED_AISTUDIO_SLOTS = new Set<string>([
    'default:speaking_default',
    'default:default',
    'mouse_idle:sleep',
    'mouse_idle:wake',
    'special:dog_run',
    'special:dance_stars',
    'idle:idle_2',
    'idle:idle_3',
    'idle:idle_4',
    'idle:idle_5',
    'idle:idle_6',
    'idle:idle_7',
    'idle:idle_8',
    'case:angel_modal_off',
    'case:angel_modal_on',
    'case:ask_promotion',
    'case:ask_promotion_2',
    'case:calc_offer',
    'case:calc_pure',
    'case:calc_showing',
    'case:castled',
    'case:checkmate_win',
    'case:clock_timeout',
    'case:draw',
    'case:hesitate_hint',
    'case:intro',
    'case:level_advanced',
    'case:level_beginner',
    'case:level_grandmaster',
    'case:level_intermediate',
    'case:level_master',
    'case:load_game',
    'case:lost_queen',
    'case:new_match',
    'case:opening',
    'case:promotion',
    'case:resign',
    'case:save_game',
    'case:seduction',
    'case:seduction_2',
    'case:seduction_3',
    'case:seduction_4',
    'case:seduction_5',
    'case:seduction_6',
    'case:stalemate',
    'case:thank_jan',
    'case:tree_browse',
    'case:trial_confirm_1',
    'case:trial_confirm_2',
    'case:undo_done',
    'case:undo_done_2',
    'case:warn_double',
    'case:warn_fork_2step',
    'case:warn_fork_2step_2',
    'case:warn_king_file',
    'case:warn_mate',
    'case:warn_pawn_promo',
    'case:watch_bishop',
    'escape:point_me',
    'escape:point_me_2',
    'escape:point_me_3',
    'escape:point_you',
    'escape:point_you_2',
    'escape:point_you_3',
    'escape:point_you_5',
    'escape:point_you_6',
    'escape:push_button',
    'escape:push_button_2',
  ]);

  app.delete('/api/angel-videos/:kind/:key', (req, res) => {
    if (!requireStudioDeveloperAuth(req, res)) return;
    const kind = String(req.params.kind || '');
    const rawKey = String(req.params.key || '');
    const key = kind === 'idle' && rawKey === 'idle_listening' ? 'idle_1' : rawKey;
    if (
      !['idle', 'mouse_idle', 'special', 'default', 'group', 'case', 'escape'].includes(kind) ||
      !isSafeMapKey(key)
    ) {
      res.status(400).json({ error: 'Invalid video slot key.' });
      return;
    }

    const fileName = `angel_${kind}_${key}.mp4`;
    if (LOCKED_AISTUDIO_VIDEOS.has(fileName) || LOCKED_AISTUDIO_SLOTS.has(`${kind}:${key}`)) {
      res.json({ ok: true, locked: true, map: readAngelVideoMap() });
      return;
    }

    const cleanDeletedPath = `/assets/aistudio/${fileName}`;
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
    } else if (kind === 'mouse_idle') {
      if (key === 'wake') {
        delete map.mouseIdleWake;
      } else {
        delete map.mouseIdle;
        if (map.mouseIdleHoldSec) {
          delete map.mouseIdleHoldSec[cleanDeletedPath];
        }
      }
    } else if (kind === 'special') {
      if (key === 'dog_run') {
        delete map.dogRunVideo;
      } else if (key === 'dance_stars') {
        delete map.danceStarsVideo;
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
  const resolvePublicOrDistFile = (fileName: string): string => {
    const pubPath = path.resolve(__dirname, 'public', fileName);
    return fs.existsSync(pubPath) ? pubPath : path.resolve(__dirname, 'dist', fileName);
  };
  const thinkingTreeJpgPath = resolvePublicOrDistFile('chess_angel_thinking_tree_top_view.jpg');
  const thinkingTreeMp4Path = resolvePublicOrDistFile('chess_angel_midgame_tree_animation.mp4');
  const thinkingTreeGifPath = resolvePublicOrDistFile('chess_angel_midgame_tree_animation.gif');

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

  app.get(['/api/udo-dog-video.mp4', '/chess_angel_udo_magic.mp4'], (_req, res) => {
    const udoVideoAbs = path.join(aistudioAssetsDir, 'builtin_dog_run.mp4');
    if (!fs.existsSync(udoVideoAbs)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="chess_angel_udo_magic.mp4"',
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(udoVideoAbs);
  });

  app.post('/api/studio-internal/omni-clip', express.json({ limit: '256kb' }), async (req, res) => {
    const remoteIp = String(req.socket.remoteAddress || '');
    const isLoopback =
      remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
    if (IS_PROD || !isLoopback) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    try {
      const body = (req.body || {}) as {
        images?: string[];
        prompt?: string;
        duration?: string;
        aspectRatio?: '9:16' | '16:9';
        resolution?: '360p' | '720p' | '1080p' | '4k';
        outName?: string;
      };
      const relImages = Array.isArray(body.images) ? body.images : [];
      const prompt = String(body.prompt || '').trim();
      const duration = String(body.duration || '5s');
      const aspectRatio: '9:16' | '16:9' = body.aspectRatio === '16:9' ? '16:9' : '9:16';
      const resolution: '360p' | '720p' | '1080p' | '4k' =
        body.resolution === '360p' ||
        body.resolution === '1080p' ||
        body.resolution === '4k'
          ? body.resolution
          : '720p';
      const outName = String(body.outName || 'omni_out.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');

      if (!prompt || relImages.length === 0 || relImages.length > 6) {
        res.status(400).json({ error: 'Provide 1..6 workspace image paths and a non-empty prompt.' });
        return;
      }

      const workRoot = path.resolve(__dirname);
      const inputParts: Array<
        | { type: 'image'; mime_type: string; data: string }
        | { type: 'text'; text: string }
      > = [];

      for (const rel of relImages) {
        const absImg = path.resolve(workRoot, rel);
        if (!absImg.startsWith(workRoot + path.sep) || !fs.existsSync(absImg)) {
          res.status(400).json({ error: `Image not found: ${rel}` });
          return;
        }
        const ext = path.extname(absImg).toLowerCase();
        const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        const data = fs.readFileSync(absImg).toString('base64');
        inputParts.push({ type: 'image', mime_type: mimeType, data });
      }
      inputParts.push({ type: 'text', text: prompt });

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: inputParts,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
            resolution,
          },
        },
        { timeout: 300000 },
      );

      let videoBase64: string | undefined = interaction.output_video?.data ?? undefined;
      let videoUri: string | undefined = interaction.output_video?.uri ?? undefined;

      if (!videoBase64 && !videoUri && Array.isArray(interaction.steps)) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            for (const part of step.content) {
              if (part.type === 'video') {
                if (part.data) videoBase64 = part.data;
                if (part.uri) videoUri = part.uri;
              }
            }
          }
        }
      }

      let videoBuf: Buffer | null = null;
      if (videoBase64) {
        videoBuf = Buffer.from(videoBase64, 'base64');
      } else if (videoUri) {
        const dlRes = await fetch(videoUri, {
          headers: {
            'x-goog-api-key': apiKey,
            'User-Agent': 'aistudio-build',
          },
        });
        if (!dlRes.ok) {
          throw new Error(`Failed downloading video URI (${dlRes.status})`);
        }
        videoBuf = Buffer.from(await dlRes.arrayBuffer());
      }

      if (!videoBuf || videoBuf.length < 1024) {
        res.status(502).json({
          error: 'No video bytes returned by gemini-omni-1.2-flash.',
          outputText: interaction.output_text ?? null,
        });
        return;
      }

      const outDir = path.resolve(workRoot, 'src', 'assets', 'udo_work');
      fs.mkdirSync(outDir, { recursive: true });
      const outAbs = path.join(outDir, outName);
      fs.writeFileSync(outAbs, videoBuf);

      res.json({
        ok: true,
        outFile: `src/assets/udo_work/${outName}`,
        bytes: videoBuf.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post(
    '/api/music-track/:trackKey',
    express.raw({ type: '*/*', limit: '60mb' }),
    (req, res) => {
      if (IS_PROD) {
        res.status(403).json({ error: 'Music track replacement is only enabled in development.' });
        return;
      }
      const trackKey = String(req.params.trackKey || '').toLowerCase();
      if (
        trackKey !== 'chess_angel_theme' &&
        trackKey !== 'chess_angel_rap' &&
        trackKey !== 'queen_infinite_reign' &&
        trackKey !== 'meditational'
      ) {
        res.status(400).json({ error: 'Invalid music track slot.' });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 1024) {
        res.status(400).json({ error: 'Empty or invalid audio file.' });
        return;
      }

      const targetFileName =
        trackKey === 'chess_angel_theme'
          ? 'Chess_Angle_2f568dfd.mp3'
          : trackKey === 'chess_angel_rap'
            ? 'Chess_Angel_Rap_d8f30f60.mp3'
            : trackKey === 'meditational'
              ? 'meditational.mp3'
              : 'Chess_Angle__a_beautiful_queen_and_her_infinite_re_8a3d493b.mp3';

      const tmpIn = path.join(os.tmpdir(), `music_in_${process.pid}_${Date.now()}.bin`);
      const tmpOut = path.join(os.tmpdir(), `music_out_${process.pid}_${Date.now()}.mp3`);
      try {
        fs.writeFileSync(tmpIn, body);
        fs.mkdirSync(aistudioAssetsDir, { recursive: true });
        // If already a valid MP3, preserve lossless stream; otherwise transcode cleanly at 192k stereo
        const codecOut = execFileSync(
          'ffprobe',
          ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', tmpIn],
          { encoding: 'utf8', timeout: 8000 },
        )
          .trim()
          .toLowerCase();
        const dstAbs = path.join(aistudioAssetsDir, targetFileName);
        if (codecOut === 'mp3') {
          fs.copyFileSync(tmpIn, dstAbs);
        } else {
          execFileSync(
            'ffmpeg',
            ['-y', '-loglevel', 'error', '-i', tmpIn, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', tmpOut],
            { timeout: 30000 },
          );
          fs.copyFileSync(tmpOut, dstAbs);
        }
        const map = readAngelVideoMap();
        writeAngelVideoMap(map);
        const freshUrl = `/assets/aistudio/${targetFileName}?v=${Date.now()}`;
        res.json({ ok: true, trackKey, url: freshUrl, map });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Failed to save music track: ${message}` });
      } finally {
        try {
          if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        } catch {
          // ignore
        }
      }
    },
  );

  // Application copy protection: reject archive and installer download endpoints
  app.all(['/api/download-game', '/api/download-bat'], (_req, res) => {
    res.status(403).json({
      error: 'Protected application: downloading or copying this game is disabled.',
    });
  });

  const server = http.createServer(app);

  // Attach WebSocket server on dedicated /ws endpoint via explicit upgrade routing
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const viteHmrWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  viteHmrWss.on('connection', (ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected' }));
    }
  });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    const proto = String(request.headers['sec-websocket-protocol'] || '');
    if (pathname === '/ws') {
      if (clients.size >= MAX_WS_CLIENTS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      // Guard against Cross-Site WebSocket Hijacking by validating Origin when present
      const originHeader = request.headers.origin;
      if (typeof originHeader === 'string' && originHeader.length > 0) {
        try {
          const originHost = new URL(originHeader).host.toLowerCase();
          const forwardedHost = String(request.headers['x-forwarded-host'] || '')
            .split(',')[0]
            .trim()
            .toLowerCase();
          const directHost = String(request.headers.host || '').trim().toLowerCase();
          if (
            !originHost ||
            (forwardedHost && originHost !== forwardedHost && originHost !== directHost) ||
            (!forwardedHost && directHost && originHost !== directHost)
          ) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }
        } catch {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
      }

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
    const tempId = `p_${crypto.randomBytes(16).toString('hex')}`;
    clients.set(ws, {
      ws,
      clientId: tempId,
      name: 'Player',
      roomId: null,
      msgWindowStart: Date.now(),
      msgCount: 0,
    });

    broadcastLobbyUpdates();

    ws.on('message', (data) => {
      const client = clients.get(ws);
      if (!client) return;
      const now = Date.now();
      if (now - client.msgWindowStart > WS_RATE_WINDOW_MS) {
        client.msgWindowStart = now;
        client.msgCount = 0;
      }
      client.msgCount += 1;
      if (client.msgCount > WS_RATE_MAX_MSGS) {
        send(ws, { type: 'room:error', message: 'Too many requests. Please slow down.' });
        return;
      }
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
    app.use(
      express.static(distDir, {
        maxAge: 0,
        setHeaders: (res, filePath) => {
          const lower = filePath.replace(/\\/g, '/').toLowerCase();
          if (
            lower.endsWith('/index.html') ||
            lower.endsWith('/sw.js') ||
            lower.endsWith('/registersw.js') ||
            lower.endsWith('/manifest.webmanifest')
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
          }
        },
      }),
    );
    app.get('*', (req, res) => {
      const p = req.path || '';
      if (
        p.startsWith('/assets/') ||
        p.startsWith('/voices/') ||
        p.startsWith('/api/') ||
        /\.[a-z0-9]{2,6}$/i.test(p)
      ) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
    console.log(`ChessAngel 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
