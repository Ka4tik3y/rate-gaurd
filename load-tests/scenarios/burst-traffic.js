import http from "k6/http";
http.setResponseCallback(http.expectedStatuses(200, 429));
export const options = {
  scenarios: {
    burst: {
      executor: "shared-iterations",
      vus: 100,
      iterations: 100,
      maxDuration: "10s",
    },
  },
};
export default function () {
  http.get(
    `${__ENV.BASE_URL || "http://localhost:8080"}${__ENV.TARGET_PATH || "/api/get"}`,
  );
}
