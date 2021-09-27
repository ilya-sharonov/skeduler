import { DEFAULT_MAX_TIMEOUT, DEFAULT_TIMEOUT, DEFAULT_TIMEOUT_PARAM, Events } from './constants';
import { TimeoutParams, TimerParams, RetryParams, TimeoutFn, Executor } from './types';

export function timer(this: Executor, params: TimerParams) {
    const { timeout: tout, id: timerId } = params;
    const timeout = typeof tout === 'function' ? tout() : tout;
    if (typeof timeout !== 'number' || isNaN(timeout)) {
        throw new Error(`Unexpected timeout value: ${timeout}`);
    }

    this.on(Events.Abort, abort);

    const unsubscribe = () => {
        this.off(Events.Abort, abort);
    };

    const onTimeout = () => {
        this.emit(Events.Completed, timerId);
        unsubscribe();
    };

    const cancelTimeoutHandle = setTimeout(onTimeout, timeout);
    function cancelTimeout() {
        clearTimeout(cancelTimeoutHandle);
    }

    function abort(id: string) {
        if (id === timerId) {
            cancelTimeout();
            unsubscribe();
        }
    }
}

export function retry(this: Executor, params: RetryParams) {
    const { maxRetries, id: retryId } = params;
    let counter = 0;
    // derived ids must be restricted to inner functions use to prevent collisions
    const timerId = `${retryId}:timer`;

    function onTimerCompleted(id: string) {
        if (id === timerId) {
            runRetry();
        }
    }

    this.on(Events.Completed, onTimerCompleted);
    this.on(Events.Abort, abortRetry);

    const unsubscribe = () => {
        this.off(Events.Completed, onTimerCompleted);
        this.off(Events.Abort, abortRetry);
    };

    const startTimeout = () => {
        timer.call(this, { ...params, id: timerId });
    };
    const stopTimeout = () => {
        this.emit(Events.Abort, timerId);
    };

    const signalCompleted = () => {
        this.emit(Events.Completed, retryId);
    };
    const signalNextIteration = () => {
        this.emit(Events.NextIteration, retryId);
    };
    const signalStarted = () => {
        this.emit(Events.Started, retryId);
    };

    function abortRetry() {
        stopTimeout();
        unsubscribe();
    }

    function runRetry() {
        if (++counter <= maxRetries || maxRetries < 0) {
            startTimeout();
            if (counter === 1) {
                signalStarted();
            } else {
                signalNextIteration();
            }
        } else {
            signalCompleted();
            abortRetry();
        }
    }
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
