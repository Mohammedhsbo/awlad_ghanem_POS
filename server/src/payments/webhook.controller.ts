import {
  Inject,
  Controller,
  Post,
  Param,
  Body,
  Headers,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { WebhookProcessorService } from "./providers/webhook-processor.service.js";

/**
 * TASK-011: Webhook endpoint for payment providers
 * 
 * This controller handles incoming webhooks from external payment providers.
 * Each provider has its own endpoint for security and isolation.
 * 
 * Endpoints:
 * POST /api/webhooks/payments/:providerId
 */
@Controller("webhooks/payments")
export class WebhookController {
  constructor(
    @Inject(WebhookProcessorService) private readonly webhookProcessor: WebhookProcessorService
  ) {}

  /**
   * Process webhook from payment provider
   * 
   * @param providerId - Provider identifier (e.g., 'stripe', 'paymob')
   * @param req - Raw request with body buffer
   * @param headers - Request headers (for signature verification)
   */
  @Post(":providerId")
  async handleWebhook(
    @Param("providerId") providerId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>
  ) {
    // Get raw body (required for signature verification)
    const rawPayload = req.rawBody || Buffer.from(JSON.stringify(req.body));

    // Extract signature from headers
    // Different providers use different header names:
    // - Stripe: stripe-signature
    // - Paymob: hmac
    // - PayPal: paypal-transmission-sig
    const signature =
      headers["stripe-signature"] ||
      headers["hmac"] ||
      headers["paypal-transmission-sig"] ||
      headers["x-signature"] ||
      "";

    const result = await this.webhookProcessor.processWebhook({
      providerId,
      rawPayload,
      signature,
      headers,
    });

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Manually reconcile payment status
   * For admin use when webhooks fail
   * 
   * POST /api/webhooks/payments/reconcile/:paymentId
   */
  @Post("reconcile/:paymentId")
  async reconcilePayment(
    @Param("paymentId") paymentId: string,
    @Body("userId") userId: string
  ) {
    const result = await this.webhookProcessor.reconcilePaymentStatus({
      paymentId,
      userId,
    });

    return {
      success: true,
      ...result,
    };
  }
}
