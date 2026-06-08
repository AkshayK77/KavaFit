type ToastVariant = 'success' | 'warning' | 'error'
type ShowToastFn = (message: string, variant?: ToastVariant) => void

let _showToast: ShowToastFn | null = null

export function registerGlobalToast(fn: ShowToastFn): void {
  _showToast = fn
}

export function showGlobalToast(message: string, variant: ToastVariant = 'error'): void {
  _showToast?.(message, variant)
}
