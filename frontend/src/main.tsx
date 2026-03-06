import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './pages/DashboardPage';
import { SolarForecastPage } from './pages/SolarForecastPage';
import './styles/global.css';

const queryClient = new QueryClient();

function AppShell() {
  const [view, setView] = React.useState<'dashboard' | 'solar'>('dashboard');

  return view === 'dashboard' ? (
    <DashboardPage onOpenSolarForecast={() => setView('solar')} />
  ) : (
    <SolarForecastPage onBackToDashboard={() => setView('dashboard')} />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  </React.StrictMode>
);
