import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { OrderItem } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Kilos e importe de una línea de pedido.
 * Usa los valores guardados (total_item_kilos / total_price); si faltan (pedidos antiguos)
 * los recalcula con la misma fórmula que storage.ts.
 * byWeight = la línea se vende por kilo (kilos_per_unit != 0); si no, el precio es por unidad.
 */
export function getItemSale(item: Partial<OrderItem>) {
  const qty = Number(item.quantity) || 1;
  const kpu = Number(item.kilos_per_unit) || 0;
  const tare = Number(item.tare) || 0;
  const price = Number(item.price) || 0;
  const byWeight = kpu !== 0;

  let kilos: number;
  let amount: number;
  if (typeof item.total_item_kilos === "number" && typeof item.total_price === "number") {
    kilos = item.total_item_kilos;
    amount = item.total_price;
  } else if (byWeight) {
    const net = kpu - qty * tare;
    kilos = kpu < 0 ? net : Math.max(0, net);
    amount = kilos * price;
  } else {
    kilos = 0;
    amount = qty * price;
  }
  return { qty, kilos, amount, byWeight, price };
}

/** Acumulador para el precio medio ponderado (importe total / kilos totales; o / unidades si se vende por unidad). */
export interface PriceAcc {
  kgAmount: number;
  kgKilos: number;
  unitAmount: number;
  unitQty: number;
}

export const emptyPriceAcc = (): PriceAcc => ({ kgAmount: 0, kgKilos: 0, unitAmount: 0, unitQty: 0 });

export function addToPriceAcc(acc: PriceAcc, item: Partial<OrderItem>) {
  const s = getItemSale(item);
  if (s.byWeight) {
    acc.kgAmount += s.amount;
    acc.kgKilos += s.kilos;
  } else {
    acc.unitAmount += s.amount;
    acc.unitQty += s.qty;
  }
}

export function mergePriceAcc(a: PriceAcc, b: PriceAcc): PriceAcc {
  return {
    kgAmount: a.kgAmount + b.kgAmount,
    kgKilos: a.kgKilos + b.kgKilos,
    unitAmount: a.unitAmount + b.unitAmount,
    unitQty: a.unitQty + b.unitQty,
  };
}

/** Precio medio por kilo y/o por unidad (null si no hay base para calcularlo). */
export function avgPrice(acc: PriceAcc) {
  return {
    perKg: acc.kgKilos !== 0 ? acc.kgAmount / acc.kgKilos : null,
    perUnit: acc.unitQty !== 0 ? acc.unitAmount / acc.unitQty : null,
  };
}

export const totalAmountOf = (acc: PriceAcc) => acc.kgAmount + acc.unitAmount;
