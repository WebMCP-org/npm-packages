/**
 * Example Usage of MCPConfigExplorer Component
 *
 * This file demonstrates how to use the MCP Config Explorer component
 * in a real-world application.
 */

import { useEffect, useState } from 'react';
import { MCPConfigExplorer } from './MCPConfigExplorer';
import type { DetectedConfig } from './types';

/**
 * Example 1: Basic Usage
 */
export function BasicExample() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>MCP Configuration Setup</h1>
      <MCPConfigExplorer mcpUrl="https://api.example.com/mcp/your-server-id" serverName="webmcp" />
    </div>
  );
}

/**
 * Example 2: With Custom Server Configuration
 */
export function CustomConfigExample() {
  const serverConfig = {
    timeout: 30000,
    retries: 3,
    headers: {
      'X-Custom-Header': 'value',
    },
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Custom MCP Configuration</h1>
      <MCPConfigExplorer
        mcpUrl="https://api.example.com/mcp/custom-server"
        serverName="my-custom-server"
        serverConfig={serverConfig}
      />
    </div>
  );
}

/**
 * Example 3: With Event Handlers and State Management
 */
export function AdvancedExample() {
  const [updatedConfigs, setUpdatedConfigs] = useState<DetectedConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleConfigUpdated = (config: DetectedConfig) => {
    setUpdatedConfigs((prev) => [...prev, config]);
    setShowSuccess(true);
    setError(null);

    // Auto-hide success message after 3 seconds
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleError = (err: Error) => {
    setError(err.message);
    setShowSuccess(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>MCP Configuration Manager</h1>

      {/* Success Message */}
      {showSuccess && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: '#dcfce7',
            border: '1px solid #22c55e',
            borderRadius: '8px',
            color: '#15803d',
          }}
        >
          ✓ Configuration updated successfully!
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            color: '#991b1b',
          }}
        >
          ✗ Error: {error}
        </div>
      )}

      {/* Updated Configs List */}
      {updatedConfigs.length > 0 && (
        <div
          style={{
            padding: '16px',
            marginBottom: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
            Updated Configurations ({updatedConfigs.length})
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {updatedConfigs.map((config, index) => (
              <li
                key={`${config.platform}-${config.path}-${index}`}
                style={{ marginBottom: '8px', fontSize: '14px' }}
              >
                <strong>{config.platform}</strong>: {config.fileName}
                <br />
                <span style={{ fontSize: '12px', color: '#666' }}>{config.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Component */}
      <MCPConfigExplorer
        mcpUrl="https://api.example.com/mcp/advanced-server"
        serverName="webmcp"
        onConfigUpdated={handleConfigUpdated}
        onError={handleError}
      />
    </div>
  );
}

/**
 * Example 4: Integration with Authentication
 */
export function AuthenticatedExample() {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate authentication and MCP URL generation
    const initializeAuth = async () => {
      try {
        // In a real app, this would be your auth logic
        const currentUser = { id: 'user123', name: 'John Doe' };
        setUser(currentUser);

        // Generate or fetch the MCP URL for this user
        const generatedUrl = `https://api.example.com/mcp/${currentUser.id}`;
        setMcpUrl(generatedUrl);
      } catch (error) {
        console.error('Authentication error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || !mcpUrl) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Please log in to configure your MCP server.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1>Welcome, {user.name}!</h1>
        <p>Configure your personal MCP server connection below.</p>
      </div>

      <div
        style={{
          padding: '16px',
          marginBottom: '24px',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
        }}
      >
        <strong>Security Notice:</strong> Your MCP URL is personal and should not be shared. It
        provides access to your authenticated browser session.
      </div>

      <MCPConfigExplorer
        mcpUrl={mcpUrl}
        serverName="webmcp"
        onConfigUpdated={(config) => {
          console.log(`User ${user.id} updated ${config.platform} config`);
        }}
        onError={(error) => {
          console.error(`Config error for user ${user.id}:`, error);
        }}
      />
    </div>
  );
}

/**
 * Example 5: Multi-Platform Setup Wizard
 */
export function SetupWizardExample() {
  const [currentStep, setCurrentStep] = useState<'intro' | 'explore' | 'complete'>('intro');
  const [configuredPlatforms, setConfiguredPlatforms] = useState<string[]>([]);

  const handleConfigUpdated = (config: DetectedConfig) => {
    if (!configuredPlatforms.includes(config.platform)) {
      setConfiguredPlatforms((prev) => [...prev, config.platform]);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Step Indicator */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          {['intro', 'explore', 'complete'].map((step, index) => (
            <div
              key={step}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: currentStep === step ? '#0070f3' : '#e0e0e0',
                color: currentStep === step ? '#fff' : '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
              }}
            >
              {index + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 'intro' && (
        <div>
          <h1>Setup Your MCP Server</h1>
          <p>
            This wizard will help you configure your MCP server across all your development tools.
          </p>
          <ul>
            <li>Automatically detect configuration files</li>
            <li>Preview changes before applying</li>
            <li>Update multiple platforms at once</li>
          </ul>
          <button
            type="button"
            onClick={() => setCurrentStep('explore')}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            Get Started
          </button>
        </div>
      )}

      {currentStep === 'explore' && (
        <div>
          <h1>Configure Your Tools</h1>
          {configuredPlatforms.length > 0 && (
            <div
              style={{
                padding: '12px',
                marginBottom: '16px',
                backgroundColor: '#dcfce7',
                borderRadius: '8px',
              }}
            >
              Configured {configuredPlatforms.length} platform
              {configuredPlatforms.length !== 1 ? 's' : ''}: {configuredPlatforms.join(', ')}
            </div>
          )}

          <MCPConfigExplorer
            mcpUrl="https://api.example.com/mcp/wizard-example"
            serverName="webmcp"
            onConfigUpdated={handleConfigUpdated}
          />

          <button
            type="button"
            onClick={() => setCurrentStep('complete')}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            Finish Setup
          </button>
        </div>
      )}

      {currentStep === 'complete' && (
        <div style={{ textAlign: 'center' }}>
          <h1>Setup Complete! 🎉</h1>
          <p>
            You've successfully configured {configuredPlatforms.length} platform
            {configuredPlatforms.length !== 1 ? 's' : ''}.
          </p>
          {configuredPlatforms.length > 0 && (
            <ul style={{ textAlign: 'left', display: 'inline-block' }}>
              {configuredPlatforms.map((platform) => (
                <li key={platform}>✓ {platform}</li>
              ))}
            </ul>
          )}
          <p>You can now start using your MCP server with these tools!</p>
          <button
            type="button"
            onClick={() => {
              setCurrentStep('intro');
              setConfiguredPlatforms([]);
            }}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Main Example Component - renders all examples
 */
export default function ExamplesApp() {
  const [selectedExample, setSelectedExample] = useState<string>('basic');

  const examples = {
    basic: { component: BasicExample, title: 'Basic Usage' },
    custom: { component: CustomConfigExample, title: 'Custom Configuration' },
    advanced: { component: AdvancedExample, title: 'Advanced with State Management' },
    auth: { component: AuthenticatedExample, title: 'With Authentication' },
    wizard: { component: SetupWizardExample, title: 'Setup Wizard' },
  };

  const SelectedComponent = examples[selectedExample as keyof typeof examples].component;

  return (
    <div>
      {/* Example Selector */}
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0' }}>MCP Config Explorer Examples</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(examples).map(([key, { title }]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedExample(key)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: selectedExample === key ? '#0070f3' : '#fff',
                color: selectedExample === key ? '#fff' : '#1a1a1a',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Example */}
      <SelectedComponent />
    </div>
  );
}
