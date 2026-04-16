import { useEffect } from 'react'
import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { useHostStore } from '@/stores'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const initialize = useHostStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
            <Link to="/" className="text-sm font-semibold">
              DroidCode
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                to="/hosts"
                activeProps={{ className: 'text-foreground' }}
                className="hover:text-foreground"
              >
                Hosts
              </Link>
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
        <Outlet />
        <Toaster position="top-right" richColors />
      </div>
    </ThemeProvider>
  )
}
