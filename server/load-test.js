import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
   stages: [
    { duration: '1m', target: 300  },  // warm-up
    { duration: '2m', target: 300  },  // baseline hold
    { duration: '1m', target: 750  },  // ramp
    { duration: '2m', target: 750  },  // hold
    { duration: '1m', target: 1000 },  // ramp
    { duration: '1m', target: 0    },  // graceful ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const params = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  };

  const res = http.get('http://localhost:3000/', params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}