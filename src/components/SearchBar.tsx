import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { ipcService } from '../services/ipcService';
import type { Client } from '../types';

interface Props {
  onSearch?: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder = 'Поиск...' }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); setOpen(false); return; }
    try {
      const results = await ipcService.clients.suggest(q);
      setSuggestions(results);
      setOpen(results.length > 0);
      setActiveIdx(-1);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(value), 200);
  };

  const handleSelect = (client: Client) => {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    navigate(`/clients/${client.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      handleSelect(suggestions[activeIdx]);
    } else if (onSearch) {
      onSearch(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    if (e.key === 'Escape')    { setOpen(false); setActiveIdx(-1); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]); }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    if (onSearch) onSearch('');
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query && suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input pl-9 pr-8 w-full"
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </form>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => handleSelect(c)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
                idx === activeIdx ? 'bg-primary-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm truncate">{c.full_name}</div>
                <div className="text-xs text-gray-400 flex gap-2 mt-0.5">
                  {c.phone && <span>{c.phone}</span>}
                  {c.car && c.car.trim() && <span>· {c.car}</span>}
                  {c.contract_number && <span>· №{c.contract_number}</span>}
                </div>
              </div>
              {c.status_name && (
                <span className="text-xs px-2 py-0.5 rounded-full text-white shrink-0 mt-0.5"
                  style={{ backgroundColor: c.status_color ?? '#6b7280' }}>
                  {c.status_name}
                </span>
              )}
            </button>
          ))}
          {onSearch && (
            <button
              type="button"
              onMouseDown={() => { setOpen(false); onSearch(query); }}
              className="w-full text-left px-3 py-2 text-xs text-primary-600 hover:bg-primary-50 border-t border-gray-100"
            >
              Показать все результаты для «{query}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
