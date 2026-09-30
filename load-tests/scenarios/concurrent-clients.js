import http from "k6/http";
http.setResponseCallback(http.expectedStatuses(200, 429));
export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || "30s",
};
export default function () {
  http.get(
    `${__ENV.BASE_URL || "http://localhost:8080"}${__ENV.TARGET_PATH || "/api/get"}`,
    { headers: { "X-Forwarded-For": `10.0.0.${__VU}` } },
  );
}
