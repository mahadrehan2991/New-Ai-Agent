import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskPhone(phone: string, reveal: boolean = false): string {
  if (reveal) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  const last4 = digits.slice(-4);
  return `(•••) •••-${last4}`;
}
