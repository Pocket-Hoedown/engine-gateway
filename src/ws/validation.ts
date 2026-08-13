import { FailureCode } from "./protocol.ts";

export class WireAdapterError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = "WireAdapterError";
  }
}

export function invalid(message: string): never {
  throw new WireAdapterError(FailureCode.INVALID_ARGUMENT, message);
}

export function requireUint32(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    invalid(`${field} must be a uint32`);
  }
  return value;
}

export function requireSint32(value: number, field: string): number {
  if (
    !Number.isFinite(value) || !Number.isInteger(value) || value < -0x8000_0000 ||
    value > 0x7fff_ffff
  ) {
    invalid(`${field} must be a sint32`);
  }
  return value;
}

export function requireText(value: string, field: string): string {
  if (!value.length) invalid(`${field} must not be empty`);
  return value;
}

export function unreachable(value: never): never {
  throw new Error(`unreachable value: ${String(value)}`);
}
