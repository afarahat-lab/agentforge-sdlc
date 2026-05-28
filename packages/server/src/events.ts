/**
 * In-process event bus for Server-Sent Events.
 *
 * Agents emit events via the queue; the server's queue bridge picks them up
 * and forwards them to this bus. The SSE route subscribes to the bus and
 * streams events to connected dashboard clients.
 *
 * This is a simple in-process pub/sub — sufficient for a single-server
 * deployment. A Redis pub/sub adapter can replace it for multi-server setups.
 */

import type { EventBus, EventSubscriber, LiveEvent, LiveEventType } from './types';
import { createContextLogger } from '@gestalt/core';

const log = createContextLogger({ module: 'event-bus' });

class InProcessEventBus implements EventBus {
  private readonly subscribers = new Set<EventSubscriber>();

  emit(event: LiveEvent): void {
    log.debug({ eventType: event.type, correlationId: event.correlationId }, 'Event emitted');
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (err) {
        log.error({ err }, 'Event subscriber threw');
      }
    }
  }

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

// Singleton bus — shared across the server process
export const eventBus: EventBus & { subscriberCount: number } =
  new InProcessEventBus();

/**
 * Helper — emits a typed live event to connected dashboard clients.
 */
export function emitLiveEvent(
  type: LiveEventType,
  correlationId: string,
  payload: unknown,
): void {
  eventBus.emit({
    type,
    correlationId,
    payload,
    timestamp: new Date().toISOString(),
  });
}
