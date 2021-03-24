function timer({ action, timeout, id, onTimeout }) {
    const self = this;
    const timeoutPeriod = typeof timeout === 'number' ? timeout : timeout();
    const cancelTimeoutHandle = setTimeout(cancelActionAndNotify, timeoutPeriod);
    function cancelRetries() {
        cancelTimer();
        self.disposeTimers();
    }
    const cancelAction = action(cancelRetries, id) ?? (() => {});
    function cancelActionAndNotify() {
        cancelAction();
        onTimeout(id);
        self.removeTimer(cancelTimer);
    }
    function cancelTimer() {
        clearTimeout(cancelTimeoutHandle);
        self.removeTimer(cancelTimer);
    }
    this.addTimer(cancelTimer);
    function cancelTimerAndAction() {
        cancelAction();
        cancelTimer();
    }
    return cancelTimerAndAction;
}

function retry({ action, retryTimes, timeout, id: retryId, onTimeout: onRetryTimeout }) {
    let id = 1;
    let cancelTimer = () => {};
    const runRetry = () => {
        cancelTimer = timer.call(this, { action, timeout, id, onTimeout });
    };
    function onTimeout() {
        id++;
        if (id <= retryTimes) {
            runRetry();
        } else {
            onRetryTimeout(retryId);
        }
    }
    runRetry();
    return function cancelRetry() {
        cancelTimer();
    };
}

function retryUntil({ action, retryTimes, timeout, globalTimeout }) {
    const globalTimeoutId = 'global';
    const retryTimeoutId = 'retry';
    const cancelAction = () => () => {};
    const cancelGlobalTimer = timer.call(this, {
        action: cancelAction,
        timeout: globalTimeout,
        id: globalTimeoutId,
        onTimeout,
    });
    const cancelRetryTimer = retry.call(this, { action, retryTimes, timeout, id: retryTimeoutId, onTimeout });
    function onTimeout(id) {
        if (id === globalTimeoutId) {
            cancelRetryTimer();
        } else {
            cancelGlobalTimer();
        }
    }
    function clearRetryUntil() {
        cancelGlobalTimer();
        cancelRetryTimer();
    }
    return clearRetryUntil;
}

function getTimeout({ baseTimeout = 1000, maxTimeout = 3000 } = {}) {
    let iteration = -1;

    function randomBetween(start, end) {
        return Math.floor(start + Math.random() * (end - start + 1));
    }

    // "Full Jitter" as per https://aws.amazon.com/ru/blogs/architecture/exponential-backoff-and-jitter/
    return function timeout() {
        iteration++;
        const time = randomBetween(0, Math.min(maxTimeout, baseTimeout * 2 ** iteration));
        console.log(`Next timeout: ${time}`);
        return time;
    };
}

const baseTimeout = 300;
const maxTimeout = 500;
const globalTimeout = 500;

function getAction() {
    let actionCounter = 0;
    return function action(cancel, id) {
        actionCounter++;
        console.log(`ACTION::Action ${actionCounter} with id [${id}] performing...`);
        const timeoutHandle = setTimeout(() => {
            console.log(`ACTION::Action ${actionCounter} with id [${id}] finished!`);
            cancel();
        }, 400);
        console.time(`Action timer ${id}`);
        return function cancelAction() {
            console.log(`ACTION::Action with id [${id}] cancelled.`);
            clearTimeout(timeoutHandle);
            console.timeEnd(`Action timer ${id}`);
        };
    };
}

const action = getAction();
const timeout = getTimeout({ baseTimeout, maxTimeout });

retryUntil.call(
    {
        timers: new Set(),
        addTimer(fn) {
            this.timers.add(fn);
        },
        removeTimer(fn) {
            this.timers.delete(fn);
        },
        disposeTimers() {
            this.timers.forEach(fn => fn());
        },
        clearTimers() {
            this.timers.clear();
        },
    },
    {
        action,
        retryTimes: 5,
        timeout,
        globalTimeout,
    },
);
