import EventEmitter from 'events';
import { Executor } from './types';

export class EmittingExecutor extends EventEmitter implements Executor {
    getNamedEvent(id: string | undefined, event: string) {
        return id ? `${id}:${event}` : event;
    }
}
