import { TimeoutParams, TimerParams, RetryParams, TimeoutFn } from './types';

export const DEFAULT_TIMEOUT = 1000;
export const DEFAULT_MAX_TIMEOUT = 3000;

export const DEFAULT_TIMEOUT_PARAM: TimeoutParams = {
    baseTimeout: DEFAULT_TIMEOUT,
    maxTimeout: DEFAULT_MAX_TIMEOUT,
};

export const DEFAULT_SIGNALS: Signals = {
    completed() {},
    failed() {},
    terminated() {},
    cancel() {},
    status() {
        return {};
    },
    next() {},
};

export interface Signals<C = any, F = any, T = any, S = any> {
    completed: (payload?: C) => void; // process finished successfully -> time elapsed, action completed etc.
    failed: (payload?: F) => void; // process failed to perform its operation but can be restarted.
    terminated: (payload?: T) => void; // process was terminated and must not be restarted with the same params due to constanrt failure.
    cancel: () => void; // cancel process
    status: () => S; // get current process status
    next: () => void; // next iteration
}

export function createSignals<C = any, F = any, T = any>(signals: Partial<Signals<C, F, T>> = {}): Signals<C, F, T> {
    return {
        ...DEFAULT_SIGNALS,
        ...signals,
    };
}

export function timer(this: Signals, params: TimerParams) {
    const { timeout: tout } = params;
    const timeout = typeof tout === 'function' ? tout() : tout;
    if (typeof timeout !== 'number' || isNaN(timeout)) {
        throw new Error(`Unexpected timeout value: ${timeout}`);
    }
    const onTimeout = () => {
        this.completed();
    };
    const cancelTimeoutHandle = setTimeout(onTimeout, timeout);
    function cancelTimeout() {
        clearTimeout(cancelTimeoutHandle);
    }
    return createSignals({
        cancel: cancelTimeout,
    });
}

export function retry(this: Signals, params: RetryParams) {
    const { maxRetries } = params;
    let counter = 0;
    let timeoutHandle = createSignals();
    const context = {
        completed: () => {
            runRetry();
        },
    };
    const startTimeout = () => {
        timeoutHandle = timer.call(createSignals(context), params);
    };
    const stopTimeout = () => {
        timeoutHandle.cancel();
    };
    const signalCompleted = () => {
        this.completed();
    };
    const signalNext = () => {
        console.log('Run next', this);
        this.next();
    };
    function runRetry() {
        if (++counter <= maxRetries || maxRetries < 0) {
            startTimeout();
            if (counter > 1) {
                signalNext();
            }
        } else {
            stopTimeout();
            signalCompleted();
        }
    }
    runRetry();
    return createSignals({
        cancel: stopTimeout,
    });
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
