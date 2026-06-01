import { useEffect } from 'react'
import { Link, Outlet, createRootRoute, useLocation } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { MobileTabBar } from '@/components/mobile/MobileTabBar'
import { useIsMobile } from '@/lib/useIsMobile'
import { useHostStore } from '@/stores'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const initialize = useHostStore((s) => s.initialize)
  const location = useLocation()
  const isMobile = useIsMobile()
  const isChatRoute = location.pathname.startsWith('/chat/')

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        {!isMobile && !isChatRoute && (
          <header className="z-10 shrink-0 border-b border-border bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
              <Link to="/" className="text-sm font-semibold">
                DroidCode
              </Link>
              <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link
                  to="/settings"
                  activeProps={{ className: 'text-foreground' }}
                  className="hover:text-foreground"
                >
                  Settings
                </Link>
              </nav>
            </div>
          </header>
        )}
        <div
          className={
            'flex min-h-0 flex-1 flex-col ' +
            (isMobile ? 'overflow-hidden' : 'overflow-y-auto')
          }
        >
          <Outlet />
        </div>
        {isMobile && <MobileTabBar />}
        <Toaster position="top-right" richColors />
      </div>
    </ThemeProvider>
  )
}
