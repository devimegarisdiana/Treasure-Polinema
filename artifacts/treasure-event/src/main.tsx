import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch } from 'wouter';

import App from './App';
import RegistrationPage from './pages/RegistrationPage';
import Archive2025Page from './pages/Archive2025Page';
import NotFound from './pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={App} />
        <Route path="/register" component={RegistrationPage} />
        <Route path="/archive/2025" component={Archive2025Page} />
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  </ErrorBoundary>,
);
