package com.rateguard.policy;

/** Client tier. HIGH_VALUE clients require human approval before a TEMPORARY_BLOCK (spec §22). */
public enum ClientClassification {
  NORMAL,
  HIGH_VALUE
}
