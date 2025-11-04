import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useId } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getStoredApiKey, getStoredServerUrl, setStoredApiKey } from '@/lib/storage';
import { type SettingsFormData, settingsFormSchema } from '@/lib/validation';
import { ServerSettings } from './ServerSettings';

interface ApiKeyInputProps {
  open: boolean;
  onClose: () => void;
  // Server connection callbacks
  onConnectServer: (url: string) => Promise<void>;
  onDisconnectServer: () => Promise<void>;
  connectionState: 'disconnected' | 'connecting' | 'loading' | 'ready' | 'failed';
}

export function ApiKeyInput({
  open,
  onClose,
  onConnectServer,
  onDisconnectServer,
  connectionState,
}: ApiKeyInputProps) {
  const apiKeyId = useId();

  // Initialize form with values from localStorage
  const form = useForm<SettingsFormData>({
    // @ts-expect-error zodResolver type issue
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      apiKey: getStoredApiKey(),
      serverUrl: getStoredServerUrl(),
    },
    mode: 'onChange', // Validate on change for real-time feedback
  });

  // Reset form to current localStorage values when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        apiKey: getStoredApiKey(),
        serverUrl: getStoredServerUrl(),
      });
    }
  }, [open, form]);

  const onSubmit = async (data: SettingsFormData) => {
    try {
      // Save API key to localStorage
      setStoredApiKey(data.apiKey);

      // Connect to server (server URL is saved by connectToServer function)
      await onConnectServer(data.serverUrl);

      // Dialog will close automatically via parent's useEffect when connection succeeds
    } catch (error) {
      // Connection errors are handled by parent component
      console.error('Form submission error:', error);
    }
  };

  const handleClose = () => {
    // Only allow close if connected (enforced by parent)
    if (connectionState === 'ready') {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-2xl">
        <FormProvider {...form}>
          {/* @ts-expect-error close enough */}
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure your Anthropic API key and MCP server connection.
              </DialogDescription>
            </DialogHeader>

            {/* Connection Status Banner */}
            {(connectionState === 'disconnected' || connectionState === 'failed') && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 mt-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500" />
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    {connectionState === 'failed'
                      ? 'Connection failed. Please check your server URL and try again.'
                      : 'Please configure both API key and MCP server to start chatting.'}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-6 mt-4">
              {/* API Key Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label htmlFor={apiKeyId} className="text-sm font-medium">
                    Anthropic API Key
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p className="text-xs">
                          Get your API key from{' '}
                          <a
                            href="https://console.anthropic.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            console.anthropic.com
                          </a>
                          . Your key is stored locally and never sent to our servers.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <input
                  id={apiKeyId}
                  type="password"
                  placeholder="sk-ant-..."
                  {...form.register('apiKey')}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  autoComplete="off"
                  autoFocus
                />
                {form.formState.errors.apiKey && (
                  <p className="text-sm text-destructive">{form.formState.errors.apiKey.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Your API key will be stored locally in your browser and sent with each request.
                </p>
              </div>

              <Separator />

              {/* Server Settings Section */}
              <ServerSettings
                onConnect={onConnectServer}
                onDisconnect={onDisconnectServer}
                connectionState={connectionState}
              />
            </div>

            <DialogFooter className="mt-6">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={handleClose}
                        disabled={connectionState !== 'ready'}
                      >
                        Close
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {connectionState !== 'ready' && (
                    <TooltipContent>
                      <p className="text-xs">Connect to MCP server before closing</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      disabled={
                        !form.formState.isValid ||
                        connectionState === 'connecting' ||
                        connectionState === 'loading'
                      }
                    >
                      {connectionState === 'connecting' || connectionState === 'loading'
                        ? 'Connecting...'
                        : 'Save & Connect'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Save settings and connect to MCP server</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
