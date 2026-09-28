import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/contexts/SessionContext';
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

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SessionProvider>
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
                    element={<ConversationsPage />}
                  />
                  <Route path="products" element={<ProductsPage />} />
                </Route>
              </Route>
            </Routes>
          </DataStreamProvider>
        </AppConfigProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

export default App;
