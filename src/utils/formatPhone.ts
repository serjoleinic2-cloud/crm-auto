export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return `+7 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7,9)}-${digits.slice(9,11)}`;
  }
  return phone;
}
