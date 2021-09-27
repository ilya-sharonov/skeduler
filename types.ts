import EventEmitter from 'events';

export interface TimeoutParams {
    baseTimeout: number;
    maxTimeout: number;
}

export type TimeoutFn = () => number;

export type Cancel = () => void;
export type Action = () => Cancel;
export type Notify = (cancelTimer?: Cancel) => void;
export type Remove = () => void;
export type AddTimer = (cancelTimer: Cancel) => Cancel;

export interface LifecycleParams {
    id?: string | Symbol;
    namespace?: string;
}

export interface TimerParams extends LifecycleParams {
    timeout: number | TimeoutFn;
}

export interface RetryParams extends TimerParams {
    maxRetries: number;
    maxTimeout?: number;
}

export interface Executor {
    completed: (data: any) => void;
    failed: (reason: any) => void;
    onCancel: (cb: () => void) => () => void;
    reset: (data: any) => void;
}
