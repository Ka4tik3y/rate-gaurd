package com.rateguard.client;
import java.net.InetSocketAddress;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
@Component
public class IpClientIdentifierResolver implements ClientIdentifierResolver {
  @Override public String resolve(ServerWebExchange exchange) {
    String forwarded=exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
    if(forwarded!=null&&!forwarded.isBlank()) return forwarded.split(",")[0].trim();
    InetSocketAddress address=exchange.getRequest().getRemoteAddress(); return address==null?"unknown":address.getAddress().getHostAddress();
  }
}
