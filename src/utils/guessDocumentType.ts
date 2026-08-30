import type { DocumentType } from '../types';

const KEYWORDS: Record<string, string[]> = {
  consent: ['соглас', 'consent', 'пд', 'soglas'],
  passport: ['паспорт', 'passport', 'pasport'],
  snils: ['снилс', 'snils'],
  inn: ['инн', 'inn'],
  contract_signed: ['подпис', 'signed', 'podpis'],
  contract: ['договор', 'contract', 'dogovor'],
  payment_proof: ['чек', 'оплат', 'payment', 'receipt', 'kvitanciya', 'квитанц', 'chek', 'oplat'],
  broker_poa: ['доверенност', 'poa', 'broker', 'doverennost'],
};

/** Guesses a document type id for a filename by matching keywords against known codes.
 *  Falls back to the "other" type (or the first type) when nothing matches. */
export function guessDocumentTypeId(fileName: string, types: DocumentType[]): number {
  const lower = fileName.toLowerCase();

  // contract_signed must be checked before contract (both share "договор")
  for (const code of ['contract_signed', 'consent', 'passport', 'snils', 'inn', 'payment_proof', 'broker_poa', 'contract']) {
    const words = KEYWORDS[code];
    if (words && words.some(w => lower.includes(w))) {
      const t = types.find(t => t.code === code);
      if (t) return t.id;
    }
  }

  const other = types.find(t => t.code === 'other');
  return other ? other.id : types[0]?.id;
}
