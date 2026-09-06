process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-secret";
process.env.LOGIN_RATE_LIMIT_MAX = "100";
process.env.USER_CREATE_RATE_LIMIT_MAX = "100";
delete process.env.REDIS_URL;
