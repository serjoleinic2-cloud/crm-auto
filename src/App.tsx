import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import QuickAdd from './pages/QuickAdd';
import Orders from './pages/Orders';
import Archive from './pages/Archive';
import Documents from './pages/Documents';
import Reminders from './pages/Reminders';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import { Home, Users, Truck, Archive as ArchiveIcon, Bell, BarChart2, Settings as SettingsIcon } from 'lucide-react';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const links = [
    { to: '/',          icon: Home,        label: 'Главная' },
    { to: '/clients',   icon: Users,       label: 'Клиенты' },
    { to: '/orders',    icon: Truck,       label: 'Заказы' },
    { to: '/reminders', icon: Bell,        label: 'Задачи' },
    { to: '/archive',   icon: ArchiveIcon, label: 'Архив' },
    { to: '/statistics',icon: BarChart2,   label: 'Статистика' },
    { to: '/settings',  icon: SettingsIcon,label: 'Настройки' },
  ];

  return (
    <nav className="w-14 bg-gray-900 flex flex-col items-center py-4 gap-1 shrink-0">
      {links.map(({ to, icon: Icon, label }) => {
        const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
        return (
          <button
            key={to}
            title={label}
            onClick={() => navigate(to)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              active ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </nav>
  );
}

function App() {
  const { isAuthenticated, isLoading, isFirstRun } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login isFirstRun={isFirstRun === true} />;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/clients"       element={<Clients />} />
          <Route path="/clients/:id"   element={<ClientDetail />} />
          <Route path="/quick-add"     element={<QuickAdd />} />
          <Route path="/orders"        element={<Orders />} />
          <Route path="/archive"       element={<Archive />} />
          <Route path="/documents"     element={<Documents />} />
          <Route path="/reminders"     element={<Reminders />} />
          <Route path="/statistics"    element={<Statistics />} />
          <Route path="/settings"      element={<Settings />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
