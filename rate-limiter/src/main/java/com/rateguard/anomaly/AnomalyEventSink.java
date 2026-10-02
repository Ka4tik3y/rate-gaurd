package com.rateguard.anomaly;

import java.util.List;

/**
 * Destination for anomaly events produced by the detector. In Phase 2 this records them for
 * inspection; later phases will forward meaningful events to the AI agent. The detector only ever
 * publishes when a threshold is crossed, so this is not a firehose.
 */
public interface AnomalyEventSink {

  /** Publish one anomaly event. Must not throw. */
  void publish(AnomalyEvent event);

  /** Most recent events, newest first, bounded by configuration. */
  List<AnomalyEvent> recent();
}
