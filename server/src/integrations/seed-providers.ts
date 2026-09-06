// SPEC-014: Seed External Providers

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedProviders() {
  const providers = [
    {
      providerKey: 'mock-payment',
      providerName: 'Mock Payment Provider',
      category: 'payment',
      isEnabled: true,
      supportsWebhooks: true,
    },
    {
      providerKey: 'stripe',
      providerName: 'Stripe',
      category: 'payment',
      isEnabled: false,
      supportsWebhooks: true,
      healthEndpoint: 'https://status.stripe.com/api/v2/status.json',
      documentationUrl: 'https://stripe.com/docs/api',
    },
    {
      providerKey: 'paypal',
      providerName: 'PayPal',
      category: 'payment',
      isEnabled: false,
      supportsWebhooks: true,
      documentationUrl: 'https://developer.paypal.com/docs/api/',
    },
    {
      providerKey: 'sendgrid',
      providerName: 'SendGrid',
      category: 'email',
      isEnabled: false,
      supportsWebhooks: true,
      documentationUrl: 'https://docs.sendgrid.com/',
    },
    {
      providerKey: 'twilio-sms',
      providerName: 'Twilio SMS',
      category: 'sms',
      isEnabled: false,
      supportsWebhooks: true,
      documentationUrl: 'https://www.twilio.com/docs/sms',
    },
    {
      providerKey: 'twilio-whatsapp',
      providerName: 'Twilio WhatsApp',
      category: 'whatsapp',
      isEnabled: false,
      supportsWebhooks: true,
      documentationUrl: 'https://www.twilio.com/docs/whatsapp',
    },
    {
      providerKey: 's3-storage',
      providerName: 'AWS S3 Storage',
      category: 'storage',
      isEnabled: false,
      supportsWebhooks: false,
      documentationUrl: 'https://docs.aws.amazon.com/s3/',
    },
  ];

  for (const provider of providers) {
    await prisma.externalProvider.upsert({
      where: { providerKey: provider.providerKey },
      create: provider as any,
      update: provider as any,
    });
    console.log(`Seeded provider: ${provider.providerName}`);
  }
}

seedProviders()
  .then(() => {
    console.log('Provider seeding completed');
    prisma.$disconnect();
  })
  .catch((error) => {
    console.error('Provider seeding failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
