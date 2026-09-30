import http from 'k6/http';
import { Counter } from 'k6/metrics';
http.setResponseCallback(http.expectedStatuses(200, 429));

const allowed = new Counter('rate_limit_allowed');
const rejected = new Counter('rate_limit_rejected');
export const options = { scenarios: { contention: { executor: 'shared-iterations', vus: 100, iterations: 100, maxDuration: '10s' } } };
export default function () {
  const response = http.get(`${__ENV.BASE_URL || 'http://localhost:8080'}${__ENV.TARGET_PATH || '/api/get'}`, { headers: { 'X-Forwarded-For': '198.51.100.8' } });
  if (response.status === 429) rejected.add(1); else allowed.add(1);
}
