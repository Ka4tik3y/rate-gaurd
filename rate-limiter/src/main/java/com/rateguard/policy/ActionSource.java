package com.rateguard.policy;

/**
 * Who originated an action. The kill switch and the automatic-change guardrails apply to
 * {@link #AGENT} actions; {@link #ADMIN} represents a human operator acting through the admin API.
 */
public enum ActionSource {
  AGENT,
  ADMIN
}
