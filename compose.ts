import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import { Executor, RetryParams, TimeoutFn, TimeoutParams, TimerParams } from './types';
import { DEFAULT_MAX_TIMEOUT, DEFAULT_TIMEOUT, DEFAULT_TIMEOUT_PARAM, MAX_RETRY_AFTER } from './constants';

/*
    429 + 503 -> Retry-After header (in seconds)
*/
export enum HttpStatus {
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    MethodNotAllowed = 405,
    RequestEntityTooLarge = 413,
    IAmATeapot = 418,
    UnprocessableEntity = 422,
    TooManyRequests = 429,
    InternalServerError = 500,
    NotImplemented = 501,
    BadGateway = 502,
    ServiceUnavailable = 503,
    GatewayTimeout = 504,
    InsufficientStorage = 507,
    LoopDetected = 508,
}

export const RETRY_AFTER_HEADER = 'Retry-After';

export interface FetchParams {
    url: string;
    fetchParams?: RequestInit;
}

function getRescheduleTimeout(retryAfter: string | null): number {
    if (retryAfter === null) {
        return DEFAULT_TIMEOUT;
    }
    let retryAfterSec = Number(retryAfter);
    if (!Number.isNaN(retryAfterSec)) {
        return Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER);
    }
    const dateAfter = Date.parse(retryAfter);
    if (!Number.isNaN(dateAfter)) {
        const now = Date.now();
        const afterTime = dateAfter - now;
        return Math.min(afterTime >= 0 ? afterTime : DEFAULT_TIMEOUT, MAX_RETRY_AFTER);
    }
    return DEFAULT_TIMEOUT;
}

function fetchWithAbort(this: Executor, params: FetchParams): void {
    console.log('Fetch :: constructed');
    const { url, fetchParams } = params;
    const abortController = new AbortController();

    const removeCancel = this.onCancel(() => {
        console.log('Fetch :: abort called');
        abortController.abort();
    });

    console.log('Fetch :: called');
    //@ts-ignore
    fetch(url, { ...fetchParams, signal: abortController.signal })
        .then(result => {
            console.log('Fetch :: completed');
            this.completed(result);
        })
        .catch(error => {
            console.log('Fetch :: failed');
            this.failed(error);
        })
        .finally(() => {
            console.log('Fetch :: finalized');
            removeCancel();
        });
}

function isResetRequired(response: Response): boolean {
    const { status, headers } = response;
    return (
        (status === HttpStatus.TooManyRequests || status === HttpStatus.ServiceUnavailable) &&
        headers.has(RETRY_AFTER_HEADER)
    );
}

function fetchWithResponseHandler(this: Executor, params: FetchParams): void {
    function completed(this: Executor, response: Response) {
        switch (true) {
            case response.ok: {
                this.completed(response);
                break;
            }
            case isResetRequired(response): {
                this.reset({
                    retryAfter: getRescheduleTimeout(response.headers.get(RETRY_AFTER_HEADER)),
                });
                break;
            }
            default: {
                this.failed(response);
            }
        }
    }
    const context = { ...this, completed: completed.bind(this) };
    fetchWithAbort.call(context, params);
}

function timer(this: Executor, params: TimerParams) {
    const { timeout: tout, id } = params;
    const timeout = typeof tout === 'function' ? tout() : tout;
    if (typeof timeout !== 'number' || isNaN(timeout)) {
        throw new Error(`Unexpected timeout value: ${timeout}`);
    }

    const removeCancel = this.onCancel(cancelTimeout);

    const onTimeout = () => {
        removeCancel();
        this.completed({ id });
    };

    const cancelTimeoutHandle = setTimeout(onTimeout, timeout);

    function cancelTimeout() {
        clearTimeout(cancelTimeoutHandle);
    }
}

function getCancelContext() {
    const fns = new Map<string | Symbol, Set<() => void>>();
    const common = Symbol();
    return {
        onCancel: (fn: () => void, type: string | Symbol = common) => {
            // console.log('onCancel', fn, type);
            let bucket = fns.get(type);
            if (!bucket) {
                bucket = new Set<() => void>();
                fns.set(type, bucket);
            }
            bucket.add(fn);
            return function removeCancelCallback() {
                bucket?.delete(fn);
                console.log(`Cancel context :: callback removed, bucket size: ${bucket?.size}`);
            };
        },
        cancel: (clear = true, type: string | Symbol = common) => {
            const bucket = fns.get(type);
            if (!bucket) {
                return;
            }
            bucket.forEach(fn => fn());
            if (clear) {
                bucket.clear();
            }
        },
    };
}

function retry(this: Executor, params: RetryParams) {
    const { maxRetries, id } = params;
    let counter = 0;
    const timerId = Symbol();

    const { onCancel, cancel } = getCancelContext();

    this.onCancel(() => {
        cancel();
    });

    const context = {
        ...this,
        completed: onTimerCompleted,
        onCancel: (fn: () => void) => onCancel(fn),
    };

    function onTimerCompleted() {
        runRetry();
    }

    function startTimer() {
        timer.call(context, { ...params, id: timerId });
    }

    const completed = () => {
        this.completed({ id });
    };

    const nextRetry = (data: any) => {
        this.reset(data);
    };

    function runRetry() {
        if (++counter <= maxRetries || maxRetries < 0) {
            startTimer();
            if (counter > 1) {
                nextRetry({ counter });
            }
        } else {
            completed();
            cancel();
        }
    }
    runRetry();
}

export function refetch(fetchParams: FetchParams, retryParams: RetryParams) {
    return new Promise((resolve, reject) => {
        const { onCancel, cancel } = getCancelContext();
        const timers = Symbol();
        const fetches = Symbol();

        const timersContext = {
            completed: onRetryCompleted,
            reset: onRetryReset,
            onCancel: (fn: () => void) => onCancel(fn, timers),
            failed: () => {},
        };

        function onRetryCompleted() {
            cancelFetch();
            reject(`Unable to fetch: retry limit reached`);
        }

        function onRetryReset(data: any) {
            console.log('retry', data);
            cancelFetch();
            runFetch();
        }

        function cancelTimers() {
            cancel(true, timers);
        }

        function runTimers() {
            retry.call(timersContext, retryParams);
            if (retryParams.maxTimeout) {
                timer.call(timersContext, { timeout: retryParams.maxTimeout });
            }
        }

        const fetchContext = {
            completed: onFetchCompleted,
            reset: onFetchReset,
            onCancel: (fn: () => void) => onCancel(fn, fetches),
            failed: () => {},
        };

        function runFetch() {
            fetchWithResponseHandler.call(fetchContext, fetchParams);
        }

        function cancelFetch() {
            console.log('fetch cancelled');
            cancel(true, fetches);
        }

        function onFetchCompleted(response: Response) {
            cancelTimers();
            resolve(response);
        }

        function onFetchReset(data: any) {
            if (data.retryAfter) {
                cancelTimers();
                setTimeout(() => {
                    runTimers();
                    runFetch();
                }, data.retryAfter);
            }
        }

        (function executeFetch() {
            runTimers();
            runFetch();
        })();
    });
}

function getTimeout({
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

(async function run() {
    const requestParams = {
        url: 'http://localhost:4004',
    };
    const retryParams = {
        maxRetries: 1,
        timeout: getTimeout(),
        // maxTimeout: 5000,
    };
    for (let i = 0; i < 5; i++) {
        try {
            console.log(`Iteration ${i}`);
            const result = await refetch(requestParams, retryParams);
            //@ts-ignore
            const data = await result.json();
            console.log('Response', data);
        } catch (err) {
            console.error('Error', err);
        }
    }
})();
