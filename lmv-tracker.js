/**
 * La Main Verte Unified Tracker
 * 
 * This script combines UTM tracking and session management into a single, 
 * comprehensive tracking solution. It handles UTM parameter capture, 
 * link decoration, form field population, session management, and page view tracking.
 * https://cdn.jsdelivr.net/gh/lamainverte/cdn@main/lmv-tracker.js
 * 
 * FEATURES:
 * - Automatic UTM parameter capture from URL
 * - Session management with 30-minute timeout
 * - Page view tracking with backend API integration
 * - Link decoration for attribution tracking
 * - Form field population with UTM parameters
 * - Dynamic content support (SPAs, AJAX-loaded content)
 * - Error handling and fallbacks
 * - Development debugging tools
 * - IP-based user matching
 * 
 * UTM PARAMETERS TRACKED:
 * - utm_source: Identifies the source of traffic
 * - utm_medium: Identifies the marketing medium
 * - utm_campaign: Identifies the specific campaign
 * - utm_term: Identifies paid search keywords
 * - utm_content: Identifies specific content variations
 * - fbclid: Facebook click identifier
 * - gclid: Google Ads click identifier
 * - fbp: Facebook browser ID from Meta Pixel
 * 
 * SESSION MANAGEMENT:
 * - Creates unique session UUIDs for each user session
 * - Sessions expire after 30 minutes of inactivity
 * - Preserves UTM data across page views within the same session
 * - Tracks page views per session
 * - Automatic session creation/update via API
 * - Page view event logging with UTM data
 * 
 * LINK DECORATION:
 * - Automatically appends session UUID and UTM parameters to all links
 * - Only decorates links pointing to core.lamainverte.ca
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
 * PAGE VIEW TRACKING:
 * - Logs page views as events with event_type 'view' and event_name 'page'
 * - Includes path, title, referrer, and UTM parameters in event data
 * - Automatic API integration with session backend
 * 
 * STORAGE:
 * - Uses localStorage with key 'lmv_tracker'
 * - Stores session data, UTM parameters, and page view count
 * - Handles storage errors gracefully
 * 
 * CONFIGURATION:
 * You can configure the tracker by setting window.lmvTrackerConfig before including the script:
 * 
 * window.lmvTrackerConfig = {
 *   apiBaseUrl: 'https://core.lamainverte.ca/api/v1', // Default API base URL
 *   targetDomain: 'core.lamainverte.ca',              // Default target domain for link decoration
 *   paymentDomain: 'paiement.lamainverte.ca',        // Payment links domain to attach client_reference_id
 *   sessionTimeout: 30,                              // Session timeout in minutes (default: 30)
 *   enablePageViewTracking: true,                    // Enable/disable page view API calls (default: true)
 *   enableLinkDecoration: true,                      // Enable/disable link decoration (default: true)
 *   enableFormPopulation: true,                      // Enable/disable form field population (default: true)
 *   debugMode: false,                                // Enable debug mode (default: false in production)
 *   requireConsent: false,                           // Require user consent before tracking (default: false)
 *   consentStorageKey: 'lmv_consent_given'           // localStorage key for consent status (default: 'lmv_consent_given')
 * };
 * 
 * CONSENT MANAGEMENT:
 * When requireConsent is true, the tracker will not initialize until consent is given.
 * Use the following methods to manage consent:
 * 
 * // Give consent and start tracking
 * window.lmvTracker.giveConsent();
 * 
 * // Revoke consent and clear all tracking data
 * window.lmvTracker.revokeConsent();
 * 
 * // Check if consent has been given
 * if (window.lmvTracker.hasConsent()) {
 *   console.log('Tracking is active');
 * }
 * 
 * PRIVACY-COMPLIANT SETUP:
 * For GDPR/privacy compliance, configure the tracker to require consent:
 * 
 * window.lmvTrackerConfig = {
 *   requireConsent: true
 * };
 * 
 * Then call window.lmvTracker.giveConsent() only after the user accepts cookies.
 * 
 * USAGE:
 * Simply include this script on any page where you want to track UTM parameters and sessions.
 * The script will automatically:
 * 1. Extract UTM parameters from the current page URL
 * 2. Create or continue a user session
 * 3. Log page view event to the backend API
 * 4. Decorate all relevant links with tracking parameters
 * 5. Populate UTM parameters into form fields with matching IDs
 * 6. Monitor for new links and form fields added dynamically
 * 
 * DEBUGGING:
 * In development environments (localhost or dev domains), the script exposes:
 * - window.lmvTrackerData: Current tracking data object
 * - Console logs with session info and tracking data
 * 
 * MANUAL DEBUGGING:
 * To trigger debug logging from the browser inspector:
 * 1. Set window.lmvDebugMode = true (enables debug mode)
 * 2. Call window.lmvDebug() to log current state
 * 3. Call window.lmvDebugLinks() to show decorated links
 * 4. Call window.lmvDebugUTMFields() to show UTM form fields
 * 5. Call window.lmvDebugStorage() to show storage contents
 * 6. Call window.lmvDebugSession() to show session info
 * 
 * BROWSER SUPPORT:
 * - Modern browsers with localStorage, URLSearchParams, and fetch
 * - Graceful fallbacks for older browsers
 * - Error handling for missing APIs
 * 
 * @version 3.1.0
 * @author La Main Verte
 */

