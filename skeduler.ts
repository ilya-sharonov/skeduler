import { TimeoutParams, TimerParams, RetryParams, TimeoutFn } from './types';

export const DEFAULT_TIMEOUT = 1000;
export const DEFAULT_MAX_TIMEOUT = 3000;

export const DEFAULT_TIMEOUT_PARAM: TimeoutParams = {
    baseTimeout: DEFAULT_TIMEOUT,
    maxTimeout: DEFAULT_MAX_TIMEOUT,
};

export const DEFAULT_TIMEOUT_ORIGIN = Symbol.for('DEFAULT_TIMEOUT_ORIGIN');
export const DEFAULT_RETRY_ORIGIN = Symbol.for('DEFAULT_RETRY_ORIGIN');

export enum Sig {
    Terminate = 'SIGNAL_TERMINATE',
    Finished = 'SIGNAL_FINISHED',
    Reschedule = 'SIGNAL_RESCHEDULE',
    Failed = 'SIGNAL_FAILED',
}
export interface Signal<M = number> {
    type: Sig;
    origin: Symbol;
    target: Symbol[];
    metadata?: M;
}

export type SignalHandler = (signal: Signal) => void;

export interface Signals {
    addSignalsListener: (handler: SignalHandler) => void;
    removeSignalsListener: (handler: SignalHandler) => void;
    signal: (signal: Signal) => void;
}

export function initSignals(): Signals {
    const signalHandlers = new Set<SignalHandler>();
    return {
        addSignalsListener(handler) {
            signalHandlers.add(handler);
        },
        removeSignalsListener(handler) {
            signalHandlers.delete(handler);
        },
        signal(sig) {
            signalHandlers.forEach(handler => handler(sig));
        },
    };
}

export function timer(this: Signals, params: TimerParams) {
    const { timeout: tout, origin = DEFAULT_TIMEOUT_ORIGIN, target = [] } = params;
    const timeout = typeof tout === 'function' ? tout() : tout;
    if (typeof timeout !== 'number' || isNaN(timeout)) {
        throw new Error(`Unexpected timeout value: ${timeout}`);
    }
    const signalsListener = (signal: Signal) => {
        if (signal.origin === origin) {
            return;
        }
        if (signal.type === Sig.Terminate && (signal.target.includes(origin) || signal.target.length === 0)) {
            cancelTimeout();
            this.removeSignalsListener(signalsListener);
        }
    };
    this.addSignalsListener(signalsListener);
    const onTimeout = () => {
        this.removeSignalsListener(signalsListener);
        this.signal({
            type: Sig.Finished,
            origin,
            target,
        });
    };
    const cancelTimeoutHandle = setTimeout(onTimeout, timeout);
    function cancelTimeout() {
        clearTimeout(cancelTimeoutHandle);
    }
}

export function retry(this: Signals, params: RetryParams) {
    const { timeout, maxRetries, origin = DEFAULT_RETRY_ORIGIN, target = [] } = params;
    let counter = 0;
    const timeoutOrigin = Symbol();
    const retryTarget = Symbol();
    const startTimeout = () => {
        timer.call(this, {
            timeout,
            origin: timeoutOrigin,
            target: [retryTarget],
        });
    };
    const signalStopTimeout = () => {
        this.signal({
            type: Sig.Terminate,
            origin: retryTarget,
            target: [timeoutOrigin],
        });
    };
    const signalFinished = () => {
        this.signal({
            type: Sig.Finished,
            origin,
            target,
        });
    };
    const removeListener = () => {
        this.removeSignalsListener(signalsListener);
    };
    function runRetry() {
        if (++counter < maxRetries || maxRetries < 0) {
            startTimeout();
        } else {
            signalStopTimeout();
            removeListener();
            signalFinished();
        }
    }
    function signalsListener(signal: Signal) {
        if (signal.origin === retryTarget || signal.origin === origin) {
            return;
        }
        switch (signal.type) {
            case Sig.Finished: {
                if (signal.origin === timeoutOrigin) {
                    runRetry();
                }
            }
            case Sig.Terminate: {
                if (signal.target.includes(origin) || signal.target.length === 0) {
                    signalStopTimeout();
                    removeListener();
                }
            }
            default: {
                return;
            }
        }
    }
    this.addSignalsListener(signalsListener);
    runRetry();
}

export function getTimeout({
    baseTimeout = DEFAULT_TIMEOUT,
    maxTimeout = DEFAULT_MAX_TIMEOUT,
}: TimeoutParams = DEFAULT_TIMEOUT_PARAM): TimeoutFn {
    let iteration = -1;

    function randomBetween(start: number, end: number) {
        return Math.floor(start + Math.random() * (end - start + 1));
    }

    // "Full Jitter" as per https://aws.amazon.com/ru/blogs/architecture/exponential-backoff-and-jitter/
    return function timeout() {
        iteration++;
        const time = randomBetween(0, Math.min(maxTimeout, baseTimeout * 2 ** iteration));
        return time;
    };
}
