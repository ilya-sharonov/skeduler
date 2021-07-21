import { fetchRetry } from './fetch';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import { RetryParams } from './types';

if (!globalThis.fetch) {
    //@ts-ignore
    globalThis.fetch = fetch;
}
if (!globalThis.AbortController) {
    //@ts-ignore
    globalThis.AbortController = AbortController;
}

console.time('Start');
const url = 'http://www.google.com';
const fetchParams = {};
const retryParams: RetryParams = {
    retryCount: 3,
    timeout: 500,
    onTimeout: () => {
        console.timeEnd('Start');
        console.log('Timeout');
    },
};

fetchRetry(url, fetchParams, retryParams)
    .then(result => {
        console.log('Got result');
    })
    .catch(error => {
        console.log('Got error', error);
    });
