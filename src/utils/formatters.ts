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
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
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
