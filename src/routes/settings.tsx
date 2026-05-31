import { useTheme } from 'next-themes'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HostsSection } from '@/components/settings/HostsSection'
import { MobileSettings } from '@/components/mobile/MobileSettings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSettingsStore } from '@/stores'

export const Route = createFileRoute('/settings')({
  component: Settings,
})

function Settings() {
  const isMobile = useIsMobile()
  if (isMobile) return <MobileSettings />
  return <DesktopSettings />
}

function DesktopSettings() {
  const { theme = 'system', setTheme } = useTheme()
  const debugLogs = useSettingsStore((s) => s.debugLogs)
  const clearLogs = useSettingsStore((s) => s.clearLogs)
  const autoAcceptPermissions = useSettingsStore((s) => s.autoAcceptPermissions)
  const setAutoAcceptPermissions = useSettingsStore((s) => s.setAutoAcceptPermissions)

  async function copyLogs() {
    if (debugLogs.length === 0) return
    const text = debugLogs
      .map((l) => `${new Date(l.timestamp).toISOString()} [${l.level}] ${l.message}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Logs copied')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Copy failed')
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <HostsSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label>Theme</Label>
            <ToggleGroup
              type="single"
              value={theme}
              onValueChange={(v) => v && setTheme(v)}
            >
              <ToggleGroupItem value="system">System</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded border border-border p-3">
            <div className="min-w-0">
              <Label htmlFor="autoaccept" className="cursor-pointer">
                Auto-accept permissions
              </Label>
              <p className="text-xs text-muted-foreground">
                Replies "always" to every permission request without prompting.
                Turn off to approve each tool call manually.
              </p>
            </div>
            <Switch
              id="autoaccept"
              checked={autoAcceptPermissions}
              onCheckedChange={setAutoAcceptPermissions}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Version:</span>{' '}
            <span className="font-mono">{__APP_VERSION__}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            DroidCode · wagent client
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Debug logs</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={copyLogs} disabled={debugLogs.length === 0}>
              <Copy className="size-4" />
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={clearLogs} disabled={debugLogs.length === 0}>
              <Trash2 className="size-4" />
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {debugLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No logs yet.</p>
          ) : (
            <>
              <Separator className="mb-3" />
              <pre className="max-h-96 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                {debugLogs
                  .map((l) => `${new Date(l.timestamp).toLocaleTimeString()} [${l.level}] ${l.message}`)
                  .join('\n')}
              </pre>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
