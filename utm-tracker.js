/**
 * UTM Tracker for La Main Verte
 * 
 * This script automatically tracks UTM parameters and session data for marketing attribution.
 * It captures UTM parameters from the current page URL and appends them to all links
 * pointing to app.lamainverte.ca to maintain attribution across the user journey.
 * 
 * FEATURES:
 * - Automatic UTM parameter capture from URL
 * - Session management with 30-minute timeout
 * - Link decoration for attribution tracking
 * - Form field population with UTM parameters
 * - Dynamic content support (SPAs, AJAX-loaded content)
 * - Error handling and fallbacks
 * - Page view counting
 * - Development debugging tools
 * 
 * UTM PARAMETERS TRACKED:
 * - utm_source: Identifies the source of traffic
 * - utm_medium: Identifies the marketing medium
 * - utm_campaign: Identifies the specific campaign
 * - utm_term: Identifies paid search keywords
 * - utm_content: Identifies specific content variations
 * - fbclid: Facebook click identifier
 * - gclid: Google Ads click identifier
 * 
 * SESSION MANAGEMENT:
 * - Creates unique session IDs for each user session
 * - Sessions expire after 30 minutes of inactivity
 * - Preserves UTM data across page views within the same session
 * - Tracks page views per session
 * 
 * LINK DECORATION:
 * - Automatically appends session_id and UTM parameters to all links
 * - Only decorates links pointing to app.lamainverte.ca
 * - Prevents duplicate decoration of already decorated links
 * - Works with dynamically loaded content via MutationObserver
 * 
 * FORM FIELD POPULATION:
 * - Automatically populates UTM parameters into form fields with matching IDs
 * - Supports input, textarea, and select elements
 * - Handles multiple elements with the same ID on the same page
 * - Works with dynamically loaded content via MutationObserver
 * - Ensures UTM data is sent to backend on form submission
 * 
 * STORAGE:
 * - Uses localStorage with key 'lmv_tracking'
 * - Stores session data, UTM parameters, and page view count
 * - Handles storage errors gracefully
 * 
 * USAGE:
 * Simply include this script on any page where you want to track UTM parameters.
 * The script will automatically:
 * 1. Extract UTM parameters from the current page URL
 * 2. Create or continue a user session
 * 3. Decorate all relevant links with tracking parameters
 * 4. Populate UTM parameters into form fields with matching IDs
 * 5. Monitor for new links and form fields added dynamically
 * 
 * DEBUGGING:
 * In development environments (localhost or dev domains), the script exposes:
 * - window.lmvTrackingData: Current tracking data object
 * - Console logs with session info and decorated link count
 * 
 * MANUAL DEBUGGING:
 * To trigger debug logging from the browser inspector:
 * 1. Set window.lmvDebugMode = true (enables debug mode)
 * 2. Call window.lmvDebug() to log current state
 * 3. Call window.lmvDebugLinks() to show decorated links
 * 4. Call window.lmvDebugUTMFields() to show UTM form fields
 * 5. Call window.lmvDebugStorage() to show storage contents
 * 
 * BROWSER SUPPORT:
 * - Modern browsers with localStorage and URLSearchParams
 * - Graceful fallbacks for older browsers
 * - Error handling for missing APIs
 * 
 * @version 2.0.0
 * @author La Main Verte
 */

