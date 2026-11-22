import { ChessAnalysisEngine } from './engine';
import type { BotSearchReport, EngineLevel, EngineLine, SearchTreeEdge } from '../shared/types';

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
      allSimulations: EngineLine[];
      treeEdges: SearchTreeEdge[];
    }
  | {
      type: 'bot-tree-progress';
      requestId: number;
      fen: string;
      depth: number;
      nodes: number;
      treeEdges: SearchTreeEdge[];
    }
  | {
      type: 'bot-move';
      requestId: number;
      fen: string;
      bestMoveUci: string | null;
      report: BotSearchReport | null;
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
        allSimulations: result.allSimulations,
        treeEdges: result.treeEdges,
      };
      self.postMessage(doneMsg);
    }
    return;
  }

  if (msg.type === 'bot-move') {
    const report = engine.pickBotMoveWithReport(
      msg.fen,
      msg.level,
      (edges, depth, nodes) => {
        const prog: EngineWorkerResponse = {
          type: 'bot-tree-progress',
          requestId: msg.requestId,
          fen: msg.fen,
          depth,
          nodes,
          treeEdges: edges,
        };
        self.postMessage(prog);
      },
    );
    const resp: EngineWorkerResponse = {
      type: 'bot-move',
      requestId: msg.requestId,
      fen: msg.fen,
      bestMoveUci: report?.bestMoveUci ?? null,
      report,
    };
    self.postMessage(resp);
  }
};
