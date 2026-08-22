import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ToastProvider';
import ProtectedShell from './components/AppShell';
import Login from './pages/Login';
import TemplatesList from './pages/TemplatesList';
import TemplateEditor from './pages/TemplateEditor';
import ModelsList from './pages/ModelsList';
import ModelEditor from './pages/ModelEditor';
import MarginCalculator from './pages/MarginCalculator';
import Ops from './pages/Ops';

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedShell />}>
          <Route path="/" element={<Navigate to="/templates" replace />} />
          <Route path="/templates" element={<TemplatesList />} />
          <Route path="/templates/new" element={<TemplateEditor />} />
          <Route path="/templates/:slug" element={<TemplateEditor />} />
          <Route path="/models" element={<ModelsList />} />
          <Route path="/models/new" element={<ModelEditor />} />
          <Route path="/models/:id" element={<ModelEditor />} />
          <Route path="/margin-calculator" element={<MarginCalculator />} />
          <Route path="/ops" element={<Ops />} />
        </Route>

        <Route path="*" element={<Navigate to="/templates" replace />} />
      </Routes>
    </ToastProvider>
  );
}

export default App;