(function () {
    const STORAGE_KEY = 'lmv_tracking';
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 mins
    const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    const TARGET_DOMAIN = 'app.lamainverte.ca';
  
    // Error handling wrapper
    function safeExecute(fn, fallback = null) {
      try {
        return fn();
      } catch (error) {
        console.warn('UTM Tracker error:', error);
        return fallback;
      }
    }
  
    function generateUUID() {
      return safeExecute(() => {
        if (crypto.randomUUID) {
          return crypto.randomUUID();
        }
        // Fallback for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }, 'fallback-uuid-' + Date.now());
    }
  
    function getTrackingData() {
      return safeExecute(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      }, null);
    }
  
    function saveTrackingData(data) {
      safeExecute(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      });
    }
  
    function extractUTMsFromURL() {
      return safeExecute(() => {
        const params = new URLSearchParams(window.location.search);
        const data = {};
        
        for (const key of UTM_FIELDS) {
          const value = params.get(key);
          if (value && value.trim()) {
            data[key] = value.trim();
          }
        }
        
        return Object.keys(data).length > 0 ? data : null;
      }, null);
    }
  
    function shouldStartNewSession(lastUpdated) {
      if (!lastUpdated) return true;
      const now = Date.now();
      return now - lastUpdated > SESSION_TIMEOUT_MS;
    }
  
    function isValidTrackingData(data) {
      return data && 
             typeof data === 'object' && 
             data.session_id && 
             data.created_at && 
             data.last_updated;
    }
  
    // Debug logging function
    function logDebug(message, data = null) {
      if (window.lmvDebugMode || window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
        console.log(`🔍 UTM Tracker: ${message}`, data || '');
      }
    }
  
    // Initialize or refresh session
    const stored = getTrackingData();
    const now = Date.now();
    const utms = extractUTMsFromURL();
    const hasNewUTMs = utms !== null;
  
    let trackingData;
  
    // Validate stored data and create new session if needed
    if (!isValidTrackingData(stored) || shouldStartNewSession(stored.last_updated)) {
      trackingData = {
        session_id: generateUUID(),
        created_at: now,
        last_updated: now,
        page_views: 1,
        ...(isValidTrackingData(stored) ? stored : {}), // Preserve valid stored data
        ...utms // Overwrite with new UTMs if they exist
      };
      logDebug('Created new session', { sessionId: trackingData.session_id, utms });
    } else {
      trackingData = {
        ...stored,
        last_updated: now,
        page_views: (stored.page_views || 0) + 1
      };
      
      if (hasNewUTMs) {
        Object.assign(trackingData, utms);
        logDebug('Updated UTM parameters', utms);
      }
      
      logDebug('Continued existing session', { 
        sessionId: trackingData.session_id, 
        pageViews: trackingData.page_views 
      });
    }
  
    saveTrackingData(trackingData);
  
    // Append tracking to all links to target domain
    function decorateLinks() {
      return safeExecute(() => {
        const links = document.querySelectorAll(`a[href*="${TARGET_DOMAIN}"]`);
        let decoratedCount = 0;
        
        links.forEach(link => {
          try {
            const url = new URL(link.href);
            
            // Only decorate if not already decorated
            if (!url.searchParams.has('session_id')) {
              url.searchParams.set('session_id', trackingData.session_id);
              
              UTM_FIELDS.forEach(param => {
                if (trackingData[param] && !url.searchParams.has(param)) {
                  url.searchParams.set(param, trackingData[param]);
                }
              });
              
              link.href = url.toString();
              decoratedCount++;
              
              logDebug('Decorated link', { 
                original: link.href, 
                decorated: url.toString() 
              });
            }
          } catch (error) {
            console.warn('Failed to decorate link:', link.href, error);
          }
        });
        
        logDebug(`Decorated ${decoratedCount} links`);
        return decoratedCount;
      }, 0);
    }

    // Populate UTM parameters into form fields with matching IDs
    function populateUTMFields() {
      return safeExecute(() => {
        let populatedCount = 0;
        
        UTM_FIELDS.forEach(param => {
          if (trackingData[param]) {
            // Find all elements with the UTM parameter as ID
            const elements = document.querySelectorAll(`#${param}`);
            
            elements.forEach(element => {
              try {
                // Handle different input types
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                  if (element.type === 'hidden' || element.type === 'text' || element.type === '') {
                    element.value = trackingData[param];
                    populatedCount++;
                    logDebug(`Populated ${param} field`, { 
                      elementType: element.tagName, 
                      elementId: element.id, 
                      value: trackingData[param] 
                    });
                  }
                } else if (element.tagName === 'SELECT') {
                  // For select elements, try to find and select the option with matching value
                  const option = Array.from(element.options).find(opt => 
                    opt.value === trackingData[param] || opt.textContent === trackingData[param]
                  );
                  if (option) {
                    element.value = option.value;
                    populatedCount++;
                    logDebug(`Populated ${param} select field`, { 
                      elementId: element.id, 
                      selectedValue: option.value 
                    });
                  }
                }
              } catch (error) {
                console.warn(`Failed to populate ${param} field:`, element, error);
              }
            });
          }
        });
        
        logDebug(`Populated ${populatedCount} UTM fields`);
        return populatedCount;
      }, 0);
    }
  
    // Handle dynamic content (SPAs, AJAX-loaded content)
    function observeDOMChanges() {
      if (!window.MutationObserver) return;
      
      const observer = new MutationObserver((mutations) => {
        let shouldDecorate = false;
        let shouldPopulate = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const links = node.querySelectorAll ? node.querySelectorAll(`a[href*="${TARGET_DOMAIN}"]`) : [];
                if (links.length > 0) {
                  shouldDecorate = true;
                  logDebug('New links detected in DOM', { count: links.length });
                }
                
                // Check for new UTM form fields
                const utmFields = node.querySelectorAll ? node.querySelectorAll(UTM_FIELDS.map(field => `#${field}`).join(',')) : [];
                if (utmFields.length > 0) {
                  shouldPopulate = true;
                  logDebug('New UTM form fields detected in DOM', { count: utmFields.length });
                }
              }
            });
          }
        });
        
        if (shouldDecorate || shouldPopulate) {
          // Debounce to avoid excessive calls
          clearTimeout(window.utmTrackerTimeout);
          window.utmTrackerTimeout = setTimeout(() => {
            if (shouldDecorate) {
              const count = decorateLinks();
              logDebug('Decorated links after DOM change', { count });
            }
            if (shouldPopulate) {
              const count = populateUTMFields();
              logDebug('Populated UTM fields after DOM change', { count });
            }
          }, 100);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      logDebug('DOM observer initialized');
    }
  
    // Debug functions exposed to window
    function debugCurrentState() {
      console.group('🔍 UTM Tracker Debug Info');
      console.log('Current Tracking Data:', trackingData);
      console.log('Current URL UTMs:', utms);
      console.log('Session Timeout (ms):', SESSION_TIMEOUT_MS);
      console.log('Target Domain:', TARGET_DOMAIN);
      console.log('Debug Mode:', window.lmvDebugMode);
      console.groupEnd();
    }
  
    function debugDecoratedLinks() {
      const links = document.querySelectorAll(`a[href*="${TARGET_DOMAIN}"]`);
      console.group('🔗 Decorated Links');
      links.forEach((link, index) => {
        console.log(`Link ${index + 1}:`, {
          text: link.textContent?.trim() || 'No text',
          href: link.href,
          hasSessionId: link.href.includes('session_id'),
          hasUtmParams: UTM_FIELDS.some(param => link.href.includes(param))
        });
      });
      console.log(`Total links found: ${links.length}`);
      console.groupEnd();
    }

    function debugUTMFields() {
      console.group('📝 UTM Form Fields');
      UTM_FIELDS.forEach(param => {
        const elements = document.querySelectorAll(`#${param}`);
        console.log(`${param}:`, {
          count: elements.length,
          elements: Array.from(elements).map(el => ({
            tagName: el.tagName,
            type: el.type || 'N/A',
            value: el.value || 'N/A',
            hasValue: !!el.value
          }))
        });
      });
      console.groupEnd();
    }
  
    function debugStorage() {
      const raw = localStorage.getItem(STORAGE_KEY);
      console.group('💾 Storage Debug');
      console.log('Raw storage:', raw);
      console.log('Parsed data:', raw ? JSON.parse(raw) : null);
      console.log('Storage key:', STORAGE_KEY);
      console.groupEnd();
    }
  
    // Initialize
    const decoratedCount = decorateLinks();
    const populatedCount = populateUTMFields();
    observeDOMChanges();
    
    // Expose tracking data and debug functions
    window.lmvTrackingData = trackingData;
    window.lmvDebug = debugCurrentState;
    window.lmvDebugLinks = debugDecoratedLinks;
    window.lmvDebugUTMFields = debugUTMFields;
    window.lmvDebugStorage = debugStorage;
    
    // Initial debug log
    logDebug('UTM Tracker initialized', {
      sessionId: trackingData.session_id,
      decoratedLinks: decoratedCount,
      populatedUTMFields: populatedCount,
      utmParams: utms,
      debugMode: window.lmvDebugMode
    });
    
    // Watch for debug mode changes
    Object.defineProperty(window, 'lmvDebugMode', {
      get: function() {
        return this._lmvDebugMode || false;
      },
      set: function(value) {
        this._lmvDebugMode = Boolean(value);
        if (this._lmvDebugMode) {
          console.log('🔍 UTM Tracker debug mode enabled');
          debugCurrentState();
        }
      }
    });
  })();