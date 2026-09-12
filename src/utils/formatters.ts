export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '';
  return `${formatMoneyInput(price)} ₽`;
}

/** Formats a whole-ruble amount while it is being typed: 2300000 → 2 300 000. */
export function formatMoneyInput(value: string | number | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Parses the formatted amount back to a database number. */
export function parseMoneyInput(value: string | number | null | undefined): number | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

export function getContactLink(type: string, value: string): string {
  switch (type) {
    case 'telegram':  return `https://t.me/${value.replace('@', '')}`;
    case 'whatsapp':  return `https://wa.me/${value.replace(/\D/g, '')}`;
    case 'max':       return `https://max.ru/${value.replace('@', '')}`;
    case 'phone':     return `tel:${value}`;
    case 'email':     return `mailto:${value}`;
    default:          return value.startsWith('http') ? value : `https://${value}`;
  }
}

export function getContactIcon(type: string): string {
  const icons: Record<string, string> = {
    phone: '📞',
    telegram: '✈️',
    max: '💬',
    whatsapp: '📱',
    email: '✉️',
    other: '🔗',
  };
  return icons[type] ?? '🔗';
}
