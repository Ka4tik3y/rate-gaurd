import http from "k6/http";
import { check } from "k6";
http.setResponseCallback(http.expectedStatuses(200, 429));
export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || "30s",
};
export default function () {
  const r = http.get(
    `${__ENV.BASE_URL || "http://localhost:8080"}${__ENV.TARGET_PATH || "/api/get"}`,
  );
  check(r, { status: r.status === 200 || r.status === 429 });
}
