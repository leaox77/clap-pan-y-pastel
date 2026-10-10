// Tipos de movimiento que representan ventas cobradas. 'anulacion' entra con
// monto negativo (lo registra anular_venta) y descuenta la venta anulada.
export const TIPOS_VENTA = ['venta', 'reserva', 'anulacion']

const redondear = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export function totalPorMedio(movimientos, medio) {
  return redondear(
    (movimientos ?? [])
      .filter(m => TIPOS_VENTA.includes(m.tipo) && m.medio_pago === medio)
      .reduce((suma, m) => suma + Number(m.monto || 0), 0)
  )
}

// Misma fórmula que cerrar_caja: fondo + efectivo neto - gastos.
export function calcularTotalesCaja({ movimientos, gastos, montoApertura }) {
  const ef = totalPorMedio(movimientos, 'efectivo')
  const qr = totalPorMedio(movimientos, 'qr')
  const tr = totalPorMedio(movimientos, 'transferencia')
  const gastoTotal = redondear(
    (gastos ?? []).reduce((suma, g) => suma + Math.abs(Number(g.monto || 0)), 0)
  )
  const cajaTeorica = redondear(Number(montoApertura || 0) + ef - gastoTotal)

  return { ef, qr, tr, gastoTotal, cajaTeorica }
}
