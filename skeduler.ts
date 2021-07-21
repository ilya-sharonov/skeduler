import { TimeoutParams, TimerParams, Cancel, RetryParams, RetryUntilParams, TimeoutFn } from './types';

export const DEFAULT_TIMEOUT = 1000;
export const DEFAULT_MAX_TIMEOUT = 3000;

export const DEFAULT_TIMEOUT_PARAM: TimeoutParams = {
    baseTimeout: DEFAULT_TIMEOUT,
    maxTimeout: DEFAULT_MAX_TIMEOUT,
};

export function timer({ action, timeout, onTimeout, addTimer }: TimerParams): Cancel {
    const timeoutPeriod = typeof timeout === 'function' ? timeout() : timeout;
    if (typeof timeoutPeriod !== 'number' || isNaN(timeoutPeriod)) {
        throw new Error(`Unexpected timeout value: ${timeoutPeriod}`);
    }
    const cancelTimeoutHandle = setTimeout(cancelActionAndNotify, timeoutPeriod);
    function cancelTimer() {
        clearTimeout(cancelTimeoutHandle);
    }
    function cancelTimerAndNotify() {
        cancelTimer();
        onTimeout(cancelTimer);
    }
    const cancelRetries = addTimer(cancelTimerAndNotify);
    const cancelAction = action(cancelRetries);
    function cancelActionAndNotify() {
        cancelAction();
        onTimeout(cancelTimer);
    }
    function cancelTimerAndAction() {
        cancelAction();
        cancelTimer();
        return cancelTimer;
    }
    return cancelTimerAndAction;
}

export function retry(retryParams: RetryParams & TimerParams): Cancel {
    const { retryCount, onTimeout: onRetryTimeout } = retryParams;
    let count = 0;
    let cancelTimer = () => {};
    function runRetry() {
        cancelTimer = timer({ ...retryParams, onTimeout });
    }
    function onTimeout() {
        if (++count < retryCount || retryCount < 0) {
            runRetry();
        } else {
            onRetryTimeout();
        }
    }
    runRetry();
    return function cancelRetry() {
        cancelTimer();
    };
}

export function retryUntil({ globalTimeout, ...retryParams }: RetryUntilParams & TimerParams): Cancel {
    const timers = new Set<Cancel>();

    function cancelTimers() {
        timers.forEach(fn => fn());
        timers.clear();
    }

    function addTimer(cancelTimer: Cancel): Cancel {
        timers.add(cancelTimer);
        return cancelTimers;
    }

    function onTimeout(cancelTimer?: Cancel) {
        if (cancelTimer !== undefined) {
            timers.delete(cancelTimer);
        }
    }

    function onGlobalTimeout(cancelTimer?: Cancel) {
        onTimeout(cancelTimer);
        cancelTimers();
    }

    timer({
        action: () => () => {},
        timeout: globalTimeout,
        onTimeout: onGlobalTimeout,
        addTimer,
    });
    retry({
        ...retryParams,
        onTimeout,
        addTimer,
    });

    return cancelTimers;
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
