import { TimeoutParams } from './types';

export const DEFAULT_TIMEOUT = 1000;
export const DEFAULT_MAX_TIMEOUT = 3000;

export const MAX_RETRY_AFTER = 10000;

export const DEFAULT_TIMEOUT_PARAM: TimeoutParams = {
    baseTimeout: DEFAULT_TIMEOUT,
    maxTimeout: DEFAULT_MAX_TIMEOUT,
};

export enum Events {
    Started = 'Event_Started',
    NextIteration = 'Event_NextIteration',
    Completed = 'Event_Completed',
    Failed = 'Event_Failed',
    Terminated = 'Event_Terminated',
    Abort = 'Event_Abort',
}
