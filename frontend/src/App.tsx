import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';

import Build from './views/Build';
import Analyze from './views/Analyze';
import Meta from './views/Meta';
import Log from './views/Log';
import Compare from './views/Compare';
import Decks from './views/Decks';

function App() {
  const { isLoading } = useAppContext();

  if (isLoading) {
    return (
      <div className="app">
        <main>
          <div className="empty" style={{ margin: '40px' }}>Loading data...</div>
        </main>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex min-h-screen bg-surface text-content antialiased selection:bg-brand-accent-bg selection:text-brand-accent">
        <Sidebar />
        <main id="content" className="flex-1 ml-[260px] max-w-5xl mx-auto p-8 pt-10 min-h-screen flex flex-col gap-10">
          <Routes>
            <Route path="/build" element={<Build />} />
            <Route path="/analyze" element={<Analyze />} />
            <Route path="/meta" element={<Meta />} />
            <Route path="/log" element={<Log />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/" element={<Navigate to="/build" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
