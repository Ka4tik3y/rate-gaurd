package com.rateguard.client;
import org.springframework.web.server.ServerWebExchange;
public interface ClientIdentifierResolver { String resolve(ServerWebExchange exchange); }
