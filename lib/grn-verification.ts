const QUANTITY_EPSILON = 0.000001;

export function validateGrnQuantities(
  qtyDelivered: number,
  qtyAccepted: number,
  qtyRejected: number,
) {
  if (![qtyDelivered, qtyAccepted, qtyRejected].every(Number.isFinite)) {
    throw new Error('Quantities must be valid numbers');
  }

  if (qtyAccepted < 0 || qtyRejected < 0) {
    throw new Error('Accepted and rejected quantities cannot be negative');
  }

  if (Math.abs(qtyAccepted + qtyRejected - qtyDelivered) > QUANTITY_EPSILON) {
    throw new Error('Accepted and rejected quantities must equal the delivered quantity');
  }
}