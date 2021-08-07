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

export interface TimerParams {
    timeout: number | TimeoutFn;
    onTimeout: Notify;
    action: Action;
}

export interface RetryParams extends TimerParams {
    retryCount: number;
}

export interface RetryUntilParams extends RetryParams {
    globalTimeout: number;
}
