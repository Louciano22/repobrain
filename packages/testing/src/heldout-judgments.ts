/** Judgments are intentionally stored apart from fixture source. These are public, not private ground truth. */
export type JudgedCase = {
  id: string;
  repositoryId: string;
  slice: "entrypoint" | "security" | "state" | "operations";
  query: string;
  relevantPaths: string[];
};

export const heldoutJudgments: JudgedCase[] = [
  { id: "web-order-write", repositoryId: "checkout-web.v1", slice: "entrypoint", query: "where is an order saved after checkout", relevantPaths: ["apps/store/app/api/orders/route.ts"] },
  { id: "web-payment-callback", repositoryId: "checkout-web.v1", slice: "security", query: "verify incoming payment notification signature", relevantPaths: ["apps/store/app/api/payments/webhook/route.ts"] },
  { id: "web-tax", repositoryId: "checkout-web.v1", slice: "state", query: "regional sales tax calculation", relevantPaths: ["apps/store/src/pricing/tax.ts"] },
  { id: "web-coupon", repositoryId: "checkout-web.v1", slice: "state", query: "coupon reduces subtotal", relevantPaths: ["apps/store/src/pricing/discount.ts"] },
  { id: "web-stock", repositoryId: "checkout-web.v1", slice: "state", query: "reserve units of stock by sku", relevantPaths: ["apps/store/src/inventory/stock.ts"] },
  { id: "web-session", repositoryId: "checkout-web.v1", slice: "security", query: "reject requests without a login cookie", relevantPaths: ["apps/store/src/security/session.ts"] },
  { id: "worker-ack", repositoryId: "worker-service.v1", slice: "entrypoint", query: "acknowledge a task after execution", relevantPaths: ["services/jobs/src/queue/consumer.ts"] },
  { id: "worker-backoff", repositoryId: "worker-service.v1", slice: "operations", query: "exponential retry delay and dead letter", relevantPaths: ["services/jobs/src/queue/retry.ts"] },
  { id: "worker-publish", repositoryId: "worker-service.v1", slice: "entrypoint", query: "publish a job payload onto the queue", relevantPaths: ["services/jobs/src/queue/publish.ts"] },
  { id: "worker-metrics", repositoryId: "worker-service.v1", slice: "operations", query: "record elapsed time for a job", relevantPaths: ["services/jobs/src/observability/metrics.ts"] },
  { id: "worker-scheduler", repositoryId: "worker-service.v1", slice: "operations", query: "nightly cleanup schedule", relevantPaths: ["services/jobs/src/scheduler/cron.ts"] },
  { id: "worker-checkpoint", repositoryId: "worker-service.v1", slice: "state", query: "save progress cursor for task resume", relevantPaths: ["services/jobs/src/storage/checkpoint.ts"] }
];
