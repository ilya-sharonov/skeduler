import { timer, retry, Signals, Signal, Sig, DEFAULT_TIMEOUT } from './skeduler';
import { TimerParams, RetryParams, RetryUntilParams, SignalParams } from './types';

export type GetResponse = () => Promise<Response>;

export const DEFAULT_FETCH_ORIGIN = Symbol.for('DEFAULT_FETCH_ORIGIN');

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

export const RETRY_AFTER = 'Retry-After';
export interface FetchParams extends SignalParams {
    url: string;
    fetchParams: RequestInit;
    responseHandler?: (this: Signals, response: Response) => Response;
    errorHandler?: (this: Signals, error: any) => void;
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
function handleResponse(this: Signals, origin: Symbol, target: Symbol[], response: Response): Response {
    if (response.ok) {
        return response;
    }
    const { status, headers, statusText } = response;
    switch (true) {
        case status === HttpStatus.TooManyRequests: {
            if (headers.has(RETRY_AFTER)) {
                this.signal({
                    type: Sig.Reschedule,
                    origin,
                    target,
                    metadata: getRescheduleTimeout(headers.get(RETRY_AFTER)),
                });
                break;
            }
        }
        case status === HttpStatus.ServiceUnavailable: {
            if (headers.has(RETRY_AFTER)) {
                this.signal({
                    type: Sig.Reschedule,
                    origin,
                    target,
                    metadata: getRescheduleTimeout(headers.get(RETRY_AFTER)),
                });
                break;
            }
        }
        case status >= 400 && status <= 499: {
            this.signal({
                type: Sig.Terminate,
                origin,
                target,
            });
            break;
        }
        case status >= 500 && status <= 599: {
            this.signal({
                type: Sig.Failed,
                origin,
                target,
            });
            throw new Error(`Server reported error ${statusText} with status code: ${status}`);
        }
        default: {
            // noop
        }
    }
    return response;
}

function fetch(this: Signals, params: FetchParams) {
    const { url, fetchParams, origin = DEFAULT_FETCH_ORIGIN, target = [] } = params;
    const abortController = new AbortController();

    function cancelFetch() {
        abortController.abort();
    }

    function signalsListener(signal: Signal) {
        if (signal.origin === origin) {
            return;
        }
        if (signal.type === Sig.Terminate && (signal.target.includes(origin) || signal.target.length === 0)) {
            cancelFetch();
        }
    }
}
