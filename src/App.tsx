/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Designer } from './components/Designer';
import { UserApp } from './components/UserApp';
import { Home } from './components/Home';
import { ApiKeyGuard } from './components/ApiKeyGuard';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BrowserGuard } from './components/BrowserGuard';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ApiKeyGuard>
          <BrowserGuard>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/designer" element={<Designer />} />
                <Route path="/app" element={<UserApp />} />
              </Routes>
            </BrowserRouter>
          </BrowserGuard>
        </ApiKeyGuard>
      </AuthProvider>
    </ErrorBoundary>
  );
}
