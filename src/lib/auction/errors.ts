export class AuctionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export function assertAuction(
  condition: unknown,
  message: string,
  status: number,
  code: string,
): asserts condition {
  if (!condition) throw new AuctionError(message, status, code);
}

