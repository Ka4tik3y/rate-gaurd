package com.rateguard.metrics;

/**
 * Raw per-minute counters for a single client, as stored in one Redis hash
 * ({@code metric:req:{clientId}:{minute}}). {@code minute} is epoch-seconds / 60.
 */
public record MinuteBucket(long minute, long requests, long rejected, long errors, long latencyMillisSum) {

  public static MinuteBucket empty(long minute) {
    return new MinuteBucket(minute, 0, 0, 0, 0);
  }
}
