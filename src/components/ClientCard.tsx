import { useNavigate } from 'react-router-dom';
import type { Client } from '../types';
import StatusBadge from './StatusBadge';
import { formatDate } from '../utils/formatters';
import { Phone, Calendar, AlertCircle } from 'lucide-react';

interface Props {
  client: Client;
}

export default function ClientCard({ client }: Props) {
  const navigate = useNavigate();
  const isOverdue = client.next_action_date && new Date(client.next_action_date) < new Date();

  return (
    <div
      onClick={() => navigate(`/clients/${client.id}`)}
      className="card cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 truncate">{client.full_name}</h3>
        <StatusBadge status={client.status_id ? { name: client.status_name || '', color: client.status_color || '', id: client.status_id, sort_order: 0, is_active: 1, category: 'pipeline' } : null} />
      </div>
      
      <div className="space-y-1 text-sm text-gray-600">
        {client.phone && (
          <div className="flex items-center gap-2">
            <Phone size={14} />
            <span>{client.phone}</span>
          </div>
        )}
        {client.next_action && (
          <div className={`flex items-center gap-2 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
            {isOverdue ? <AlertCircle size={14} /> : <Calendar size={14} />}
            <span>{client.next_action} {client.next_action_date && `(${formatDate(client.next_action_date)})`}</span>
          </div>
        )}
      </div>
    </div>
  );
}