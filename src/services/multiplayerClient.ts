import type {
  BoardSkinId,
  ClientToServerMessage,
  PieceColor,
  PieceType,
  ServerToClientMessage,
  TimeControlId,
} from '../shared/types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface MultiplayerListener {
  onStatus: (status: ConnectionStatus) => void;
  onMessage: (msg: ServerToClientMessage) => void;
}

function createInMemoryClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `st_${hex}`;
  }
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

const MAX_STANDALONE_PROBES = 3;

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listener: MultiplayerListener;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private hasEverConnected = false;
  private standaloneDormant = false;
  private closedManually = false;
  private pendingMessages: ClientToServerMessage[] = [];
  private activeRoomId: string | null = null;
  private playerName = 'Player';
  public readonly clientId: string;

  private readonly handleOnline = (): void => {
    if (this.closedManually || this.standaloneDormant) return;
    if (!this.ws) {
      this.reconnectAttempt = 0;
      this.openSocket();
    }
  };

  private readonly handleOffline = (): void => {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.listener.onStatus('disconnected');
  };

  constructor(listener: MultiplayerListener, initialName: string) {
    this.listener = listener;
    this.playerName = initialName;
    this.clientId = createInMemoryClientId();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  public connect(): void {
    this.closedManually = false;
    this.standaloneDormant = false;
    this.openSocket();
  }

  private wakeIfDormant(): void {
    if (this.standaloneDormant && !this.closedManually) {
      this.standaloneDormant = false;
      this.reconnectAttempt = 0;
      this.openSocket();
    }
  }

  private openSocket(): void {
    if (this.closedManually || this.standaloneDormant) return;
    if (typeof window === 'undefined') return;
    if (
      window.location.protocol === 'file:' ||
      (typeof navigator !== 'undefined' && navigator.onLine === false)
    ) {
      this.listener.onStatus('disconnected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    this.listener.onStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.hasEverConnected = true;
        this.standaloneDormant = false;
        this.reconnectAttempt = 0;
        this.listener.onStatus('connected');
        this.sendRaw({ type: 'client:hello', clientId: this.clientId, name: this.playerName });

        // Rejoin active room on reconnect for authoritative state sync
        if (this.activeRoomId) {
          this.sendRaw({ type: 'room:join', roomId: this.activeRoomId, name: this.playerName });
        }

        // Flush buffered messages
        while (this.pendingMessages.length > 0) {
          const next = this.pendingMessages.shift()!;
          this.sendRaw(next);
        }
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as ServerToClientMessage;
          if (parsed.type === 'room:joined') {
            this.activeRoomId = parsed.room.id;
          }
          this.listener.onMessage(parsed);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.closedManually) {
          this.listener.onStatus('disconnected');
          return;
        }
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose handles reconnection cleanly
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closedManually || this.reconnectTimer !== null) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.listener.onStatus('disconnected');
      return;
    }
    this.reconnectAttempt++;
    // When running as a pure standalone static build without a /ws backend, stop polling silently
    if (!this.hasEverConnected && this.reconnectAttempt >= MAX_STANDALONE_PROBES) {
      this.standaloneDormant = true;
      this.listener.onStatus('disconnected');
      return;
    }
    const delay = Math.min(8000, 600 * Math.pow(1.6, this.reconnectAttempt - 1));
    this.listener.onStatus('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private sendRaw(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      if (this.pendingMessages.length < 10) {
        this.pendingMessages.push(msg);
      }
      this.wakeIfDormant();
    }
  }

  public setPlayerName(name: string): void {
    this.playerName = name.trim() || 'Player';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw({ type: 'client:hello', clientId: this.clientId, name: this.playerName });
    }
  }

  public requestRooms(): void {
    this.sendRaw({ type: 'rooms:list' });
  }

  public createRoom(opts: {
    name: string;
    preferredColor: PieceColor | 'random';
    timeControl: TimeControlId;
    skinId: BoardSkinId;
    isPublic: boolean;
  }): void {
    this.playerName = opts.name;
    this.sendRaw({ type: 'room:create', ...opts });
  }

  public joinRoom(roomId: string, name: string): void {
    this.playerName = name;
    this.activeRoomId = roomId.trim().toUpperCase();
    this.sendRaw({ type: 'room:join', roomId: this.activeRoomId, name });
  }

  public leaveRoom(): void {
    this.activeRoomId = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:leave' } satisfies ClientToServerMessage));
    }
  }

  public joinMatchmaking(name: string, timeControl: TimeControlId, skinId: BoardSkinId): void {
    this.playerName = name;
    this.sendRaw({ type: 'matchmaking:join', name, timeControl, skinId });
  }

  public cancelMatchmaking(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'matchmaking:cancel' } satisfies ClientToServerMessage));
    }
  }

  public sendMove(roomId: string, from: string, to: string, promotion?: PieceType): void {
    this.sendRaw({ type: 'game:move', roomId, from, to, promotion });
  }

  public resign(roomId: string): void {
    this.sendRaw({ type: 'game:resign', roomId });
  }

  public offerDraw(roomId: string): void {
    this.sendRaw({ type: 'game:draw-offer', roomId });
  }

  public respondDraw(roomId: string, accept: boolean): void {
    this.sendRaw({ type: 'game:draw-respond', roomId, accept });
  }

  public voteRematch(roomId: string): void {
    this.sendRaw({ type: 'game:rematch', roomId });
  }

  public updateRoomSkin(roomId: string, skinId: BoardSkinId): void {
    this.sendRaw({ type: 'room:skin', roomId, skinId });
  }

  public disconnect(): void {
    this.closedManually = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
