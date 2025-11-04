import { AlertCircle, XCircle } from 'lucide-react';
import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SettingsFormData } from '@/lib/validation';

interface ServerSettingsProps {
  onConnect: (url: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  connectionState: 'disconnected' | 'connecting' | 'loading' | 'ready' | 'failed';
}

export function ServerSettings({ onDisconnect, connectionState }: ServerSettingsProps) {
  const serverUrlId = useId();

  // Access form context from parent FormProvider
  const {
    register,
    formState: { errors },
  } = useFormContext<SettingsFormData>();

  const handleDisconnect = async () => {
    try {
      await onDisconnect();
    } catch (err) {
      console.error('Disconnection failed:', err);
    }
  };

  const isConnected = connectionState === 'ready';
  const isLoading = connectionState === 'connecting' || connectionState === 'loading';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label htmlFor={serverUrlId} className="text-sm font-medium">
              MCP Server URL
            </label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-xs">
                    Enter the URL of your MCP server. For local development, this is typically{' '}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs">
                      http://localhost:8888
                    </code>
                    . This demo showcases MCP integration with embedded iframes.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isConnected && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="default"
                    className="h-5 gap-1 bg-green-500/10 text-green-700 dark:text-green-400 cursor-help"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Connected
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Successfully connected to MCP server</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {connectionState === 'failed' && (
            <Badge variant="destructive" className="h-5 gap-1">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <input
            id={serverUrlId}
            type="url"
            placeholder="http://localhost:8888"
            {...register('serverUrl')}
            disabled={isConnected || isLoading}
            className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            inputMode="url"
            autoComplete="url"
          />

          {isConnected && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isLoading}
                    className="h-9 gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Disconnect from the MCP server</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {errors.serverUrl && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {errors.serverUrl.message}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Enter the URL of your MCP server endpoint. The URL will be saved to your browser's
          localStorage when you connect.
        </p>
      </div>
    </div>
  );
}
