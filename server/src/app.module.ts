import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BrandsModule } from "./brands/brands.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TokenStoreModule } from "./token-store/token-store.module.js";
import { UsersModule } from "./users/users.module.js";
import { RolesModule } from "./roles/roles.module.js";
import { UploadModule } from "./upload/upload.module.js";
import { MotorcyclesModule } from "./motorcycles/motorcycles.module.js";
import { SocketModule } from "./socket/index.js";
import { BranchesModule } from "./branches/branches.module.js";
import { SuppliersModule } from "./suppliers/suppliers.module.js";
import { PurchasesModule } from "./purchases/purchases.module.js";
import { TransfersModule } from "./transfers/transfers.module.js";
import { CustomersModule } from "./customers/customers.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { ReservationsModule } from "./reservations/reservations.module.js";
import { POSModule } from "./pos/pos.module.js";
import { InvoicesModule } from "./invoices/invoices.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { RefundsModule } from "./refunds/refunds.module.js";
import { FinancingContractsModule } from "./financing-contracts/financing-contracts.module.js";
import { InstallmentsModule } from "./installments/installments.module.js";
import { LettersModule } from "./letters/letters.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ConfigurationModule } from "./configuration/configuration.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { HealthModule } from "./health/health.module.js";
import { CustomerInquiriesModule } from "./customer-inquiries/customer-inquiries.module.js";
import { CustomerFinancingModule } from "./customer-financing/customer-financing.module.js";
import { InquiriesModule } from "./inquiries/inquiries.module.js";
import { SalesModule } from "./sales/sales.module.js";
import { SalesRequestsModule } from "./sales-requests/sales-requests.module.js";
import { PosReservationsModule } from "./pos-reservations/pos-reservations.module.js";
import { PosInstallmentsModule } from "./pos-installments/pos-installments.module.js";
import { DesktopPermissionsModule } from "./desktop-permissions/desktop-permissions.module.js";
import { AttendanceModule } from "./attendance/attendance.module.js";


@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.LOGIN_RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5),
      },
    ]),
    PrismaModule,
    TokenStoreModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    BrandsModule,
    CategoriesModule,
    UploadModule,
    MotorcyclesModule,
    SocketModule,
    BranchesModule,
    SuppliersModule,
    PurchasesModule,
    TransfersModule,
    CustomersModule,
    OrdersModule,
    ReservationsModule,
    POSModule,
    InvoicesModule,
    PaymentsModule,
    RefundsModule,
    FinancingContractsModule,
    InstallmentsModule,
    LettersModule,
    ReportsModule,
    NotificationsModule,
    ConfigurationModule,
    IntegrationsModule,
    HealthModule,
    CustomerInquiriesModule,
    CustomerFinancingModule,
    InquiriesModule,
    SalesModule,
    SalesRequestsModule,
    PosReservationsModule,
    PosInstallmentsModule,
    DesktopPermissionsModule,
    AttendanceModule,
  ],
  providers: [RequestLoggerMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}
