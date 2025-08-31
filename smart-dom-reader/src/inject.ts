// This file is used for building the injectable bundle
import * as SmartDOMReader from './index';

// Expose to global scope for Chrome extension injection
(window as any).SmartDOMReader = SmartDOMReader;
