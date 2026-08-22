import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { GenerateHub } from './pages/GenerateHub.jsx';
import { Templates } from './pages/Templates.jsx';
import { Studio } from './pages/Studio.jsx';
import { Persona } from './pages/Persona.jsx';
import { Video } from './pages/Video.jsx';
import { TryOn } from './pages/TryOn.jsx';
import { Bulk } from './pages/Bulk.jsx';
import { BulkDetail } from './pages/BulkDetail.jsx';
import { JobHistory } from './pages/JobHistory.jsx';
import { JobDetail } from './pages/JobDetail.jsx';
import { BrandSettings } from './pages/BrandSettings.jsx';
import { Billing } from './pages/Billing.jsx';
import { Referrals } from './pages/Referrals.jsx';
import { Optimizer } from './pages/Optimizer.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'generate', element: <GenerateHub /> },
      { path: 'templates', element: <Templates /> },
      { path: 'studio', element: <Studio /> },
      { path: 'persona', element: <Persona /> },
      { path: 'video', element: <Video /> },
      { path: 'try-on', element: <TryOn /> },
      { path: 'bulk', element: <Bulk /> },
      { path: 'bulk/:batchId', element: <BulkDetail /> },
      { path: 'jobs', element: <JobHistory /> },
      { path: 'jobs/:jobId', element: <JobDetail /> },
      { path: 'settings/brand', element: <BrandSettings /> },
      { path: 'billing', element: <Billing /> },
      { path: 'referrals', element: <Referrals /> },
      { path: 'optimizer', element: <Optimizer /> },
    ],
  },
]);
