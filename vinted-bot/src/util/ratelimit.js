/** Simple token bucket, awaited before every outbound request. */
export class TokenBucket {
  constructor(ratePerSec, burst = Math.max(1, Math.ceil(ratePerSec))) {
    this.rate = ratePerSec;
    this.capacity = burst;
    this.tokens = burst;
    this.last = Date.now();
  }

  async take(n = 1) {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.rate);
      this.last = now;
      if (this.tokens >= n) {
        this.tokens -= n;
        return;
      }
      const waitMs = Math.max(20, ((n - this.tokens) / this.rate) * 1000);
      await sleep(waitMs);
    }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (base, pct) => Math.round(base * (1 + ((Math.random() * 2 - 1) * pct) / 100));
