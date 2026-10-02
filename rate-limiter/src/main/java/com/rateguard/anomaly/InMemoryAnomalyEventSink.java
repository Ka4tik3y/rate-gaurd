package com.rateguard.anomaly;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Default sink: keeps the most recent events in a bounded in-memory buffer and emits a structured
 * log line for each. Deliberately storage-light — anomaly events are summaries, not a per-request
 * log. A durable/queue-backed sink can replace this in a later phase without touching the detector.
 */
@Component
public class InMemoryAnomalyEventSink implements AnomalyEventSink {

  private static final Logger log = LoggerFactory.getLogger(InMemoryAnomalyEventSink.class);

  private final int capacity;
  private final Deque<AnomalyEvent> events = new ConcurrentLinkedDeque<>();
  private final AtomicInteger size = new AtomicInteger();

  public InMemoryAnomalyEventSink(AnomalyProperties properties) {
    this.capacity = Math.max(1, properties.getRecentEventsCapacity());
  }

  @Override
  public void publish(AnomalyEvent event) {
    if (event == null) {
      return;
    }
    log.warn("anomaly detected client={} metric={} severity={} window={} current={} baseline={} reason=\"{}\"",
        event.clientId(), event.metric(), event.severity(), event.window(),
        event.currentValue(), event.baseline(), event.reason());
    events.addFirst(event);
    if (size.incrementAndGet() > capacity) {
      events.pollLast();
      size.decrementAndGet();
    }
  }

  @Override
  public List<AnomalyEvent> recent() {
    return Collections.unmodifiableList(new ArrayList<>(events));
  }
}
