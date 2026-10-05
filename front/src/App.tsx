import { Navigate, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/contexts/SessionContext';
import { LangProvider } from '@/contexts/LangContext';
import { AppConfigProvider } from '@/contexts/AppConfigContext';
import { DataStreamProvider } from '@/components/data-stream-provider';
import { Toaster } from 'sonner';
import RootLayout from '@/layouts/RootLayout';
import AppShell from '@/layouts/AppShell';
import ChatLayout from '@/layouts/ChatLayout';
import NewChatPage from '@/pages/NewChatPage';
import ChatPage from '@/pages/ChatPage';
import ConversationsPage from '@/pages/ConversationsPage';
import ProductsPage from '@/pages/ProductsPage';
import MetricsPage from '@/pages/MetricsPage';
import FraudDashboardPage from '@/pages/FraudDashboardPage';
import { RequireSection } from '@/components/require-section';
import { AuthGate } from '@/components/auth-gate';

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SessionProvider>
        <LangProvider>
          <AuthGate>
            <AppConfigProvider>
              <DataStreamProvider>
                <Toaster position="top-center" />
                <Routes>
                  <Route path="/" element={<RootLayout />}>
                    <Route element={<AppShell />}>
                      <Route element={<ChatLayout />}>
                        <Route index element={<NewChatPage />} />
                        <Route path="chat/:id" element={<ChatPage />} />
                      </Route>
                      <Route
                        path="conversations"
                        element={
                          <RequireSection section="chats">
                            <ConversationsPage />
                          </RequireSection>
                        }
                      />
                      {/* The admin view became Chats (the admin supervises there). */}
                      <Route
                        path="admin"
                        element={<Navigate to="/conversations" replace />}
                      />
                      <Route
                        path="metrics"
                        element={
                          <RequireSection section="metrics">
                            <MetricsPage />
                          </RequireSection>
                        }
                      />
                      <Route path="fraud" element={<RequireSection section="fraud"><FraudDashboardPage /></RequireSection>} />
                      <Route
                        path="products"
                        element={
                          <RequireSection section="products">
                            <ProductsPage />
                          </RequireSection>
                        }
                      />
                    </Route>
                  </Route>
                </Routes>
              </DataStreamProvider>
            </AppConfigProvider>
          </AuthGate>
        </LangProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

export default App;
