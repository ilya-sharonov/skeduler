import { retry, retryUntil } from './skeduler';
import { Action, Cancel, RepeatParams, RetryParams, RetryUntilParams } from './types';

export type GetResponse = () => Promise<Response>;

function createFetchAction(url: string, fetchParams: RequestInit): [Action, GetResponse] {
    const controller = new AbortController();
    const { signal } = controller;
    let notifyOnError = (error: Error) => {};
    let notifyOnResponse = (response: Response) => {};

    function cancelFetch() {
        console.log('Fetch cancelled');
        controller.abort();
    }

    function getResponse() {
        return new Promise<Response>((resolve, reject) => {
            notifyOnError = error => reject(error);
            notifyOnResponse = response => resolve(response);
        });
    }

    function fetchAction(cancelTimers: Cancel): Cancel {
        fetch(url, { ...fetchParams, signal })
            .then(response => {
                cancelTimers();
                notifyOnResponse(response);
            })
            .catch(error => {
                cancelTimers();
                // notifyOnError(error);
            });
        return cancelFetch;
    }

    return [fetchAction, getResponse];
}

export function fetchRetry(url: string, fetchParams: RequestInit, repeatParams: RetryParams) {
    const [action, getResponse] = createFetchAction(url, fetchParams);
    retry({ ...repeatParams, action, addTimer: cancel => () => cancel() });
    return getResponse();
}

export function fetchRetryUntil(url: string, fetchParams: RequestInit, retryUntilParams: RetryUntilParams) {
    const [action, getResponse] = createFetchAction(url, fetchParams);
    retryUntil({ ...retryUntilParams, action, addTimer: cancel => () => cancel() });
    return getResponse();
}
