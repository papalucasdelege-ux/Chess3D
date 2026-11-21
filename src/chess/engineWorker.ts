import { ChessAnalysisEngine } from './engine';
import type { EngineLevel, EngineLine } from '../shared/types';

export type EngineWorkerRequest =
  | {
      type: 'analyze';
      requestId: number;
      fen: string;
      maxDepth: number;
      timeBudgetMs: number;
      multiPv: number;
    }
  | {
      type: 'bot-move';
      requestId: number;
      fen: string;
      level: EngineLevel;
    }
  | {
      type: 'stop';
    };

export type EngineWorkerResponse =
  | {
      type: 'progress';
      requestId: number;
      fen: string;
      depth: number;
      nodes: number;
      timeMs: number;
      lines: EngineLine[];
    }
  | {
      type: 'done';
      requestId: number;
      fen: string;
      depth: number;
      nodes: number;
      timeMs: number;
      lines: EngineLine[];
    }
  | {
      type: 'bot-move';
      requestId: number;
      fen: string;
      bestMoveUci: string | null;
    };

const engine = new ChessAnalysisEngine();
let activeRequestId = 0;

self.onmessage = (event: MessageEvent<EngineWorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'stop') {
    activeRequestId++;
    return;
  }

  if (msg.type === 'analyze') {
    activeRequestId = msg.requestId;
    const currentId = msg.requestId;
    const result = engine.analyze(msg.fen, {
      maxDepth: msg.maxDepth,
      timeBudgetMs: msg.timeBudgetMs,
      multiPv: msg.multiPv,
      shouldStop: () => activeRequestId !== currentId,
      onProgress: (depth, lines, nodes, timeMs) => {
        if (activeRequestId !== currentId) return;
        const response: EngineWorkerResponse = {
          type: 'progress',
          requestId: currentId,
          fen: msg.fen,
          depth,
          nodes,
          timeMs,
          lines,
        };
        self.postMessage(response);
      },
    });

    if (activeRequestId === currentId) {
      const doneMsg: EngineWorkerResponse = {
        type: 'done',
        requestId: currentId,
        fen: msg.fen,
        depth: result.depth,
        nodes: result.nodes,
        timeMs: result.timeMs,
        lines: result.lines,
      };
      self.postMessage(doneMsg);
    }
    return;
  }

  if (msg.type === 'bot-move') {
    const bestMoveUci = engine.pickBotMove(msg.fen, msg.level);
    const resp: EngineWorkerResponse = {
      type: 'bot-move',
      requestId: msg.requestId,
      fen: msg.fen,
      bestMoveUci,
    };
    self.postMessage(resp);
  }
};
