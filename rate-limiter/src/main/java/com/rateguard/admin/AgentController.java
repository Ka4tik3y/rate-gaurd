package com.rateguard.admin;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.rateguard.admin.dto.Dtos.AgentActionRequest;
import com.rateguard.admin.dto.Dtos.EvidenceDto;
import com.rateguard.admin.dto.Dtos.GateResponse;
import com.rateguard.policy.ActionEvidence;
import com.rateguard.policy.ActionSource;
import com.rateguard.policy.ProposedAction;
import com.rateguard.policy.PolicyGate;

import reactor.core.publisher.Mono;

/**
 * The agent's only entry point for proposing an action (spec §20, §28). Every request is forced to
 * {@link ActionSource#AGENT} and funnelled through the {@link PolicyGate}; there is no path from here
 * to Redis or to the policy store, so the agent can never bypass the gate or mutate state directly
 * (architectural rules 2 & 4). Secured to the AGENT role.
 */
@RestController
@RequestMapping("/agent")
public class AgentController {

  private final PolicyGate gate;

  public AgentController(PolicyGate gate) {
    this.gate = gate;
  }

  @PostMapping("/actions")
  public Mono<GateResponse> propose(@RequestBody AgentActionRequest req) {
    ProposedAction action = new ProposedAction(
        req.actionType(),
        ActionSource.AGENT,
        req.clientId(),
        req.trigger(),
        req.reason(),
        toEvidence(req.evidence()),
        req.newCapacity(),
        req.newRefillRate(),
        req.blockSeconds(),
        req.alertMessage());
    return gate.evaluate(action).map(AdminController::toResponse);
  }

  private static ActionEvidence toEvidence(EvidenceDto e) {
    if (e == null) {
      return null;
    }
    return new ActionEvidence(e.metric(),
        e.currentValue() != null ? e.currentValue() : 0,
        e.baseline() != null ? e.baseline() : 0,
        e.deviation() != null ? e.deviation() : 0,
        e.severity(), e.window());
  }
}
