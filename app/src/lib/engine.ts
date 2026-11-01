/**
 * Stockfish 19 (lite, single-threaded WASM) running in a Web Worker.
 * Files live in public/engine/ and are precached for offline use.
 */
export interface EngineResult {
  /** Score from WHITE's point of view, in centipawns. Mates are mapped to ±(10000 − ply distance). */
  cp: number;
  mate?: number; // from white's point of view: >0 white mates, <0 black mates
  bestUci?: string;
}

export class Engine {
  private worker: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('engine/stockfish-19-lite-single.js', document.baseURI));
    this.ready = this.until('uciok', 'uci').then(() => this.until('readyok', 'isready')).then(() => undefined);
  }

  private until(token: string, command: string, onLine?: (line: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent) => {
        const line = String(e.data);
        onLine?.(line);
        if (line.startsWith(token)) {
          this.worker.removeEventListener('message', onMessage);
          resolve();
        }
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', () => reject(new Error('engine failed to load')), { once: true });
      this.worker.postMessage(command);
    });
  }

  /** Evaluate one position. Calls are serialised. */
  evaluate(fen: string, depth = 12): Promise<EngineResult> {
    const run = async (): Promise<EngineResult> => {
      await this.ready;
      const whiteToMove = fen.split(' ')[1] === 'w';
      let cp = 0;
      let mate: number | undefined;
      let best: string | undefined;
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`position fen ${fen}`);
      await this.until('bestmove', `go depth ${depth}`, (line) => {
        if (line.startsWith('info') && line.includes(' score ')) {
          const m = line.match(/score (cp|mate) (-?\d+)/);
          if (m) {
            const v = Number(m[2]);
            if (m[1] === 'cp') { cp = v; mate = undefined; } else { mate = v; cp = v > 0 ? 10000 - v : -10000 - v; }
          }
        }
        if (line.startsWith('bestmove')) {
          const b = line.split(' ')[1];
          best = b && b !== '(none)' ? b : undefined;
        }
      });
      // UCI scores are from the side to move; convert to white's view.
      const sign = whiteToMove ? 1 : -1;
      return { cp: cp * sign, mate: mate === undefined ? undefined : mate * sign, bestUci: best };
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  terminate() {
    this.worker.terminate();
  }
}
