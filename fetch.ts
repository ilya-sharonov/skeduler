import { timer, retry, Signals, DEFAULT_TIMEOUT, createSignals, getTimeout } from './skeduler';
import { TimerParams, RetryParams, RetryUntilParams } from './types';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';

export type GetResponse = () => Promise<Response>;

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
        return retryAfterSec * 1000;
    }
    const dateAfter = Date.parse(retryAfter);
    if (!Number.isNaN(dateAfter)) {
        const now = Date.now();
        const afterTime = dateAfter - now;
        return afterTime >= 0 ? afterTime : DEFAULT_TIMEOUT;
    }
    return DEFAULT_TIMEOUT;
}

/**
 *
 * @param this
 * @param origin
 * @param target
 * @param response
 * @returns
 */
function handleResponse(this: Signals, response: Response): Response {
    if (response.ok) {
        this.completed(response);
        return response;
    }
    const { status, headers, statusText } = response;
    switch (true) {
        case status === HttpStatus.TooManyRequests: {
            if (headers.has(RETRY_AFTER_HEADER)) {
                this.terminated({
                    retryAfter: getRescheduleTimeout(headers.get(RETRY_AFTER_HEADER)),
                });
                break;
            }
        }
        case status === HttpStatus.ServiceUnavailable: {
            if (headers.has(RETRY_AFTER_HEADER)) {
                this.terminated({
                    retryAfter: getRescheduleTimeout(headers.get(RETRY_AFTER_HEADER)),
                });
                break;
            }
        }
        case status >= 400 && status <= 499: {
            this.terminated();
            break;
        }
        case status >= 500 && status <= 599: {
            this.failed();
            throw new Error(`Server reported error ${statusText} with status code: ${status}`);
        }
        default: {
            break;
        }
    }
    return response;
}

function* nextFetch(params: FetchParams) {
    const { url, fetchParams } = params;
    let abortController: AbortController;
    let abort = false;

    function cancelFetch() {
        abortController.abort();
    }

    function produceFetch() {
        abortController = new AbortController();
        return {
            //@ts-ignore
            fetch: fetch(url, { ...fetchParams, signal: abortController.signal }),
            cancelFetch,
        };
    }

    while (!abort) {
        abort = yield produceFetch();
    }

    return produceFetch();
}

function getProxyThis(thisRef: any = {}) {
    let thisObj = thisRef;
    const proxyThis = new Proxy<any>(createSignals(thisRef), {
        get(target: any, prop: string) {
            if (prop in thisObj) {
                return thisObj[prop];
            }
            return target[prop];
        },
    });
    return [
        proxyThis,
        function updateRef(newRef: any) {
            thisObj = newRef;
            console.log('Proxy updated', newRef);
        },
    ];
}

function fetchRetry(params: FetchParams & RetryParams) {
    const fetching = nextFetch(params);
    const [proxyThis, updateProxyThis] = getProxyThis();
    return new Promise((resolve, reject) => {
        const { cancel: cancelRetry } = retry.call(proxyThis, params);
        (function runFetch() {
            console.log('Init fetch...');
            const {
                value: { fetch, cancelFetch },
            } = fetching.next();
            const timerSignals = {
                completed() {
                    cancelFetch();
                    reject('Timeout');
                },
                next() {
                    console.log('next phase');
                    cancelFetch();
                    runFetch();
                },
            };
            updateProxyThis(timerSignals);
            const fetchSignals = {
                completed(response: Response) {
                    cancelRetry();
                    resolve(response);
                },
                terminated(reason: any) {
                    cancelRetry();
                    reject(reason);
                },
                failed() {
                    console.log('Fetch failed');
                },
            };
            //@ts-ignore
            fetch.then(handleResponse.bind(createSignals(fetchSignals))).catch(() => {});
        })();
    });
}

const requestParams = {
    url: 'http://www.boogle.com',
    maxRetries: 3,
    timeout: 2000,
};

fetchRetry(requestParams)
    .then(res => console.log('Response:', res))
    .catch(err => console.log('Error:', err));

// function fetchUntil(params: FetchParams & RetryUntilParams) {
//     const { fetch, cancelFetch } = runFetch(params);
//     const timerSignals = {
//         completed() {
//             cancelFetch();
//         },
//     };
//     const sharedTimerSignals = createSignals(timerSignals);
//     const { cancel: cancelRetry } = retry.call(sharedTimerSignals, params);
//     const { cancel: cancelTimer } = timer.call(sharedTimerSignals, { timeout: params.maxTimeout });
//     const fetchSignals = {
//         completed() {
//             cancelRetry();
//             cancelTimer();
//         },
//         terminated() {},
//         failed() {},
//     };
//     return fetch.then(handleResponse.bind(createSignals(fetchSignals)));
// }