(function () {
    // Configuration with defaults
    const config = Object.assign({
        apiBaseUrl: 'https://core.lamainverte.ca/api/v1',
        targetDomain: 'app.lamainverte.ca',
        paymentDomain: 'paiement.lamainverte.ca',
        sessionTimeout: 30, // minutes
        enablePageViewTracking: true,
        enableLinkDecoration: true,
        enableFormPopulation: true,
        debugMode: false,
        requireConsent: false, // If true, tracking won't start until consent is given
        consentStorageKey: 'lmv_consent_given' // Key to check for consent in localStorage
    }, window.lmvTrackerConfig || {});

    // Constants
    const STORAGE_KEY = 'lmv_tracker';
    const SESSION_TIMEOUT_MS = config.sessionTimeout * 60 * 1000;
    const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'fbp'];
    
    // State
    let trackerData = null;
    let isInitialized = false;
    let consentGiven = false;
    let pendingInitialization = false;

    // Error handling wrapper
    function safeExecute(fn, fallback = null) {
        try {
            return fn();
        } catch (error) {
            logDebug('Tracker error:', error);
            return fallback;
        }
    }

    // UUID generation
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

    // Storage utilities
    function getStoredData() {
        return safeExecute(() => {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        }, null);
    }

    function saveStoredData(data) {
        safeExecute(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        });
    }

    // UTM parameter extraction
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
            
            return data;
        }, {});
    }

    // Get fbp cookie value from Meta Pixel
    function getFbpCookie() {
        return safeExecute(() => {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === '_fbp') {
                    return value;
                }
            }
            return null;
        }, null);
    }

    // Session management
    function shouldStartNewSession(lastUpdated) {
        if (!lastUpdated) return true;
        const now = Date.now();
        return now - lastUpdated > SESSION_TIMEOUT_MS;
    }

    function isValidTrackerData(data) {
        return data && 
               typeof data === 'object' && 
               data.uuid && 
               data.created_at && 
               data.last_updated;
    }

    // Consent management
    function checkConsent() {
        if (!config.requireConsent) {
            consentGiven = true;
            return true;
        }
        
        // Check localStorage for consent
        const storedConsent = safeExecute(() => {
            return localStorage.getItem(config.consentStorageKey);
        }, null);
        
        consentGiven = storedConsent === 'true';
        logDebug('Consent check', { consentGiven, requireConsent: config.requireConsent });
        return consentGiven;
    }

    function giveConsent() {
        consentGiven = true;
        safeExecute(() => {
            localStorage.setItem(config.consentStorageKey, 'true');
        });
        logDebug('Consent given');
        
        // Initialize tracking if it was pending
        if (pendingInitialization && !isInitialized) {
            logDebug('Starting delayed initialization after consent');
            initializeTracker();
        }
    }

    function revokeConsent() {
        consentGiven = false;
        safeExecute(() => {
            localStorage.removeItem(config.consentStorageKey);
            // Optionally clear tracking data
            localStorage.removeItem(STORAGE_KEY);
        });
        
        // Reset tracker state
        trackerData = null;
        isInitialized = false;
        window.lmvTrackerData = null;
        
        logDebug('Consent revoked and tracking data cleared');
    }

    // Debug logging function
    function logDebug(message, data = null) {
        if (config.debugMode || window.lmvDebugMode || 
            window.location.hostname === 'localhost' || 
            window.location.hostname.includes('dev')) {
            console.log(`🔍 LMV Tracker: ${message}`, data || '');
        }
    }

    // API communication
    async function createOrUpdateSession(sessionData) {
        if (!config.enablePageViewTracking) return true;

        try {
            // Get fbp cookie value
            const fbp = getFbpCookie();
            
            // Prepare UTM parameters to send to API
            const utmParams = {};
            UTM_FIELDS.forEach(field => {
                if (sessionData[field]) {
                    utmParams[field] = sessionData[field];
                }
            });
            
            // Add fbp if available
            if (fbp) {
                utmParams.fbp = fbp;
            }

            const response = await fetch(`${config.apiBaseUrl}/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Application-Type': 'web'
                },
                body: JSON.stringify({
                    uuid: sessionData.uuid,
                    platform: 'web',
                    ...utmParams
                })
            });

            if (response.ok) {
                const data = await response.json();
                logDebug('Session created/updated successfully', data);
                return true;
            } else {
                logDebug('Failed to create/update session', { status: response.status });
                return false;
            }
        } catch (error) {
            logDebug('Session API error', error);
            return false;
        }
    }

    async function logPageViewEvent(sessionData, path, title, utmParams) {
        if (!config.enablePageViewTracking) return true;

        try {
            // Get fbp cookie value for this event
            const fbp = getFbpCookie();
            
            const eventData = {
                uuid: sessionData.uuid,
                event_type: 'view',
                event_name: 'page',
                platform: 'web',
                event_data: {
                    path: path,
                    title: title || document.title,
                },
                // UTM parameters as direct properties (not nested in event_data)
                ...utmParams,
                // Add fbp if available
                ...(fbp && { fbp }),
                ip_address: sessionData.ip_address,
                user_agent: navigator.userAgent,
                referrer: document.referrer || null
            };

            const response = await fetch(`${config.apiBaseUrl}/sessions/${sessionData.uuid}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Application-Type': 'web'
                },
                body: JSON.stringify(eventData)
            });

            if (response.ok) {
                const data = await response.json();
                logDebug('Page view event logged successfully', data);
                return true;
            } else {
                logDebug('Failed to log page view event', { 
                    status: response.status,
                    eventData: eventData
                });
                return false;
            }
        } catch (error) {
            logDebug('Page view event API error', error);
            return false;
        }
    }

    // Link decoration
    function decorateLinks() {
        if (!config.enableLinkDecoration) return 0;

        return safeExecute(() => {
            const links = document.querySelectorAll(`a[href*="${config.targetDomain}"], a[href^="https://${config.paymentDomain}"]`);
            let decoratedCount = 0;
            
            links.forEach(link => {
                try {
                    const url = new URL(link.href);
                    const isTarget = url.hostname === config.targetDomain;
                    const isPayment = url.hostname === config.paymentDomain;

                    if (isTarget) {
                        // Only decorate if not already decorated
                        if (!url.searchParams.has('uuid')) {
                            url.searchParams.set('uuid', trackerData.uuid);
                            
                            UTM_FIELDS.forEach(param => {
                                if (trackerData[param] && !url.searchParams.has(param)) {
                                    url.searchParams.set(param, trackerData[param]);
                                }
                            });
                            
                            // Add fbp if available and not already in URL
                            const fbp = getFbpCookie();
                            if (fbp && !url.searchParams.has('fbp')) {
                                url.searchParams.set('fbp', fbp);
                            }
                            
                            link.href = url.toString();
                            decoratedCount++;
                            
                            logDebug('Decorated app link', { 
                                original: link.href, 
                                decorated: url.toString() 
                            });
                        }
                    } else if (isPayment) {
                        // Set client_reference_id to session UUID for payment links
                        if (!url.searchParams.has('client_reference_id')) {
                            url.searchParams.set('client_reference_id', trackerData.uuid);
                            link.href = url.toString();
                            decoratedCount++;
                            logDebug('Decorated payment link', {
                                original: link.href,
                                decorated: url.toString()
                            });
                        }
                    }
                } catch (error) {
                    console.warn('Failed to decorate link:', link.href, error);
                }
            });
            
            logDebug(`Decorated ${decoratedCount} links`);
            return decoratedCount;
        }, 0);
    }

    // Form field population
    function populateUTMFields() {
        if (!config.enableFormPopulation) return 0;

        return safeExecute(() => {
            let populatedCount = 0;
            
            UTM_FIELDS.forEach(param => {
                if (trackerData[param]) {
                    // Find all elements with the UTM parameter as ID
                    const elements = document.querySelectorAll(`#${param}`);
                    
                    elements.forEach(element => {
                        try {
                            // Handle different input types
                            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                                if (element.type === 'hidden' || element.type === 'text' || element.type === '') {
                                    element.value = trackerData[param];
                                    populatedCount++;
                                    logDebug(`Populated ${param} field`, { 
                                        elementType: element.tagName, 
                                        elementId: element.id, 
                                        value: trackerData[param] 
                                    });
                                }
                            } else if (element.tagName === 'SELECT') {
                                // For select elements, try to find and select the option with matching value
                                const option = Array.from(element.options).find(opt => 
                                    opt.value === trackerData[param] || opt.textContent === trackerData[param]
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
            
            // Also populate fbp field if available from cookie
            const fbp = getFbpCookie();
            if (fbp) {
                const fbpElements = document.querySelectorAll('#fbp');
                fbpElements.forEach(element => {
                    try {
                        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                            if (element.type === 'hidden' || element.type === 'text' || element.type === '') {
                                element.value = fbp;
                                populatedCount++;
                                logDebug('Populated fbp field from cookie', { 
                                    elementType: element.tagName, 
                                    elementId: element.id, 
                                    value: fbp 
                                });
                            }
                        } else if (element.tagName === 'SELECT') {
                            const option = Array.from(element.options).find(opt => 
                                opt.value === fbp || opt.textContent === fbp
                            );
                            if (option) {
                                element.value = option.value;
                                populatedCount++;
                                logDebug('Populated fbp select field from cookie', { 
                                    elementId: element.id, 
                                    selectedValue: option.value 
                                });
                            }
                        }
                    } catch (error) {
                        console.warn('Failed to populate fbp field:', element, error);
                    }
                });
            }
            
            logDebug(`Populated ${populatedCount} UTM fields`);
            return populatedCount;
        }, 0);
    }

    // Dynamic content observer
    function observeDOMChanges() {
        if (!window.MutationObserver) return;
        
        const observer = new MutationObserver((mutations) => {
            let shouldDecorate = false;
            let shouldPopulate = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check for new links
                            if (config.enableLinkDecoration) {
                                const links = node.querySelectorAll ? node.querySelectorAll(`a[href*="${config.targetDomain}"], a[href^="https://${config.paymentDomain}"]`) : [];
                                if (links.length > 0) {
                                    shouldDecorate = true;
                                    logDebug('New links detected in DOM', { count: links.length });
                                }
                            }
                            
                            // Check for new UTM form fields
                            if (config.enableFormPopulation) {
                                const utmFields = node.querySelectorAll ? node.querySelectorAll(UTM_FIELDS.map(field => `#${field}`).join(',')) : [];
                                const fbpFields = node.querySelectorAll ? node.querySelectorAll('#fbp') : [];
                                if (utmFields.length > 0 || fbpFields.length > 0) {
                                    shouldPopulate = true;
                                    logDebug('New UTM form fields detected in DOM', { 
                                        utmCount: utmFields.length,
                                        fbpCount: fbpFields.length
                                    });
                                }
                            }
                        }
                    });
                }
            });
            
            if (shouldDecorate || shouldPopulate) {
                // Debounce to avoid excessive calls
                clearTimeout(window.lmvTrackerTimeout);
                window.lmvTrackerTimeout = setTimeout(() => {
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

    // Main initialization function
    async function initializeTracker() {
        if (isInitialized) return trackerData;
        
        // Check consent before proceeding
        if (!checkConsent()) {
            logDebug('Tracking initialization blocked - consent required but not given');
            pendingInitialization = true;
            return null;
        }

        const stored = getStoredData();
        const now = Date.now();
        const utms = extractUTMsFromURL();
        const hasNewUTMs = Object.keys(utms).length > 0;
        const currentPath = window.location.pathname + window.location.search;
        const currentTitle = document.title;

        // Validate stored data and create new session if needed
        if (!isValidTrackerData(stored) || shouldStartNewSession(stored.last_updated)) {
            trackerData = {
                uuid: generateUUID(),
                created_at: now,
                last_updated: now,
                page_views: 1,
                current_path: currentPath,
                current_title: currentTitle,
                ...(isValidTrackerData(stored) ? stored : {}), // Preserve valid stored data
                ...utms // Include UTM parameters
            };
            logDebug('Created new session', { 
                sessionId: trackerData.uuid, 
                utms: utms,
                path: currentPath
            });
        } else {
            trackerData = {
                ...stored,
                last_updated: now,
                page_views: (stored.page_views || 0) + 1,
                current_path: currentPath,
                current_title: currentTitle
            };
            
            if (hasNewUTMs) {
                Object.assign(trackerData, utms);
                logDebug('Updated UTM parameters', utms);
            }
            
            logDebug('Continued existing session', { 
                uuid: trackerData.uuid, 
                pageViews: trackerData.page_views,
                path: currentPath
            });
        }

        // Capture fbp cookie if available and not already stored
        const fbp = getFbpCookie();
        if (fbp && !trackerData.fbp) {
            trackerData.fbp = fbp;
            logDebug('Captured fbp cookie', { fbp });
        }

        // Save data locally
        saveStoredData(trackerData);

        // Create or update session on backend
        const sessionCreated = await createOrUpdateSession(trackerData);
        
        // Log page view event
        if (sessionCreated) {
            await logPageViewEvent(trackerData, currentPath, currentTitle, utms);
        }

        // Initialize DOM interactions
        const decoratedCount = decorateLinks();
        const populatedCount = populateUTMFields();
        observeDOMChanges();

        // Mark as initialized
        isInitialized = true;

        // Expose data for debugging
        window.lmvTrackerData = trackerData;

        logDebug('Tracker initialized', {
            uuid: trackerData.uuid,
            decoratedLinks: decoratedCount,
            populatedUTMFields: populatedCount,
            utmParams: utms,
            config: config
        });

        return trackerData;
    }

    // Debug functions exposed to window
    function debugCurrentState() {
        const utms = extractUTMsFromURL();
        
        console.group('🔍 LMV Tracker Debug Info');
        console.log('Current Tracker Data:', trackerData);
        console.log('Current URL UTMs:', utms);
        console.log('Current Path:', window.location.pathname + window.location.search);
        console.log('Current Title:', document.title);
        console.log('Configuration:', config);
        console.log('Session Timeout (ms):', SESSION_TIMEOUT_MS);
        console.log('Debug Mode:', window.lmvDebugMode);
        console.groupEnd();
    }

    function debugDecoratedLinks() {
        const links = document.querySelectorAll(`a[href*="${config.targetDomain}"]`);
        console.group('🔗 Decorated Links');
        links.forEach((link, index) => {
            console.log(`Link ${index + 1}:`, {
                text: link.textContent?.trim() || 'No text',
                href: link.href,
                hasSessionUUID: link.href.includes('uuid'),
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

    function debugSession() {
        console.group('📊 Session Debug');
        console.log('Session UUID:', trackerData?.uuid);
        console.log('Created At:', trackerData?.created_at ? new Date(trackerData.created_at) : 'N/A');
        console.log('Last Updated:', trackerData?.last_updated ? new Date(trackerData.last_updated) : 'N/A');
        console.log('Page Views:', trackerData?.page_views);
        console.log('UTM Parameters:', UTM_FIELDS.reduce((acc, field) => {
            if (trackerData?.[field]) acc[field] = trackerData[field];
            return acc;
        }, {}));
        console.groupEnd();
    }

    // Initialize when DOM is ready
    function initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeTracker);
        } else {
            initializeTracker();
        }
    }

    // Expose debug functions and utilities
    window.lmvDebug = debugCurrentState;
    window.lmvDebugLinks = debugDecoratedLinks;
    window.lmvDebugUTMFields = debugUTMFields;
    window.lmvDebugStorage = debugStorage;
    window.lmvDebugSession = debugSession;
    
    // Expose tracker methods for manual use
    window.lmvTracker = {
        getSessionUUID: () => trackerData?.uuid,
        getSessionData: () => trackerData,
        refreshLinks: decorateLinks,
        refreshFields: populateUTMFields,
        reinitialize: initializeTracker,
        // Consent management methods
        giveConsent: giveConsent,
        revokeConsent: revokeConsent,
        hasConsent: () => consentGiven,
        checkConsent: checkConsent
    };
    
    // Watch for debug mode changes
    Object.defineProperty(window, 'lmvDebugMode', {
        get: function() {
            return this._lmvDebugMode || config.debugMode;
        },
        set: function(value) {
            this._lmvDebugMode = Boolean(value);
            if (this._lmvDebugMode) {
                console.log('🔍 LMV Tracker debug mode enabled');
                debugCurrentState();
            }
        }
    });

    // Start the tracker
    initialize();

})();