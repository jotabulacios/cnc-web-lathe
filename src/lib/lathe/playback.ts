import type { CompileResult, CncState } from './contract.ts';

export type Playback = {
  revision: number;
  cursor: number;
  result: CompileResult | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  running: boolean;
  runId: number;
};

export const initialPlayback: Playback = {
  revision: 0,
  cursor: 0,
  result: null,
  status: 'idle',
  error: null,
  running: false,
  runId: 0,
};

export type Action =
  | { type: 'edit' }
  | { type: 'compile'; revision: number }
  | { type: 'result'; result: CompileResult }
  | { type: 'error'; revision: number; message: string }
  | { type: 'step'; delta: 1 | -1 }
  | { type: 'reset' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; revision: number; cursor: number; runId: number };

export function playbackReducer(state: Playback, action: Action): Playback {
  switch (action.type) {
    case 'edit':
      return { ...initialPlayback, revision: state.revision + 1 };

    case 'compile':
      return action.revision === state.revision
        ? { ...state, status: 'loading', result: null, cursor: 0, error: null, running: false }
        : state;

    case 'result':
      return action.result.sourceRevision === state.revision
        ? { ...state, result: action.result, cursor: 0, status: 'ready', error: null, running: false }
        : state;

    case 'error':
      return action.revision === state.revision
        ? { ...state, status: 'error', error: action.message, result: null, cursor: 0, running: false }
        : state;

    case 'step':
      return state.result?.executable && state.status === 'ready'
        ? {
            ...state,
            running: false,
            cursor: Math.min(state.result.blocks.length, Math.max(0, state.cursor + action.delta)),
          }
        : state;

    case 'reset':
      return { ...state, cursor: 0, running: false };

    case 'play': {
      const canPlay =
        !state.running &&
        state.status === 'ready' &&
        Boolean(state.result?.executable) &&
        state.cursor < (state.result?.blocks.length ?? 0);
      return canPlay
        ? { ...state, running: true, runId: state.runId + 1 }
        : state;
    }

    case 'pause':
      return state.running ? { ...state, running: false } : state;

    case 'tick': {
      if (
        !state.running ||
        state.status !== 'ready' ||
        !state.result?.executable ||
        action.runId !== state.runId ||
        action.revision !== state.revision ||
        action.cursor !== state.cursor
      ) {
        return state;
      }
      const totalBlocks = state.result?.blocks.length ?? 0;
      if (state.cursor >= totalBlocks) {
        return { ...state, running: false };
      }
      const nextCursor = state.cursor + 1;
      return {
        ...state,
        cursor: nextCursor,
        running: nextCursor < totalBlocks,
      };
    }
  }
}

export function currentState(playback: Playback): CncState | null {
  const { result, cursor } = playback;
  return result
    ? cursor === 0
      ? result.initialState
      : result.blocks[cursor - 1]?.afterState ?? result.initialState
    : null;
}
