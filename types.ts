export interface TimeoutParams {
    baseTimeout: number;
    maxTimeout: number;
}

export type TimeoutFn = () => number;

export type Cancel = () => void;
export type Action = (cancelRetries: Cancel) => Cancel;
export type Notify = (cancelTimer?: Cancel) => void;
export type Remove = () => void;
export type AddTimer = (cancelTimer: Cancel) => Cancel;

export interface SignalParams {
    origin?: Symbol;
    target?: Symbol[];
}

export interface TimerParams extends SignalParams {
    timeout: number | TimeoutFn;
}

export interface RetryParams extends TimerParams {
    maxRetries: number;
}

export interface RetryUntilParams extends RetryParams {
    maxTimeout: number;
}
