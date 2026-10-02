package com.rateguard.security;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.userdetails.MapReactiveUserDetailsService;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.server.SecurityWebFilterChain;

/**
 * Separates public traffic from privileged operations (spec §34):
 * <ul>
 *   <li>{@code /api/**} and {@code /actuator/health} — public (normal rate-limited traffic)</li>
 *   <li>{@code /agent/**} — AGENT or ADMIN (the agent's gated proposal endpoint)</li>
 *   <li>{@code /admin/**} — ADMIN only (human administration and kill switch)</li>
 * </ul>
 * HTTP Basic auth with role-based users. CSRF is disabled because these are stateless API calls
 * authenticated per request, not browser form sessions.
 */
@Configuration
@EnableWebFluxSecurity
@EnableConfigurationProperties(AdminSecurityProperties.class)
public class SecurityConfig {

  @Bean
  public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
    return http
        .csrf(ServerHttpSecurity.CsrfSpec::disable)
        .authorizeExchange(exchanges -> exchanges
            .pathMatchers("/actuator/health", "/actuator/health/**", "/actuator/prometheus").permitAll()
            .pathMatchers("/api/**").permitAll()
            .pathMatchers("/agent/**").hasAnyRole("AGENT", "ADMIN")
            .pathMatchers("/admin/**").hasRole("ADMIN")
            .anyExchange().permitAll())
        .httpBasic(Customizer.withDefaults())
        .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
        .build();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public MapReactiveUserDetailsService userDetailsService(AdminSecurityProperties props, PasswordEncoder encoder) {
    UserDetails admin = User.withUsername(props.getAdminUsername())
        .password(encoder.encode(props.getAdminPassword()))
        .roles("ADMIN")
        .build();
    UserDetails agent = User.withUsername(props.getAgentUsername())
        .password(encoder.encode(props.getAgentPassword()))
        .roles("AGENT")
        .build();
    return new MapReactiveUserDetailsService(admin, agent);
  }
}
