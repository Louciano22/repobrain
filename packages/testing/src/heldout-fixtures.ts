/** Public, frozen evaluation repositories. Do not tune retrieval against these examples. */
export type EvalRepository = {
  id: string;
  files: Record<string, string>;
};

export const heldoutRepositories: EvalRepository[] = [
  {
    id: "checkout-web.v1",
    files: {
      "apps/store/app/api/orders/route.ts": "export async function POST(request: Request) { const order = await reserveInventory(request); return persistOrder(order); }\nfunction reserveInventory(request: Request) { return request; }\nfunction persistOrder(order: Request) { return order; }",
      "apps/store/app/api/payments/webhook/route.ts": "export async function POST(request: Request) { const signature = request.headers.get('payment-signature'); return verifyPaymentEvent(signature); }\nfunction verifyPaymentEvent(signature: string | null) { return signature; }",
      "apps/store/app/checkout/page.tsx": "export default function CheckoutPage() { return 'Review cart and enter shipping address'; }",
      "apps/store/src/pricing/tax.ts": "export function calculateSalesTax(subtotal: number, region: string) { return region === 'CA' ? subtotal * 0.07 : 0; }",
      "apps/store/src/pricing/discount.ts": "export function applyCoupon(subtotal: number, coupon: string) { return coupon === 'WELCOME' ? subtotal * 0.9 : subtotal; }",
      "apps/store/src/security/session.ts": "export function requireSession(cookie: string) { if (!cookie) throw new Error('sign in'); return cookie; }",
      "apps/store/src/inventory/stock.ts": "export function reserveStock(sku: string, units: number) { return { sku, units }; }",
      "apps/store/src/notifications/receipt.ts": "export function emailReceipt(orderId: string) { return `receipt for ${orderId}`; }",
      "apps/store/tests/payment.test.ts": "export const paymentTest = 'check webhook and card payments';",
      "apps/store/dist/payment.js": "export const generatedPayment = 'compiled checkout artifact';",
      "docs/checkout.md": "# Checkout guide\nOrders, taxes, coupons, stock and payment events are documented here."
    }
  },
  {
    id: "worker-service.v1",
    files: {
      "services/jobs/src/queue/consumer.ts": "export async function consumeTask(task: Task) { await executeTask(task); await acknowledgeTask(task); }\ntype Task = { id: string };\nasync function executeTask(task: Task) { return task.id; }\nasync function acknowledgeTask(task: Task) { return task.id; }",
      "services/jobs/src/queue/retry.ts": "export function retryDelay(attempt: number) { return Math.min(60000, 1000 * 2 ** attempt); }\nexport function deadLetter(taskId: string) { return taskId; }",
      "services/jobs/src/queue/publish.ts": "export function enqueueTask(name: string, payload: unknown) { return { name, payload }; }",
      "services/jobs/src/observability/metrics.ts": "export function recordLatency(job: string, elapsedMs: number) { return { job, elapsedMs }; }",
      "services/jobs/src/observability/tracing.ts": "export function startSpan(traceId: string) { return traceId; }",
      "services/jobs/src/auth/service-token.ts": "export function validateServiceToken(header: string) { if (!header.startsWith('Bearer ')) throw new Error('unauthorized'); }",
      "services/jobs/src/scheduler/cron.ts": "export function scheduleNightlyCleanup() { return '02:00'; }",
      "services/jobs/src/storage/checkpoint.ts": "export function saveCheckpoint(taskId: string, cursor: number) { return { taskId, cursor }; }",
      "services/jobs/tests/retry.test.ts": "export const retryTest = 'dead letter task after failed retries';",
      "services/jobs/dist/retry.js": "export const generatedRetry = 'compiled retry artifact';",
      "docs/operations.md": "# Worker operations\nRetry, dead letter, cron, traces, checkpoints and queue handling."
    }
  }
];
