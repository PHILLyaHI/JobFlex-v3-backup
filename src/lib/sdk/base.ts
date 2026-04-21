export class IntegrationDisabledError extends Error {
  constructor(
    public integration: string,
    public envKey: string,
  ) {
    super(`${integration} is not configured — set ${envKey} to enable.`);
    this.name = "IntegrationDisabledError";
  }
}
