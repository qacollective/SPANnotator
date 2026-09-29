class SPANnotator {
    constructor() {
        this.fullConfig = null;
        this.config = null;
        this.currentCorpus = null;
        this.inputData = [];
        this.outputData = [];
        this.currentRecordIndex = 0;
        this.selectedSpan = null;
        this.deleteMode = false;
        this.annotations = {};
        this.suggestions = {};
        this.learningData = {};
        this.isSaving = false;
        this.isUpdatingDetailsPanel = false;
        this.isShowingPreview = false;

        // Store event handler references to avoid duplicates
        this.textClickHandler = null;
        this.textMouseupHandler = null;

        // Record locking properties
        this.currentRecordLock = null;
        this.lockRefreshInterval = null;
        this.dataRefreshInterval = null;
        this.allLocks = {};

        // Track the last displayed record to detect navigation
        this.lastDisplayedRecordId = null;

        // Track records where user has made MANUAL annotations (session-only, not persisted)
        // Once a record has a manual annotation, suggestions should be hidden
        this.recordsWithManualAnnotations = new Set();

        // Track records where user has ONLY accepted suggestions (session-only, not persisted)
        // These records should continue showing remaining suggestions
        this.recordsWithOnlyAcceptedSuggestions = new Set();

        // Track the initial decision to show suggestions for each record (per session)
        // Once determined when first entering a record, this decision persists for the session
        this.recordSuggestionVisibility = {};

        // Characters to trim from text selections (leading and trailing)
        this.trimCharacters = ' .,';  // space, period, comma

        // Preview highlight tracking
        this.currentPreview = null;

        // Simple auth mode state
        this.authMode = 'none';
        this.currentUser = null;
        this.pendingLoginUser = null;
        this._resolveIdentityPicker = null;

        // Bind the dropdown hide handler so we can remove it later
        this.hideSuggestionDropdownHandler = (e) => {
            if (!this.suggestionDropdown.contains(e.target)) {
                this.hideSuggestionDropdown();
            }
        };

        this.initializeElements();
        this.loadConfiguration();
        this.setupEventListeners();
    }

    // Helper function to generate local timestamp
    getLocalTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
    }

    initializeElements() {
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.currentRecordSpan = document.getElementById('currentRecord');
        this.totalRecordsSpan = document.getElementById('totalRecords');
        this.annotationCountSpan = document.getElementById('annotationCount');
        this.spanButtonsContainer = document.getElementById('spanButtons');
        this.textContent = document.getElementById('textContent');
        this.pageTitle = document.getElementById('pageTitle');
        this.deleteBtn = document.getElementById('deleteBtn');

        // New tile elements
        this.recordIdSpan = document.getElementById('recordId');
        this.totalAnnotationCountSpan = document.getElementById('totalAnnotationCount');
        this.nextAnnotatedBtn = document.getElementById('nextAnnotatedBtn');
        this.nextUnannotatedBtn = document.getElementById('nextUnannotatedBtn');
        this.lastTrainingRunSpan = document.getElementById('lastTrainingRun');
        this.accuracyPercentSpan = document.getElementById('accuracyPercent');
        this.dataReportBtn = document.getElementById('dataReportBtn');
        this.evaluationReportBtn = document.getElementById('evaluationReportBtn');
        this.searchRecordsBtn = document.getElementById('searchRecordsBtn');
        this.ignoreRecordBtn = document.getElementById('ignoreRecordBtn');
        this.copyLinkBtn = document.getElementById('copyLinkBtn');
        this.externalLookupBtn = document.getElementById('externalLookupBtn');

        // Context tile elements
        this.contextTile = document.getElementById('contextTile');
        this.contextContent = document.getElementById('contextContent');

        // Modal elements
        this.modalDialog = document.getElementById('modalDialog');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalContent = document.getElementById('modalContent');
        this.closeBtn = document.querySelector('.close');

        // Search modal elements
        this.searchModal = document.getElementById('searchModal');
        this.searchModalClose = document.getElementById('searchModalClose');
        this.searchInput = document.getElementById('searchInput');
        this.searchBtn = document.getElementById('searchBtn');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.searchResultsList = document.getElementById('searchResultsList');

        // Side panel elements
        this.hamburgerMenu = document.getElementById('hamburgerMenu');
        this.sidePanel = document.getElementById('sidePanel');
        this.corpusList = document.getElementById('corpusList');
        this.overlay = document.getElementById('overlay');

        // Suggestion dropdown elements
        this.suggestionDropdown = document.getElementById('suggestionDropdown');
        this.suggestionDropdownList = document.getElementById('suggestionDropdownList');

        // Ignore modal elements
        this.ignoreModal = document.getElementById('ignoreModal');
        this.ignoreModalClose = document.getElementById('ignoreModalClose');
        this.ignoreModalTitle = document.getElementById('ignoreModalTitle');
        this.ignoreWarningMessage = document.getElementById('ignoreWarningMessage');
        this.ignoreReasonSelect = document.getElementById('ignoreReasonSelect');
        this.cancelIgnoreBtn = document.getElementById('cancelIgnoreBtn');
        this.confirmIgnoreBtn = document.getElementById('confirmIgnoreBtn');

        // Details panel elements
        this.detailsToggle = document.getElementById('detailsToggle');
        this.detailsPanel = document.getElementById('detailsPanel');
        this.closeDetailsBtn = document.getElementById('closeDetailsBtn');
        this.selectedAnnotationsList = document.getElementById('selectedAnnotationsList');
        this.availableAnnotationsList = document.getElementById('availableAnnotationsList');
        this.availableAnnotationsHeader = document.querySelector('.available-annotations-section h4');

        // Loading overlay elements
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingTitle = document.getElementById('loadingTitle');
        this.loadingMessage = document.getElementById('loadingMessage');
        this.loadingProgressFill = document.getElementById('loadingProgressFill');

        // Current user badge (simple auth mode)
        this.currentUserBadge = document.getElementById('currentUserBadge');
        this.currentUserNameSpan = document.getElementById('currentUserName');
        this.switchUserBtn = document.getElementById('switchUserBtn');

        // Identity picker elements (simple auth mode)
        this.loginOverlay = document.getElementById('loginOverlay');
        this.loginUserList = document.getElementById('loginUserList');
        this.loginPinSection = document.getElementById('loginPinSection');
        this.loginPinUserName = document.getElementById('loginPinUserName');
        this.loginPinInput = document.getElementById('loginPinInput');
        this.loginPinHint = document.getElementById('loginPinHint');
        this.loginBackBtn = document.getElementById('loginBackBtn');
        this.loginSubmitBtn = document.getElementById('loginSubmitBtn');
        this.loginError = document.getElementById('loginError');
    }

    showLoading(message = 'Loading...', progress = 0) {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('hidden');
            this.loadingMessage.textContent = message;
            this.loadingProgressFill.style.width = `${progress}%`;
        }
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    updateLoadingProgress(message, progress) {
        if (this.loadingMessage && this.loadingProgressFill) {
            this.loadingMessage.textContent = message;
            this.loadingProgressFill.style.width = `${progress}%`;
        }
    }

    async loadConfiguration() {
        try {
            this.showLoading('Loading configuration...', 5);

            const response = await fetch('config.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.fullConfig = await response.json();

            // Get corpus from URL parameter or use default
            const urlParams = new URLSearchParams(window.location.search);
            const corpusParam = urlParams.get('corpus');
            this.currentCorpus = corpusParam || this.fullConfig.defaultCorpus || Object.keys(this.fullConfig.corpora)[0];

            // Set the current corpus config
            this.config = this.fullConfig.corpora[this.currentCorpus];
            if (!this.config) {
                throw new Error(`Corpus "${this.currentCorpus}" not found in configuration`);
            }

            this.pageTitle.textContent = this.config.title || 'SPANnotator';

            this.updateLoadingProgress('Checking sign-in...', 8);
            await this.ensureAuthenticated();

            this.updateLoadingProgress('Initializing UI...', 10);

            // Populate corpus list in side panel
            this.populateCorpusList();

            this.createSpanButtons();
            this.populateExcludeReasons();

            // Show/hide context tile based on configuration
            if (this.config.recordContextTemplate) {
                this.contextTile.style.display = 'block';
            } else {
                this.contextTile.style.display = 'none';
            }

            this.updateLoadingProgress('Loading input data...', 20);
            await this.loadInputData();

            this.updateLoadingProgress('Loading annotations...', 40);
            await this.loadOutputData();

            this.updateLoadingProgress('Loading suggestions...', 60);
            await this.loadSuggestionsData();

            this.updateLoadingProgress('Loading analytics...', 75);
            await this.loadLearningData();

            this.updateLoadingProgress('Loading record locks...', 85);
            await this.loadAllLocks();

            this.updateLoadingProgress('Rendering display...', 95);
            await this.displayCurrentRecord();

            // Navigate to specific record if recordId parameter is present
            const recordIdParam = urlParams.get('recordId');
            if (recordIdParam) {
                this.navigateToRecordById(recordIdParam);
            }

            this.updateLoadingProgress('Finalizing...', 100);
            this.startDataRefresh();

            // Hide loading overlay after a brief delay to show 100%
            setTimeout(() => this.hideLoading(), 300);
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.textContent.textContent = 'Error loading configuration. Please check config.json file.';
            this.hideLoading();
        }
    }

    // ------------------------------------------------------------------
    // Simple auth mode: identity picker + current-user badge
    //
    // Windows Authentication and "no auth" modes are handled entirely by
    // the server (every API call is already attributed correctly), so
    // none of this runs unless globalSettings.authMode is "simple".
    // ------------------------------------------------------------------

    async ensureAuthenticated() {
        this.authMode = (this.fullConfig.globalSettings && this.fullConfig.globalSettings.authMode) || 'none';

        if (this.authMode !== 'simple') {
            return;
        }

        try {
            const response = await fetch('api/auth/me');
            const me = await response.json();

            if (me.authenticated) {
                this.currentUser = { username: me.username, displayName: me.displayName };
                this.updateCurrentUserBadge();
                return;
            }
        } catch (error) {
            console.error('Error checking sign-in status:', error);
        }

        // Not signed in yet on this browser: pause loading and show the picker.
        this.hideLoading();
        await this.showIdentityPicker();
        this.showLoading('Resuming...', 8);
    }

    async showIdentityPicker() {
        this.clearLoginError();
        this.showLoginUserList();
        await this.populateLoginUserList();
        this.loginOverlay.classList.remove('hidden');

        return new Promise((resolve) => {
            this._resolveIdentityPicker = resolve;
        });
    }

    async populateLoginUserList() {
        this.loginUserList.innerHTML = '<p class="login-user-list-empty">Loading names&hellip;</p>';

        try {
            const response = await fetch('api/auth/users');
            const data = await response.json();
            this.loginRequirePin = !!data.requirePin;

            this.loginUserList.innerHTML = '';

            if (!data.users || data.users.length === 0) {
                this.loginUserList.innerHTML = '<p class="login-user-list-empty">No users are configured yet. Add some to users.json.</p>';
                return;
            }

            data.users.forEach(user => {
                const button = document.createElement('button');
                button.className = 'login-user-btn';
                button.textContent = user.displayName || user.username;
                button.addEventListener('click', () => this.selectLoginUser(user));
                this.loginUserList.appendChild(button);
            });
        } catch (error) {
            console.error('Error loading user list:', error);
            this.loginUserList.innerHTML = '<p class="login-user-list-empty">Could not load the user list. Please refresh and try again.</p>';
        }
    }

    selectLoginUser(user) {
        this.pendingLoginUser = user;
        this.clearLoginError();

        if (!this.loginRequirePin) {
            this.submitLogin();
            return;
        }

        this.loginUserList.classList.add('hidden');
        this.loginPinUserName.textContent = user.displayName || user.username;
        this.loginPinInput.value = '';
        this.loginPinHint.classList.toggle('hidden', !!user.hasPin);
        this.loginPinSection.classList.remove('hidden');
        this.loginPinInput.focus();
    }

    showLoginUserList() {
        this.pendingLoginUser = null;
        this.loginUserList.classList.remove('hidden');
        this.loginPinSection.classList.add('hidden');
        this.clearLoginError();
    }

    async submitLogin() {
        if (!this.pendingLoginUser) {
            return;
        }

        const pin = this.loginRequirePin ? this.loginPinInput.value.trim() : undefined;
        if (this.loginRequirePin && !pin) {
            this.showLoginError('Please enter your PIN.');
            return;
        }

        this.loginSubmitBtn.disabled = true;
        try {
            const response = await fetch('api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.pendingLoginUser.username, pin })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                this.currentUser = { username: result.username, displayName: result.displayName };
                this.updateCurrentUserBadge();
                this.loginOverlay.classList.add('hidden');

                if (this._resolveIdentityPicker) {
                    this._resolveIdentityPicker();
                    this._resolveIdentityPicker = null;
                }
            } else {
                this.showLoginError(result.error || 'Sign-in failed. Please try again.');
            }
        } catch (error) {
            console.error('Error signing in:', error);
            this.showLoginError('Sign-in failed. Please check your connection and try again.');
        } finally {
            this.loginSubmitBtn.disabled = false;
        }
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.classList.remove('hidden');
    }

    clearLoginError() {
        this.loginError.textContent = '';
        this.loginError.classList.add('hidden');
    }

    updateCurrentUserBadge() {
        if (this.authMode !== 'simple' || !this.currentUser) {
            this.currentUserBadge.classList.add('hidden');
            return;
        }

        this.currentUserNameSpan.textContent = this.currentUser.displayName || this.currentUser.username;
        this.currentUserBadge.classList.remove('hidden');
    }

    async handleSwitchUser() {
        try {
            await fetch('api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Error signing out:', error);
        }

        this.currentUser = null;
        this.updateCurrentUserBadge();

        // Reloading re-runs the full loadConfiguration() flow, which will show the
        // identity picker again since there's no longer a valid session cookie.
        window.location.reload();
    }

    createSpanButtons() {
        this.spanButtonsContainer.innerHTML = '';
        this.generateSpanStyles();

        this.config.spanNames.forEach((spanName, index) => {
            const button = document.createElement('button');
            button.className = 'span-button';
            button.textContent = spanName;
            button.dataset.span = spanName;
            button.dataset.spanIndex = index;
            button.addEventListener('click', () => this.selectSpan(spanName, button));
            this.spanButtonsContainer.appendChild(button);
        });
    }

    generateSpanStyles() {
        // Remove existing dynamic styles
        const existingStyle = document.getElementById('dynamic-span-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Create new style element
        const style = document.createElement('style');
        style.id = 'dynamic-span-styles';

        // Define color palette
        this.spanColors = [
            'rgba(231, 76, 60, 0.3)',   // Red
            'rgba(52, 152, 219, 0.3)',  // Blue
            'rgba(46, 204, 113, 0.3)',  // Green
            'rgba(243, 156, 18, 0.3)',  // Orange
            'rgba(155, 89, 182, 0.3)',  // Purple
            'rgba(26, 188, 156, 0.3)',  // Teal
            'rgba(230, 126, 34, 0.3)',  // Dark Orange
            'rgba(52, 73, 94, 0.3)',    // Dark Gray
            'rgba(241, 196, 15, 0.3)',  // Yellow
            'rgba(231, 76, 60, 0.3)'    // Red (cycle back)
        ];

        let css = '';
        this.config.spanNames.forEach((spanName, index) => {
            const colorIndex = index % this.spanColors.length;
            css += `.annotation-span-${index} { background-color: ${this.spanColors[colorIndex]}; }\n`;
        });

        style.textContent = css;
        document.head.appendChild(style);
    }

    populateExcludeReasons() {
        // Clear existing options except the default one
        this.ignoreReasonSelect.innerHTML = '<option value="">-- Select a reason --</option>';

        // Get exclude reasons from config (fall back to default list if not specified)
        const excludeReasons = this.config.excludeReasons || [
            'Duplicate record',
            'Insufficient information',
            'Out of scope',
            'Data quality issue',
            'Other'
        ];

        // Add each reason as an option
        excludeReasons.forEach(reason => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            this.ignoreReasonSelect.appendChild(option);
        });
    }

    renderContextPanel(record) {
        // Only render if template is configured
        if (!this.config.recordContextTemplate || !this.contextContent) {
            return;
        }

        let template = this.config.recordContextTemplate;

        // Find all placeholders in format [ColumnName] and replace with record values
        // Using regex to match [anything inside brackets]
        const processedTemplate = template.replace(/\[([^\]]+)\]/g, (match, columnName) => {
            // Check if the column exists in the record
            if (record.hasOwnProperty(columnName) && record[columnName] != null) {
                return record[columnName];
            } else {
                // Column doesn't exist or is null - leave placeholder as-is
                return match;
            }
        });

        // Set the innerHTML (supports HTML formatting)
        this.contextContent.innerHTML = processedTemplate;
    }

    async loadInputData() {
        try {
            const response = await fetch(this.config.inputCsvFile);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();
            this.inputData = this.parseCSV(csvText);
            this.totalRecordsSpan.textContent = this.inputData.length;
        } catch (error) {
            console.error('Error loading input data:', error);
            this.textContent.textContent = `Error loading input file: ${this.config.inputCsvFile}. Please ensure the file exists and is accessible.`;
        }
    }

    async loadOutputData() {
        try {
            const response = await fetch(this.config.outputCsvFile);
            if (response.ok) {
                const csvText = await response.text();
                console.log('Loaded output CSV:', csvText.substring(0, 200) + '...'); // Debug log
                this.outputData = this.parseCSV(csvText);
                console.log('Parsed output data rows:', this.outputData.length); // Debug log
                this.loadExistingAnnotations();
            } else {
                console.log('Output file not found, starting with empty annotations');
                this.outputData = [];
            }
            this.updateAnnotationCount();
        } catch (error) {
            console.error('Output file not found or error loading:', error);
            this.outputData = [];
            this.updateAnnotationCount();
        }
    }

    async loadSuggestionsData() {
        try {
            const response = await fetch(this.config.suggestionsCsvFile);
            if (response.ok) {
                const csvText = await response.text();
                const suggestionsData = this.parseCSV(csvText);
                this.loadSuggestions(suggestionsData);
            } else {
                console.log('No suggestions file found');
            }
        } catch (error) {
            console.log('Suggestions file not found or error loading:', error);
        }
    }

    async loadLearningData() {
        try {
            const response = await fetch(this.config.resultsJsonFile);
            if (response.ok) {
                const jsonText = await response.text();
                this.learningData = JSON.parse(jsonText);
                this.updateLearningTile();
            } else {
                console.log('No results.json file found');
                this.learningData = {};
                this.updateLearningTile();
            }
        } catch (error) {
            console.log('Learning data file not found or error loading:', error);
            this.learningData = {};
            this.updateLearningTile();
        }
    }

    parseCSV(csvText) {
        const text = csvText.trim();
        if (text.length === 0) return [];

        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;
        let i = 0;

        while (i < text.length) {
            const char = text[i];

            if (char === '"') {
                if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
                    // Escaped quote within quoted field
                    currentField += '"';
                    i += 2;
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === ',' && !inQuotes) {
                // Field separator
                currentRow.push(currentField.trim());
                currentField = '';
                i++;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // Record separator (only when not in quotes)
                currentRow.push(currentField.trim());
                if (currentRow.length > 0 && (currentRow[0] !== '' || currentRow.some(field => field !== ''))) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                // Skip \r\n combinations
                if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                    i += 2;
                } else {
                    i++;
                }
            } else {
                // Regular character
                currentField += char;
                i++;
            }
        }

        // Handle last field/row
        if (currentField !== '' || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.length > 0 && (currentRow[0] !== '' || currentRow.some(field => field !== ''))) {
                rows.push(currentRow);
            }
        }

        if (rows.length === 0) return [];

        // Process headers and data
        const headers = rows[0].map(h => h.replace(/^"|"$/g, ''));
        const data = [];

        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].map(v => v.replace(/^"|"$/g, ''));
            if (values.length > 0 && values[0].trim() !== '') {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                data.push(row);
            }
        }

        return data;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    loadExistingAnnotations() {
        this.annotations = {};
        console.log('Loading existing annotations from', this.outputData.length, 'rows'); // Debug log

        this.outputData.forEach(row => {
            // Output CSV uses fixed column names: id,span,text,start,end,timestamp,username
            const recordId = row.id; // Use 'id' instead of this.config.idColumnName
            console.log('Processing annotation row for record:', recordId, row); // Debug log

            // Validate required fields - handle empty strings and undefined values better
            const span = row.span ? row.span.trim() : '';
            const text = row.text ? row.text.trim() : '';
            const start = row.start ? row.start.toString().trim() : '';
            const end = row.end ? row.end.toString().trim() : '';

            if (!recordId || !span) {
                console.warn('Skipping invalid annotation row (missing recordId or span):', row);
                return;
            }

            // Regular annotations need text, start, and end
            if (!text || !start || !end || isNaN(parseInt(start)) || isNaN(parseInt(end))) {
                console.warn('Skipping invalid regular annotation row:', row);
                return;
            }

            if (!this.annotations[recordId]) {
                this.annotations[recordId] = [];
            }

            this.annotations[recordId].push({
                span: span,
                text: text,
                start: parseInt(start),
                end: parseInt(end),
                username: row.username || 'Unknown',
                timestamp: row.timestamp
            });
        });

        console.log('Loaded annotations for records:', Object.keys(this.annotations)); // Debug log
    }

    loadSuggestions(suggestionsData) {
        this.suggestions = {};
        suggestionsData.forEach(row => {
            // Suggestions CSV uses fixed column names: id,span,text,start,end,timestamp,username
            // Optional: score
            const recordId = row.id;

            // Validate required fields
            // Note: span is optional when using suggestionsConfineAnnotations mode
            if (!row.text || isNaN(parseInt(row.start)) || isNaN(parseInt(row.end))) {
                console.warn('Skipping invalid suggestion row:', row);
                return;
            }

            if (!this.suggestions[recordId]) {
                this.suggestions[recordId] = [];
            }
            // Normalize span name by replacing underscores with spaces to match config
            const normalizedSpan = row.span ? row.span.replace(/_/g, ' ') : '';
            const suggestionObj = {
                span: normalizedSpan,
                text: row.text,
                start: parseInt(row.start),
                end: parseInt(row.end),
                username: row.username || 'ai'
            };
            // Add score if present in CSV
            if (row.score !== undefined && row.score !== null && row.score !== '') {
                suggestionObj.score = row.score;
            }
            this.suggestions[recordId].push(suggestionObj);
        });
        console.log('Loaded suggestions:', this.suggestions);
    }

    updateAnnotationCount() {
        const uniqueRecords = new Set(this.outputData.map(row => row.id));
        this.annotationCountSpan.textContent = uniqueRecords.size;
        this.totalAnnotationCountSpan.textContent = this.outputData.length;
    }

    updateLearningTile() {
        this.lastTrainingRunSpan.textContent = this.learningData.lastTrainingRun || '-';
        this.accuracyPercentSpan.textContent = this.learningData.accuracyPercent ?
            this.learningData.accuracyPercent + '%' : '-';

        // Enable/disable report buttons based on data availability
        this.dataReportBtn.disabled = !this.learningData.dataReport;
        this.evaluationReportBtn.disabled = !this.learningData.evaluationReport;
    }

    setupEventListeners() {
        // Identity picker / current-user badge event listeners (simple auth mode)
        this.switchUserBtn.addEventListener('click', () => this.handleSwitchUser());
        this.loginBackBtn.addEventListener('click', () => this.showLoginUserList());
        this.loginSubmitBtn.addEventListener('click', () => this.submitLogin());
        this.loginPinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submitLogin();
            }
        });

        this.prevBtn.addEventListener('click', () => this.navigateRecord(-1));
        this.nextBtn.addEventListener('click', () => this.navigateRecord(1));
        this.deleteBtn.addEventListener('click', () => this.toggleDeleteMode());
        this.nextAnnotatedBtn.addEventListener('click', () => this.navigateToNextAnnotated());
        this.nextUnannotatedBtn.addEventListener('click', () => this.navigateToNextUnannotated());
        this.searchRecordsBtn.addEventListener('click', () => this.openSearchModal());
        this.ignoreRecordBtn.addEventListener('click', () => this.toggleExcludeRecord());

        // Record ID interaction event listeners
        this.recordIdSpan.addEventListener('click', () => this.copyRecordIdToClipboard());
        this.copyLinkBtn.addEventListener('click', () => this.copyRecordLinkToClipboard());
        this.externalLookupBtn.addEventListener('click', () => this.openExternalLookup());

        // Report button event listeners
        this.dataReportBtn.addEventListener('click', () => this.showReport('Data Report', this.learningData.dataReport));
        this.evaluationReportBtn.addEventListener('click', () => this.showReport('Evaluation Report', this.learningData.evaluationReport));

        // Modal close event listeners
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.modalDialog.addEventListener('click', (e) => {
            if (e.target === this.modalDialog) {
                this.closeModal();
            }
        });

        // Search modal event listeners
        this.searchModalClose.addEventListener('click', () => this.closeSearchModal());
        this.searchModal.addEventListener('click', (e) => {
            if (e.target === this.searchModal) {
                this.closeSearchModal();
            }
        });
        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
        this.searchInput.addEventListener('input', () => {
            if (this.searchInput.value.trim() === '') {
                this.clearSearchResults();
            }
        });

        // Ignore modal event listeners
        this.ignoreModalClose.addEventListener('click', () => this.closeIgnoreModal());
        this.cancelIgnoreBtn.addEventListener('click', () => this.closeIgnoreModal());
        this.confirmIgnoreBtn.addEventListener('click', () => this.confirmExcludeRecord());
        this.ignoreModal.addEventListener('click', (e) => {
            if (e.target === this.ignoreModal) {
                this.closeIgnoreModal();
            }
        });

        // Details panel event listeners
        this.detailsToggle.addEventListener('click', () => this.toggleDetailsPanel());
        this.closeDetailsBtn.addEventListener('click', () => this.closeDetailsPanel());

        // Add handler to clear preview when mouse leaves available annotations list
        this.availableAnnotationsList.addEventListener('mouseleave', () => {
            this.hideSuggestionPreview();
        });

        // Also clear preview when entering other sections of the panel
        this.selectedAnnotationsList.addEventListener('mouseenter', () => {
            this.hideSuggestionPreview();
        });

        // Clear preview when entering the section headers
        const selectedAnnotationsSection = document.querySelector('.selected-annotations-section');
        if (selectedAnnotationsSection) {
            selectedAnnotationsSection.addEventListener('mouseenter', () => {
                this.hideSuggestionPreview();
            });
        }

        const detailsPanelHeader = document.querySelector('.details-panel-header');
        if (detailsPanelHeader) {
            detailsPanelHeader.addEventListener('mouseenter', () => {
                this.hideSuggestionPreview();
            });
        }

        // Clear preview when mouse enters main text display or container
        const textDisplay = document.querySelector('.text-display');
        if (textDisplay) {
            textDisplay.addEventListener('mouseenter', () => {
                this.hideSuggestionPreview();
            });
        }

        const container = document.querySelector('.container');
        if (container) {
            container.addEventListener('mouseenter', () => {
                this.hideSuggestionPreview();
            });
        }

        // Instructions modal event listener
        this.pageTitle.addEventListener('click', () => this.showInstructions());

        // Side panel event listeners
        this.hamburgerMenu.addEventListener('click', () => this.toggleSidePanel());
        this.overlay.addEventListener('click', () => this.closeSidePanel());

        document.addEventListener('keydown', (e) => {
            // Don't hijack navigation/span-select shortcuts while the user is typing into a
            // field (the search box, the PIN input, etc.) - e.g. entering a numeric PIN
            // shouldn't also select span types 1-9 in the background.
            const activeTag = document.activeElement && document.activeElement.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
                return;
            }

            if (e.key === 'ArrowLeft') this.navigateRecord(-1);
            if (e.key === 'ArrowRight') this.navigateRecord(1);
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                if (index < this.config.spanNames.length) {
                    const button = this.spanButtonsContainer.children[index];
                    this.selectSpan(this.config.spanNames[index], button);
                }
            }
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Cleanup on page visibility change (when user switches tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // User switched away from tab - don't release lock immediately
                // but stop refreshing it
                this.stopLockRefresh();
            } else {
                // User came back to tab - restart lock refresh if we have a lock
                if (this.currentRecordLock) {
                    this.startLockRefresh();
                }
            }
        });
    }

    cleanup() {
        // Release current lock
        if (this.currentRecordLock) {
            // Use sendBeacon for more reliable delivery during page unload
            const data = JSON.stringify({
                recordId: this.currentRecordLock.recordId,
                corpus: this.currentCorpus
            });
            navigator.sendBeacon('api/record-lock/release', data);
        }

        // Stop intervals
        this.stopLockRefresh();
        this.stopDataRefresh();
    }

    async navigateRecord(direction) {
        if (this.isSaving) {
            console.log('Navigation blocked: annotation save in progress');
            return;
        }
        const newIndex = this.currentRecordIndex + direction;
        if (newIndex >= 0 && newIndex < this.inputData.length) {
            this.currentRecordIndex = newIndex;
            await this.displayCurrentRecord();
        }
        this.updateNavigationButtons();
    }

    async navigateToRecordById(recordId) {
        if (this.isSaving) {
            console.log('Navigation blocked: annotation save in progress');
            return;
        }
        // Find the index of the record with the given ID
        const recordIndex = this.inputData.findIndex(record =>
            record[this.config.idColumnName] === recordId
        );

        if (recordIndex !== -1) {
            this.currentRecordIndex = recordIndex;
            await this.displayCurrentRecord();
            this.updateNavigationButtons();
        } else {
            console.warn(`Record with ID "${recordId}" not found`);
        }
    }

    updateNavigationButtons() {
        this.prevBtn.disabled = this.currentRecordIndex === 0;
        this.nextBtn.disabled = this.currentRecordIndex === this.inputData.length - 1;
    }

    async navigateToNextAnnotated() {
        if (this.isSaving) {
            console.log('Navigation blocked: annotation save in progress');
            return;
        }
        for (let i = this.currentRecordIndex + 1; i < this.inputData.length; i++) {
            const recordId = this.inputData[i][this.config.idColumnName];
            if (this.annotations[recordId] && this.annotations[recordId].length > 0) {
                this.currentRecordIndex = i;
                await this.displayCurrentRecord();
                return;
            }
        }

        // If no annotated records found after current, search from beginning
        for (let i = 0; i < this.currentRecordIndex; i++) {
            const recordId = this.inputData[i][this.config.idColumnName];
            if (this.annotations[recordId] && this.annotations[recordId].length > 0) {
                this.currentRecordIndex = i;
                await this.displayCurrentRecord();
                return;
            }
        }

        // If no annotated records found at all
        alert('No annotated records found!');
    }

    async navigateToNextUnannotated() {
        if (this.isSaving) {
            console.log('Navigation blocked: annotation save in progress');
            return;
        }
        for (let i = this.currentRecordIndex + 1; i < this.inputData.length; i++) {
            const recordId = this.inputData[i][this.config.idColumnName];
            if (!this.annotations[recordId] || this.annotations[recordId].length === 0) {
                this.currentRecordIndex = i;
                await this.displayCurrentRecord();
                return;
            }
        }

        // If no unannotated records found after current, search from beginning
        for (let i = 0; i < this.currentRecordIndex; i++) {
            const recordId = this.inputData[i][this.config.idColumnName];
            if (!this.annotations[recordId] || this.annotations[recordId].length === 0) {
                this.currentRecordIndex = i;
                await this.displayCurrentRecord();
                return;
            }
        }

        // If no unannotated records found at all
        alert('All records have been annotated!');
    }

    async showReport(title, contentPath) {
        if (!contentPath) {
            alert('Report not available');
            return;
        }

        this.modalTitle.textContent = title;

        try {
            const response = await fetch(contentPath);
            if (response.ok) {
                const htmlContent = await response.text();
                this.modalContent.innerHTML = htmlContent;
                this.modalDialog.style.display = 'block';
            } else {
                console.error('Failed to load report:', response.statusText);
                this.modalContent.textContent = 'Failed to load report';
                this.modalDialog.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading report:', error);
            this.modalContent.textContent = 'Error loading report';
            this.modalDialog.style.display = 'block';
        }
    }

    closeModal() {
        this.modalDialog.style.display = 'none';
    }

    async showInstructions() {
        if (this.config && this.config.instructions) {
            this.modalTitle.textContent = 'Instructions';

            try {
                const response = await fetch(this.config.instructions);
                if (response.ok) {
                    const htmlContent = await response.text();
                    this.modalContent.innerHTML = htmlContent;
                    this.modalDialog.style.display = 'block';
                } else {
                    console.error('Failed to load instructions:', response.statusText);
                    this.modalContent.textContent = 'Failed to load instructions';
                    this.modalDialog.style.display = 'block';
                }
            } catch (error) {
                console.error('Error loading instructions:', error);
                this.modalContent.textContent = 'Error loading instructions';
                this.modalDialog.style.display = 'block';
            }
        }
    }

    // Search modal methods
    openSearchModal() {
        this.searchModal.style.display = 'block';
        this.searchInput.focus();
    }

    closeSearchModal() {
        this.searchModal.style.display = 'none';
        this.clearSearch();
    }

    clearSearch() {
        this.searchInput.value = '';
        this.clearSearchResults();
    }

    clearSearchResults() {
        this.searchResultsList.innerHTML = '<p class="no-results">Enter a search term to find records</p>';
    }

    getSelectedSearchType() {
        const selectedRadio = document.querySelector('input[name="searchType"]:checked');
        return selectedRadio ? selectedRadio.value : 'id';
    }

    performSearch() {
        const searchTerm = this.searchInput.value.trim();
        if (!searchTerm) {
            this.clearSearchResults();
            return;
        }

        const searchType = this.getSelectedSearchType();
        let results = [];

        switch (searchType) {
            case 'id':
                results = this.searchByRecordId(searchTerm);
                break;
            case 'position':
                results = this.searchByPosition(searchTerm);
                break;
            case 'text':
                results = this.searchByText(searchTerm);
                break;
        }

        this.displaySearchResults(results, searchTerm, searchType);
    }

    searchByRecordId(searchTerm) {
        const results = [];
        const searchLower = searchTerm.toLowerCase();

        this.inputData.forEach((record, index) => {
            const recordId = record[this.config.idColumnName];
            if (recordId && recordId.toString().toLowerCase().includes(searchLower)) {
                results.push({
                    record: record,
                    index: index,
                    recordId: recordId,
                    matchType: 'id',
                    matchText: recordId
                });
            }
        });

        return results;
    }

    searchByPosition(searchTerm) {
        const position = parseInt(searchTerm);
        if (isNaN(position) || position < 1 || position > this.inputData.length) {
            return [];
        }

        const index = position - 1; // Convert to 0-based index
        const record = this.inputData[index];

        return [{
            record: record,
            index: index,
            recordId: record[this.config.idColumnName],
            matchType: 'position',
            matchText: position.toString()
        }];
    }

    searchByText(searchTerm) {
        const results = [];
        const searchLower = searchTerm.toLowerCase();

        this.inputData.forEach((record, index) => {
            const text = record[this.config.textColumnName] || '';
            if (text.toLowerCase().includes(searchLower)) {
                results.push({
                    record: record,
                    index: index,
                    recordId: record[this.config.idColumnName],
                    matchType: 'text',
                    matchText: text
                });
            }
        });

        return results;
    }

    displaySearchResults(results, searchTerm, searchType) {
        if (results.length === 0) {
            this.searchResultsList.innerHTML = `<p class="no-results">No records found matching "${searchTerm}"</p>`;
            return;
        }

        let html = '';
        results.forEach(result => {
            const annotationCount = this.annotations[result.recordId] ? this.annotations[result.recordId].length : 0;
            const isIgnored = this.isRecordIgnored(result.recordId);
            const statusBadge = isIgnored ? '<span style="color: #f39c12;">●</span> Ignored' :
                                annotationCount > 0 ? `<span style="color: #27ae60;">●</span> ${annotationCount} annotations` :
                                '<span style="color: #95a5a6;">●</span> No annotations';

            let displayText = '';
            if (searchType === 'text') {
                // Highlight the search term in the text
                displayText = this.highlightSearchTerm(result.matchText, searchTerm);
                // Truncate if too long
                if (displayText.length > 200) {
                    const highlightIndex = displayText.toLowerCase().indexOf(searchTerm.toLowerCase());
                    const start = Math.max(0, highlightIndex - 100);
                    const end = Math.min(displayText.length, highlightIndex + searchTerm.length + 100);
                    displayText = (start > 0 ? '...' : '') +
                                 displayText.substring(start, end) +
                                 (end < result.matchText.length ? '...' : '');
                }
            } else {
                displayText = result.matchText;
            }

            html += `
                <div class="search-result-item" data-index="${result.index}">
                    <div class="result-header">
                        <span class="result-id">ID: ${result.recordId}</span>
                        <span class="result-position">Position: ${result.index + 1}</span>
                    </div>
                    <div class="result-text">${displayText}</div>
                    <div style="margin-top: 8px; font-size: 0.85em; color: #7f8c8d;">${statusBadge}</div>
                </div>
            `;
        });

        this.searchResultsList.innerHTML = html;

        // Add click handlers to result items
        this.searchResultsList.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.navigateToSearchResult(index);
            });
        });
    }

    highlightSearchTerm(text, searchTerm) {
        const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async navigateToSearchResult(index) {
        if (index >= 0 && index < this.inputData.length) {
            this.currentRecordIndex = index;
            this.closeSearchModal();
            await this.displayCurrentRecord();
        }
    }

    async displayCurrentRecord(skipPanelUpdate = false) {
        if (this.inputData.length === 0) {
            this.textContent.textContent = 'No data loaded.';
            return;
        }

        const record = this.inputData[this.currentRecordIndex];
        this.currentRecordSpan.textContent = this.currentRecordIndex + 1;
        const recordId = record[this.config.idColumnName];
        this.recordIdSpan.textContent = recordId;

        // Check if we're switching to a different record
        const isNewRecord = this.lastDisplayedRecordId !== recordId;
        if (isNewRecord) {
            // Refresh output data to ensure we have the latest annotations
            await this.loadOutputData();
            this.lastDisplayedRecordId = recordId;

            // When navigating to a different record, clear the "only accepted suggestions" flag
            // This ensures that if we come back to a record with annotations, suggestions are hidden
            // The flag will be re-set if the user accepts a suggestion on this record
            if (this.recordsWithOnlyAcceptedSuggestions.has(recordId)) {
                // Check if this record still has annotations - if yes, don't show suggestions anymore
                const nonIgnoreAnns = this.annotations[recordId] ?
                    this.annotations[recordId].filter(ann => ann.span !== 'IGNORE') : [];
                if (nonIgnoreAnns.length > 0) {
                    // Record has annotations, so clear the flag to prevent suggestions from showing
                    this.recordsWithOnlyAcceptedSuggestions.delete(recordId);
                }
            }
        }

        // Render context panel if template is configured
        if (this.config.recordContextTemplate) {
            this.renderContextPanel(record);
        }

        // Handle record locking
        await this.handleRecordLocking(recordId);

        let text = record[this.config.textColumnName] || '';

        // Combine annotations and suggestions for display
        const allAnnotations = [];

        // Add regular annotations (but exclude IGNORE annotations from display)
        if (this.annotations[recordId] && this.annotations[recordId].length > 0) {
            this.annotations[recordId].forEach(annotation => {
                if (annotation.span !== 'IGNORE') {
                    let isOutOfAlignment = false;

                    // If suggestionsConfineAnnotations is enabled, check if this annotation matches any suggestion
                    if (this.config.suggestionsConfineAnnotations) {
                        // If there are suggestions for this record, check if annotation matches any
                        if (this.suggestions[recordId] && this.suggestions[recordId].length > 0) {
                            const matchesSuggestion = this.suggestions[recordId].some(suggestion => {
                                return parseInt(annotation.start) === parseInt(suggestion.start) &&
                                       parseInt(annotation.end) === parseInt(suggestion.end);
                            });

                            // If annotation doesn't match any suggestion, mark it as out of alignment
                            isOutOfAlignment = !matchesSuggestion;
                        } else {
                            // No suggestions exist for this record, so any annotation is out of alignment
                            isOutOfAlignment = true;
                        }
                    }

                    allAnnotations.push({...annotation, isSuggestion: false, isOutOfAlignment: isOutOfAlignment});
                }
            });
        }

        // Suggestion display rules:
        // 1. If record has NO annotations → show all suggestions (except already accepted ones)
        // 2. If record has any existing annotations (from previous sessions) → hide all suggestions
        //    UNLESS user has accepted suggestions in this session (then keep showing remaining)
        // 3. If record has annotations from manual selections (this session) → hide all suggestions
        const nonIgnoreAnnotations = this.annotations[recordId] ?
            this.annotations[recordId].filter(ann => ann.span !== 'IGNORE') : [];

        // Determine whether to show suggestions:
        // - For NEW records: calculate based on current state and cache the decision
        // - For SAME record (redisplay): use the cached decision
        let shouldShowSuggestions;
        if (isNewRecord) {
            // Calculate suggestion visibility for the first time on this record
            const hasAnnotations = nonIgnoreAnnotations.length > 0;
            const hasManualAnnotation = this.recordsWithManualAnnotations.has(recordId);
            const hasOnlyAcceptedSuggestions = this.recordsWithOnlyAcceptedSuggestions.has(recordId);

            // Show suggestions if:
            // - No annotations at all, OR
            // - Has annotations but ONLY from accepted suggestions in this session (not manual)
            shouldShowSuggestions = !hasAnnotations || (hasOnlyAcceptedSuggestions && !hasManualAnnotation);

            // Cache this decision for the duration of the session on this record
            this.recordSuggestionVisibility[recordId] = shouldShowSuggestions;
        } else {
            // Use the cached decision from when we first entered this record
            shouldShowSuggestions = this.recordSuggestionVisibility[recordId] !== undefined
                ? this.recordSuggestionVisibility[recordId]
                : false; // Default to false if somehow not cached
        }

        if (shouldShowSuggestions && this.suggestions[recordId] && this.suggestions[recordId].length > 0) {
            this.suggestions[recordId].forEach(suggestion => {
                // Only display suggestions that have a span name (old-style clickable suggestions)
                // Suggestions without span names are only accessible via the dropdown (new workflow)
                if (!suggestion.span || suggestion.span.trim() === '') {
                    return; // Skip display for suggestions without span names
                }

                // Only show suggestion if it hasn't already been accepted as an annotation
                const alreadyAccepted = nonIgnoreAnnotations.some(annotation => {
                    const spanMatch = annotation.span === suggestion.span;
                    const startMatch = parseInt(annotation.start) === parseInt(suggestion.start);
                    const endMatch = parseInt(annotation.end) === parseInt(suggestion.end);
                    const textMatch = annotation.text === suggestion.text;

                    // Debug logging
                    if (spanMatch && startMatch && endMatch) {
                        console.log('Suggestion match found:', {
                            suggestion: suggestion,
                            annotation: annotation,
                            spanMatch, startMatch, endMatch, textMatch
                        });
                    }

                    return spanMatch && startMatch && endMatch && textMatch;
                });

                if (!alreadyAccepted) {
                    allAnnotations.push({...suggestion, isSuggestion: true});
                }
            });
        }

        // Check if record is ignored and apply strikethrough
        const isIgnored = this.isRecordIgnored(recordId);

        if (allAnnotations.length > 0 || this.currentPreview) {
            text = this.applyMixedAnnotations(text, allAnnotations);
        }

        if (isIgnored) {
            // Apply strikethrough styling to the entire text
            this.textContent.innerHTML = `<div class="ignored-record">${text}</div>`;
        } else {
            this.textContent.innerHTML = text;
        }

        this.updateNavigationButtons();
        this.setupTextSelection();

        // Update details panel if open (but not if we're already updating to prevent infinite loop)
        // Also skip if we're just showing/hiding a preview to avoid recreating DOM elements
        if (!skipPanelUpdate && this.detailsPanel.classList.contains('open') && !this.isUpdatingDetailsPanel && !this.isShowingPreview) {
            this.updateDetailsPanel();
        }
    }

    applyAnnotations(text, annotations, isSuggestion = false) {
        let result = text;
        const sortedAnnotations = [...annotations].sort((a, b) => b.start - a.start);

        sortedAnnotations.forEach(annotation => {
            // Skip annotations with invalid span data
            if (!annotation.span || typeof annotation.span !== 'string') {
                console.warn('Skipping annotation with invalid span:', annotation);
                return;
            }

            const before = result.substring(0, annotation.start);
            const annotatedText = result.substring(annotation.start, annotation.end);
            const after = result.substring(annotation.end);

            const spanIndex = this.config.spanNames.indexOf(annotation.span);
            const spanClass = spanIndex >= 0 ? `annotation-span-${spanIndex}` : 'annotation-span-0';
            const suggestionClass = isSuggestion ? ' suggestion' : '';
            const suggestionData = isSuggestion ? ` data-suggestion="true" data-start="${annotation.start}" data-end="${annotation.end}"` : '';

            result = before +
                    `<span class="annotation ${spanClass}${suggestionClass}" data-span="${annotation.span}"${suggestionData}>${annotatedText}</span>` +
                    after;
        });

        return result;
    }

    applyMixedAnnotations(text, allAnnotations) {
        // Add preview highlight if it exists
        let annotations = allAnnotations || [];
        if (this.currentPreview) {
            // Add the preview as a temporary annotation
            annotations = [...annotations, {
                span: '',  // Empty span for preview
                start: this.currentPreview.start,
                end: this.currentPreview.end,
                isPreview: true
            }];
        }

        if (!annotations || annotations.length === 0) {
            return text;
        }

        // Filter out invalid annotations
        const validAnnotations = annotations.filter(annotation => {
            // Allow preview annotations without span validation
            if (annotation.isPreview) {
                return true;
            }

            if (!annotation.span || typeof annotation.span !== 'string') {
                console.warn('Skipping annotation with invalid span:', annotation);
                return false;
            }

            // Check for valid position bounds
            if (annotation.start < 0 || annotation.end > text.length) {
                console.warn('Skipping annotation with out-of-bounds positions:', annotation);
                return false;
            }

            // Check that annotation contains text (start < end)
            if (annotation.start >= annotation.end) {
                console.warn('Skipping empty annotation (start >= end):', annotation);
                return false;
            }

            // Check that the annotated text is not empty or just whitespace
            const annotatedText = text.substring(annotation.start, annotation.end);
            if (!annotatedText || annotatedText.trim().length === 0) {
                console.warn('Skipping annotation with no visible text:', annotation);
                return false;
            }

            return true;
        });

        if (validAnnotations.length === 0) {
            return text;
        }

        // Create events for annotation starts and ends
        const events = [];
        validAnnotations.forEach((annotation, index) => {
            events.push({
                position: annotation.start,
                type: 'start',
                annotation: annotation,
                index: index
            });
            events.push({
                position: annotation.end,
                type: 'end',
                annotation: annotation,
                index: index
            });
        });

        // Sort events by position, with ends before starts at the same position
        events.sort((a, b) => {
            if (a.position !== b.position) {
                return a.position - b.position;
            }
            // At same position, process ends before starts to avoid empty spans
            if (a.type === 'end' && b.type === 'start') return -1;
            if (a.type === 'start' && b.type === 'end') return 1;
            // If both are starts, process longer spans first (to nest properly)
            if (a.type === 'start' && b.type === 'start') {
                return (b.annotation.end - b.annotation.start) - (a.annotation.end - a.annotation.start);
            }
            // If both are ends, process shorter spans first
            if (a.type === 'end' && b.type === 'end') {
                return (a.annotation.end - a.annotation.start) - (b.annotation.end - b.annotation.start);
            }
            return 0;
        });

        let result = '';
        let currentPosition = 0;
        const openSpans = []; // Stack of open spans

        events.forEach(event => {
            // Add text between current position and event position
            if (event.position > currentPosition) {
                result += this.escapeHtml(text.substring(currentPosition, event.position));
            }

            if (event.type === 'start') {
                // Start a new span
                const annotation = event.annotation;

                // Handle preview annotations differently
                if (annotation.isPreview) {
                    result += `<span class="suggestion-preview-highlight" style="background-color: ${this.currentPreview.color};">`;
                } else {
                    const spanIndex = this.config.spanNames.indexOf(annotation.span);
                    const spanClass = spanIndex >= 0 ? `annotation-span-${spanIndex}` : 'annotation-span-0';
                    const suggestionClass = annotation.isSuggestion ? ' suggestion' : '';
                    const outOfAlignmentClass = annotation.isOutOfAlignment ? ' out-of-alignment' : '';
                    const suggestionData = annotation.isSuggestion ?
                        ` data-suggestion="true" data-start="${annotation.start}" data-end="${annotation.end}"` : '';
                    const spanText = annotation.isSuggestion ? annotation.span + '?' : annotation.span;

                    // Add inline background color for suggestions to ensure it displays correctly
                    let styleAttr = '';
                    if (annotation.isSuggestion && spanIndex >= 0 && !annotation.isOutOfAlignment) {
                        const colorIndex = spanIndex % this.spanColors.length;
                        styleAttr = ` style="background-color: ${this.spanColors[colorIndex]};"`;
                    }

                    result += `<span class="annotation ${spanClass}${suggestionClass}${outOfAlignmentClass}" data-span="${spanText}"${suggestionData}${styleAttr}>`;
                }
                openSpans.push(event.index);
            } else {
                // End a span - need to close spans in proper order
                const spanIndex = openSpans.indexOf(event.index);
                if (spanIndex !== -1) {
                    // Close all spans from the end to this one, then reopen the others
                    const spansToReopen = openSpans.slice(spanIndex + 1);

                    // Close spans in reverse order
                    for (let i = openSpans.length - 1; i >= spanIndex; i--) {
                        result += '</span>';
                    }

                    // Remove the closed span from the stack
                    openSpans.splice(spanIndex, 1);

                    // Reopen the spans that were temporarily closed, but only if they have remaining content
                    // We need to filter out spans that shouldn't be reopened and update openSpans accordingly
                    const spansActuallyReopened = [];
                    spansToReopen.forEach(reopenIndex => {
                        const reopenAnnotation = validAnnotations[reopenIndex];

                        // Only reopen if this span extends beyond the current position (has remaining content)
                        if (reopenAnnotation.end > event.position) {
                            // Handle preview annotations
                            if (reopenAnnotation.isPreview) {
                                result += `<span class="suggestion-preview-highlight" style="background-color: ${this.currentPreview.color};">`;
                            } else {
                                const spanIndex = this.config.spanNames.indexOf(reopenAnnotation.span);
                                const spanClass = spanIndex >= 0 ? `annotation-span-${spanIndex}` : 'annotation-span-0';
                                const suggestionClass = reopenAnnotation.isSuggestion ? ' suggestion' : '';
                                const outOfAlignmentClass = reopenAnnotation.isOutOfAlignment ? ' out-of-alignment' : '';
                                const suggestionData = reopenAnnotation.isSuggestion ?
                                    ` data-suggestion="true" data-start="${reopenAnnotation.start}" data-end="${reopenAnnotation.end}"` : '';
                                const spanText = reopenAnnotation.isSuggestion ? reopenAnnotation.span + '?' : reopenAnnotation.span;

                                // Add inline background color for suggestions to ensure it displays correctly
                                let styleAttr = '';
                                if (reopenAnnotation.isSuggestion && spanIndex >= 0 && !reopenAnnotation.isOutOfAlignment) {
                                    const colorIndex = spanIndex % this.spanColors.length;
                                    styleAttr = ` style="background-color: ${this.spanColors[colorIndex]};"`;
                                }

                                result += `<span class="annotation ${spanClass}${suggestionClass}${outOfAlignmentClass}" data-span="${spanText}"${suggestionData}${styleAttr}>`;
                            }
                            spansActuallyReopened.push(reopenIndex);
                        }
                    });

                    // Update openSpans to only include spans that were actually reopened
                    // Remove all the old entries for spansToReopen and add back only the ones we reopened
                    openSpans.splice(openSpans.length - spansToReopen.length);
                    openSpans.push(...spansActuallyReopened);
                }
            }

            currentPosition = event.position;
        });

        // Add remaining text
        if (currentPosition < text.length) {
            result += this.escapeHtml(text.substring(currentPosition));
        }

        // Close any remaining open spans
        while (openSpans.length > 0) {
            result += '</span>';
            openSpans.pop();
        }

        return result;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    populateCorpusList() {
        this.corpusList.innerHTML = '';

        Object.keys(this.fullConfig.corpora).forEach(corpusName => {
            const corpusConfig = this.fullConfig.corpora[corpusName];
            const corpusItem = document.createElement('div');
            corpusItem.className = 'corpus-item';
            corpusItem.dataset.corpus = corpusName;

            if (corpusName === this.currentCorpus) {
                corpusItem.classList.add('active');
            }

            corpusItem.innerHTML = `
                <h4>${corpusName}</h4>
                <p>${corpusConfig.title}</p>
            `;

            corpusItem.addEventListener('click', () => this.switchCorpus(corpusName));
            this.corpusList.appendChild(corpusItem);
        });
    }

    toggleSidePanel() {
        this.sidePanel.classList.toggle('open');
        this.overlay.classList.toggle('active');
        this.hamburgerMenu.classList.toggle('active');
    }

    closeSidePanel() {
        this.sidePanel.classList.remove('open');
        this.overlay.classList.remove('active');
        this.hamburgerMenu.classList.remove('active');
    }

    toggleDetailsPanel() {
        this.detailsPanel.classList.toggle('open');
        this.detailsToggle.classList.toggle('open');
        document.body.classList.toggle('panel-open');
        if (this.detailsPanel.classList.contains('open')) {
            this.updateDetailsPanel();
        }
    }

    closeDetailsPanel() {
        this.detailsPanel.classList.remove('open');
        this.detailsToggle.classList.remove('open');
        document.body.classList.remove('panel-open');
    }

    switchCorpus(corpusName) {
        if (corpusName === this.currentCorpus) {
            this.closeSidePanel();
            return;
        }

        // Show loading indicator before switching
        const corpusTitle = this.fullConfig.corpora[corpusName]?.title || corpusName;
        this.showLoading(`Switching to ${corpusTitle}...`, 10);

        // Update URL and reload page with new corpus
        const url = new URL(window.location);
        url.searchParams.set('corpus', corpusName);
        window.location.href = url.toString();
    }

    setupTextSelection() {
        // Remove old event handlers if they exist to prevent accumulation
        if (this.textClickHandler) {
            this.textContent.removeEventListener('click', this.textClickHandler);
        }
        if (this.textMouseupHandler) {
            this.textContent.removeEventListener('mouseup', this.textMouseupHandler);
        }

        // Create and store the click handler
        this.textClickHandler = (e) => {
            // Don't handle if clicking on a regular suggestion annotation
            if (e.target.classList.contains('suggestion')) {
                e.preventDefault();
                e.stopPropagation();
                this.acceptSuggestion(e.target);
                return;
            }

            // If an annotation button is selected, check for suggestions at click position
            if (this.selectedSpan) {
                // Calculate the character position of the click
                const clickPosition = this.getClickPosition(e);
                if (clickPosition !== null) {
                    // Find suggestions at this position
                    const suggestions = this.findSuggestionsAtPosition(clickPosition);

                    if (suggestions.length > 0) {
                        // Show the dropdown with suggestions
                        e.preventDefault();
                        e.stopPropagation();
                        this.showSuggestionDropdown(suggestions, e.pageX, e.pageY);
                        return;
                    }
                }

                // If suggestionsConfineAnnotations is true and no suggestions found, don't allow free text
                if (this.config.suggestionsConfineAnnotations) {
                    console.log('No suggestions found at this position');
                    return;
                }
            }
        };

        // Create and store the mouseup handler
        this.textMouseupHandler = (e) => {
            // Don't handle text selection if clicking on a suggestion
            if (e.target.classList.contains('suggestion')) {
                return;
            }

            // Only allow free text selection if:
            // 1. suggestionsConfineAnnotations is false, OR
            // 2. delete mode is active
            const allowFreeTextSelection = !this.config.suggestionsConfineAnnotations || this.deleteMode;

            if ((this.selectedSpan || this.deleteMode) && allowFreeTextSelection) {
                this.handleTextSelection().catch(error => {
                    console.error('Error handling text selection:', error);
                });
            }
        };

        // Add the event handlers
        this.textContent.addEventListener('click', this.textClickHandler);
        this.textContent.addEventListener('mouseup', this.textMouseupHandler);
    }

    // Get the character position of a click in the text content
    getClickPosition(event) {
        const range = document.caretRangeFromPoint(event.clientX, event.clientY);
        if (!range) return null;

        const textContentElement = this.textContent;
        return this.getTextOffset(textContentElement, range.startContainer, range.startOffset);
    }

    selectSpan(spanName, button) {
        // If clicking the already-active button, deselect it
        if (button.classList.contains('active')) {
            button.classList.remove('active');
            this.selectedSpan = null;
            console.log("Deselected span");
            return;
        }

        // Otherwise, select the new span
        this.deleteMode = false;
        this.deleteBtn.classList.remove('active');
        document.querySelectorAll('.span-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.selectedSpan = spanName;
        console.log("Selected span is " + this.selectedSpan);
    }

    toggleDeleteMode() {
        this.deleteMode = !this.deleteMode;
        this.selectedSpan = null;

        document.querySelectorAll('.span-button').forEach(btn => btn.classList.remove('active'));

        if (this.deleteMode) {
            this.deleteBtn.classList.add('active');
            console.log("Delete mode activated");
        } else {
            this.deleteBtn.classList.remove('active');
            console.log("Delete mode deactivated");
        }
    }

    async handleTextSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0 || this.customTrim(selection.toString(), this.trimCharacters) === '') {
            return;
        }

        const range = selection.getRangeAt(0);
        const originalText = selection.toString();
        const selectedText = this.customTrim(originalText, this.trimCharacters);

        if (!selectedText) return;

        const textContentElement = this.textContent;
        const rawStart = this.getTextOffset(textContentElement, range.startContainer, range.startOffset);

        // Adjust start position to account for trimmed leading characters
        const leadingTrimmed = originalText.length - this.trimStart(originalText, this.trimCharacters).length;
        const start = rawStart + leadingTrimmed;
        const end = start + selectedText.length;

        if (this.deleteMode) {
            await this.deleteIntersectingAnnotations(start, end);
        } else if (this.selectedSpan) {
            this.saveAnnotation(selectedText, start, end);
        }

        selection.removeAllRanges();

        document.querySelectorAll('.span-button').forEach(btn => btn.classList.remove('active'));
        this.deleteBtn.classList.remove('active');
        this.selectedSpan = null;
        this.deleteMode = false;
    }

    getTextOffset(root, node, offset) {
        let textOffset = 0;
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
            if (currentNode === node) {
                return textOffset + offset;
            }
            textOffset += currentNode.textContent.length;
        }

        return textOffset;
    }

    // Trim characters from the start of a string based on trim list
    trimStart(text, trimChars) {
        let start = 0;
        while (start < text.length && trimChars.includes(text[start])) {
            start++;
        }
        return text.substring(start);
    }

    // Trim characters from the end of a string based on trim list
    trimEnd(text, trimChars) {
        let end = text.length;
        while (end > 0 && trimChars.includes(text[end - 1])) {
            end--;
        }
        return text.substring(0, end);
    }

    // Trim characters from both ends of a string based on trim list
    customTrim(text, trimChars) {
        return this.trimEnd(this.trimStart(text, trimChars), trimChars);
    }

    async deleteIntersectingAnnotations(selectionStart, selectionEnd) {
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        if (!this.annotations[recordId]) {
            console.log("No annotations to delete for this record");
            return;
        }

        const annotationsToDelete = [];

        this.annotations[recordId].forEach((annotation, index) => {
            const annotationStart = annotation.start;
            const annotationEnd = annotation.end;

            if (this.rangesIntersect(selectionStart, selectionEnd, annotationStart, annotationEnd)) {
                annotationsToDelete.push({ annotation, index });
            }
        });

        if (annotationsToDelete.length === 0) {
            console.log("No intersecting annotations found");
            return;
        }

        annotationsToDelete.reverse().forEach(({ annotation, index }) => {
            console.log(`Deleting annotation: ${annotation.span} - "${annotation.text}"`);

            this.annotations[recordId].splice(index, 1);

            const outputIndex = this.outputData.findIndex(row =>
                row[this.config.idColumnName] === recordId &&
                row.span === annotation.span &&
                row.text === annotation.text &&
                parseInt(row.start) === annotation.start &&
                parseInt(row.end) === annotation.end
            );

            if (outputIndex !== -1) {
                this.outputData.splice(outputIndex, 1);
            }
        });

        this.deleteFromOutputFile(annotationsToDelete.map(item => item.annotation));
        this.updateAnnotationCount();
        await this.displayCurrentRecord();

        console.log(`Deleted ${annotationsToDelete.length} intersecting annotation(s)`);
    }

    rangesIntersect(start1, end1, start2, end2) {
        return start1 < end2 && start2 < end1;
    }

    async acceptSuggestion(suggestionElement) {
        const spanName = suggestionElement.dataset.span.replace('?', ''); // Remove '?' from suggestion span
        const start = parseInt(suggestionElement.dataset.start);
        const end = parseInt(suggestionElement.dataset.end);

        // Get the text from the original suggestion data, not from DOM textContent
        // to ensure exact match for duplicate detection
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];
        const suggestion = this.suggestions[recordId]?.find(s =>
            s.span === spanName &&
            parseInt(s.start) === start &&
            parseInt(s.end) === end
        );

        if (!suggestion) {
            console.error('Could not find suggestion data for accepted suggestion');
            return;
        }

        const text = suggestion.text;

        console.log(`Accepting suggestion: ${spanName} - "${text}" (${start}-${end})`);

        // Temporarily set selectedSpan to the suggestion's span type
        const originalSelectedSpan = this.selectedSpan;
        this.selectedSpan = spanName;

        try {
            // Mark this record as having accepted suggestions in this session
            this.recordsWithOnlyAcceptedSuggestions.add(recordId);

            // Save as regular annotation (pass true to indicate this is from an accepted suggestion)
            // This will NOT mark the record as having manual annotations, so suggestions remain visible
            await this.saveAnnotation(text, start, end, true);

            console.log(`Suggestion accepted and saved as regular annotation`);
        } catch (error) {
            console.error('Error accepting suggestion:', error);
        } finally {
            // Restore original selectedSpan
            this.selectedSpan = originalSelectedSpan;
        }
    }

    // Find all suggestions that contain a specific character position
    findSuggestionsAtPosition(position) {
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];
        const recordSuggestions = this.suggestions[recordId] || [];

        // Filter suggestions that contain the clicked position
        return recordSuggestions.filter(suggestion => {
            return position >= suggestion.start && position < suggestion.end;
        });
    }

    // Show the suggestion dropdown at a specific position
    showSuggestionDropdown(suggestions, clickX, clickY) {
        if (!suggestions || suggestions.length === 0) {
            return;
        }

        // Get the selected span color for preview
        const spanIndex = this.config.spanNames.indexOf(this.selectedSpan);
        const colorIndex = spanIndex >= 0 ? spanIndex % this.spanColors.length : 0;
        const previewColor = this.spanColors[colorIndex];

        // Clear previous items
        this.suggestionDropdownList.innerHTML = '';

        // Add each suggestion as an item
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.dataset.start = suggestion.start;
            item.dataset.end = suggestion.end;
            item.dataset.text = suggestion.text;

            const textDiv = document.createElement('div');
            textDiv.className = 'suggestion-item-text';
            const scoreText = suggestion.score !== undefined ? ` (${suggestion.score})` : '';
            textDiv.textContent = `"${suggestion.text}"${scoreText}`;

            item.appendChild(textDiv);

            // Add hover preview
            item.addEventListener('mouseenter', () => {
                this.showSuggestionPreview(suggestion.start, suggestion.end, previewColor);
            });

            item.addEventListener('mouseleave', () => {
                this.hideSuggestionPreview();
            });

            // Add click handler
            item.addEventListener('click', () => {
                this.selectSuggestionFromDropdown(suggestion);
            });

            this.suggestionDropdownList.appendChild(item);
        });

        // Position the dropdown near the click
        this.suggestionDropdown.style.left = clickX + 'px';
        this.suggestionDropdown.style.top = clickY + 'px';
        this.suggestionDropdown.style.display = 'block';

        // Close dropdown when clicking outside
        setTimeout(() => {
            document.addEventListener('click', this.hideSuggestionDropdownHandler, true);
        }, 0);
    }

    // Hide the suggestion dropdown
    hideSuggestionDropdown() {
        this.suggestionDropdown.style.display = 'none';
        this.hideSuggestionPreview();
        document.removeEventListener('click', this.hideSuggestionDropdownHandler, true);
    }

    // Show preview highlight for a suggestion
    showSuggestionPreview(start, end, color) {
        // Remove any existing preview
        this.hideSuggestionPreview();

        // We need to find the position in the rendered HTML
        // For simplicity, we'll add a data attribute to track previews
        this.currentPreview = { start, end, color };
        this.isShowingPreview = true;
        this.displayCurrentRecord(true);
        this.isShowingPreview = false;
    }

    // Hide preview highlight
    hideSuggestionPreview() {
        this.currentPreview = null;
        this.isShowingPreview = true;
        this.displayCurrentRecord(true);
        this.isShowingPreview = false;
    }

    // Select a suggestion from the dropdown
    async selectSuggestionFromDropdown(suggestion) {
        this.hideSuggestionDropdown();

        const text = suggestion.text;
        const start = suggestion.start;
        const end = suggestion.end;

        console.log(`Selected suggestion from dropdown: "${text}" (${start}-${end}) for span: ${this.selectedSpan}`);

        try {
            // Save the annotation with the selected span type
            await this.saveAnnotation(text, start, end);
            console.log(`Suggestion saved as annotation`);
        } catch (error) {
            console.error('Error saving suggestion as annotation:', error);
        }

        // Deselect the span button
        document.querySelectorAll('.span-button').forEach(btn => btn.classList.remove('active'));
        this.selectedSpan = null;
    }

    // Record locking methods
    async acquireRecordLock(recordId) {
        try {
            const response = await fetch('api/record-lock/acquire', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    recordId: recordId,
                    corpus: this.currentCorpus
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.currentRecordLock = {
                    recordId: recordId,
                    expiresAt: new Date(result.expiresAt)
                };
                this.startLockRefresh();
                console.log(`Acquired lock for record ${recordId}`);
                return true;
            } else {
                const error = await response.json();
                if (response.status === 409) {
                    console.log(`Record ${recordId} is locked by ${error.lockedBy}`);
                    // Visual warning in UI is sufficient, no alert needed
                }
                return false;
            }
        } catch (error) {
            console.error('Error acquiring record lock:', error);
            return false;
        }
    }

    async releaseRecordLock(recordId) {
        if (!this.currentRecordLock || this.currentRecordLock.recordId !== recordId) {
            return;
        }

        try {
            await fetch('api/record-lock/release', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    recordId: recordId,
                    corpus: this.currentCorpus
                })
            });
            console.log(`Released lock for record ${recordId}`);
        } catch (error) {
            console.error('Error releasing record lock:', error);
        } finally {
            this.currentRecordLock = null;
            this.stopLockRefresh();
        }
    }

    async refreshRecordLock() {
        if (!this.currentRecordLock) {
            return;
        }

        try {
            const response = await fetch('api/record-lock/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    recordId: this.currentRecordLock.recordId,
                    corpus: this.currentCorpus
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.currentRecordLock.expiresAt = new Date(result.expiresAt);
                console.log(`Refreshed lock for record ${this.currentRecordLock.recordId}`);
            } else {
                console.warn('Failed to refresh lock - may have expired');
                this.currentRecordLock = null;
                this.stopLockRefresh();
            }
        } catch (error) {
            console.error('Error refreshing record lock:', error);
        }
    }

    startLockRefresh() {
        this.stopLockRefresh();
        // Refresh lock every 5 minutes (lock expires after 10 minutes)
        this.lockRefreshInterval = setInterval(() => {
            this.refreshRecordLock();
        }, 5 * 60 * 1000);
    }

    stopLockRefresh() {
        if (this.lockRefreshInterval) {
            clearInterval(this.lockRefreshInterval);
            this.lockRefreshInterval = null;
        }
    }

    async loadAllLocks() {
        try {
            const response = await fetch(`api/record-lock/all/${encodeURIComponent(this.currentCorpus)}`);
            if (response.ok) {
                const locks = await response.json();
                this.allLocks = {};
                locks.forEach(lock => {
                    this.allLocks[lock.recordId] = {
                        username: lock.username,
                        expiresAt: new Date(lock.expiresAt)
                    };
                });
            }
        } catch (error) {
            console.error('Error loading all locks:', error);
        }
    }

    startDataRefresh() {
        this.stopDataRefresh();
        // Refresh data every 30 seconds
        this.dataRefreshInterval = setInterval(async () => {
            await this.refreshAnnotationData();
        }, 30 * 1000);
    }

    stopDataRefresh() {
        if (this.dataRefreshInterval) {
            clearInterval(this.dataRefreshInterval);
            this.dataRefreshInterval = null;
        }
    }

    async refreshAnnotationData() {
        try {
            const currentCount = this.outputData.length;
            await this.loadOutputData();
            await this.loadAllLocks();

            // If new annotations were added, update the display
            if (this.outputData.length > currentCount) {
                await this.displayCurrentRecord();
                console.log(`Refreshed data: ${this.outputData.length - currentCount} new annotations found`);
            }
        } catch (error) {
            console.error('Error refreshing annotation data:', error);
        }
    }

    async handleRecordLocking(recordId) {
        // Release current lock if we're moving to a different record
        if (this.currentRecordLock && this.currentRecordLock.recordId !== recordId) {
            await this.releaseRecordLock(this.currentRecordLock.recordId);
        }

        // Try to acquire lock for the new record if we don't already have it
        if (!this.currentRecordLock || this.currentRecordLock.recordId !== recordId) {
            const lockAcquired = await this.acquireRecordLock(recordId);
            this.updateLockUI(recordId, lockAcquired);
        } else {
            // We already have the lock for this record
            this.updateLockUI(recordId, true);
        }
    }

    updateLockUI(recordId, canAnnotate) {
        const lockInfo = this.allLocks[recordId];
        const recordIdElement = this.recordIdSpan;
        const isIgnored = this.isRecordIgnored(recordId);

        if (isIgnored) {
            // Record is ignored
            recordIdElement.style.color = '#f39c12'; // Orange
            recordIdElement.title = 'This record is marked as ignored';
            const ignoreReason = this.getIgnoreReason(recordId);
            const ignoreMessage = ignoreReason
                ? `This record has been marked as ignored and cannot be annotated. Reason: ${ignoreReason}`
                : 'This record has been marked as ignored and cannot be annotated.';
            this.enableAnnotationControls(false, ignoreMessage);
        } else if (canAnnotate) {
            // User can annotate this record
            recordIdElement.style.color = '#28a745'; // Green
            recordIdElement.title = 'You can annotate this record';
            this.enableAnnotationControls(true);
        } else if (lockInfo) {
            // Record is locked by another user
            recordIdElement.style.color = '#dc3545'; // Red
            recordIdElement.title = `Locked by ${lockInfo.username} until ${lockInfo.expiresAt.toLocaleTimeString()}`;
            this.enableAnnotationControls(false, `This record is locked by ${lockInfo.username}`);
        } else {
            // Default state
            recordIdElement.style.color = '';
            recordIdElement.title = '';
            this.enableAnnotationControls(true);
        }
    }

    enableAnnotationControls(enabled, reason = null) {
        // Enable/disable span buttons
        const spanButtons = this.spanButtonsContainer.querySelectorAll('.span-button');
        spanButtons.forEach(button => {
            button.disabled = !enabled;
        });

        // Enable/disable delete button
        this.deleteBtn.disabled = !enabled;

        // Update exclude/include button based on record status
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record ? record[this.config.idColumnName] : null;
        const isIgnored = recordId ? this.isRecordIgnored(recordId) : false;

        // Update button text based on status
        if (isIgnored) {
            this.ignoreRecordBtn.textContent = 'Include Record';
            this.ignoreRecordBtn.disabled = false;  // Enable so user can include it again
        } else {
            this.ignoreRecordBtn.textContent = 'Exclude Record';
            this.ignoreRecordBtn.disabled = !enabled;
        }

        // Add visual indicator
        if (!enabled) {
            this.textContent.style.opacity = '0.5';

            // Remove any existing warning
            const existingWarning = document.getElementById('status-warning');
            if (existingWarning) {
                existingWarning.remove();
            }

            if (reason) {
                const warning = document.createElement('div');
                warning.id = 'status-warning';
                warning.textContent = reason;
                if (reason.includes('ignored')) {
                    warning.style.cssText = 'background: #fff3cd; color: #856404; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid #ffeaa7;';
                } else {
                    warning.style.cssText = 'background: #f8d7da; color: #721c24; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid #f5c6cb;';
                }
                this.textContent.parentNode.insertBefore(warning, this.textContent);
            }
        } else {
            this.textContent.style.opacity = '';
            const warning = document.getElementById('status-warning');
            if (warning) {
                warning.remove();
            }
        }
    }

    toggleExcludeRecord() {
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];
        const isIgnored = this.isRecordIgnored(recordId);

        if (isIgnored) {
            this.includeCurrentRecord();
        } else {
            this.openExcludeModal();
        }
    }

    copyRecordIdToClipboard() {
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        navigator.clipboard.writeText(recordId).then(() => {
            // Visual feedback
            const originalText = this.recordIdSpan.textContent;
            this.recordIdSpan.textContent = '✓ Copied!';
            setTimeout(() => {
                this.recordIdSpan.textContent = originalText;
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy record ID:', err);
            alert('Failed to copy record ID to clipboard');
        });
    }

    copyRecordLinkToClipboard() {
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        // Build URL with recordId parameter
        const url = new URL(window.location.href);
        url.searchParams.set('recordId', recordId);
        const linkUrl = url.toString();

        navigator.clipboard.writeText(linkUrl).then(() => {
            // Visual feedback
            const originalContent = this.copyLinkBtn.textContent;
            this.copyLinkBtn.textContent = '✓';
            setTimeout(() => {
                this.copyLinkBtn.textContent = originalContent;
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link to clipboard');
        });
    }

    openExternalLookup() {
        if (!this.config.externalLinkURL) {
            console.log('No external link URL configured');
            return;
        }

        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        // Replace [RecordId] placeholder with actual record ID
        const externalUrl = this.config.externalLinkURL.replace(/\[RecordId\]/g, recordId);

        // Open in new tab
        window.open(externalUrl, '_blank');
    }

    openExcludeModal() {
        if (this.isSaving) {
            console.log('Save operation already in progress, skipping...');
            return;
        }

        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        // Check if record is already excluded
        if (this.isRecordIgnored(recordId)) {
            alert('This record is already excluded.');
            return;
        }

        // Update modal for exclude
        this.ignoreModalTitle.textContent = 'Exclude Record';
        this.confirmIgnoreBtn.textContent = 'Exclude';
        this.ignoreWarningMessage.style.display = 'block';

        // Reset the dropdown
        this.ignoreReasonSelect.value = '';

        // Show the modal
        this.ignoreModal.style.display = 'block';
    }

    async includeCurrentRecord() {
        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        if (!this.isRecordIgnored(recordId)) {
            alert('This record is not excluded.');
            return;
        }

        if (!confirm('Are you sure you want to include this record again? It will be available for annotation.')) {
            return;
        }

        if (this.isSaving) {
            console.log('Save operation already in progress, skipping...');
            return;
        }

        this.isSaving = true;

        try {
            // Find the IGNORE annotation for this record
            const ignoreAnnotation = this.annotations[recordId].find(ann => ann.span === 'IGNORE');

            if (ignoreAnnotation) {
                // Remove from local annotations array
                const index = this.annotations[recordId].indexOf(ignoreAnnotation);
                if (index !== -1) {
                    this.annotations[recordId].splice(index, 1);
                }

                // Remove from output data
                const outputIndex = this.outputData.findIndex(row =>
                    row[this.config.idColumnName] === recordId &&
                    row.span === 'IGNORE'
                );

                if (outputIndex !== -1) {
                    this.outputData.splice(outputIndex, 1);
                }

                // Delete from file
                await this.deleteFromOutputFile([{
                    [this.config.idColumnName]: recordId,
                    span: 'IGNORE',
                    text: ignoreAnnotation.text,
                    start: 0,
                    end: 1
                }]);
            }

            this.updateAnnotationCount();
            await this.loadOutputData();
            await this.displayCurrentRecord();

            console.log(`Record ${recordId} included again`);

        } catch (error) {
            console.error('Error including record:', error);
            alert('Error including record. Please try again.');
        } finally {
            this.isSaving = false;
        }
    }

    closeIgnoreModal() {
        this.ignoreModal.style.display = 'none';
        this.ignoreReasonSelect.value = '';
    }

    async confirmExcludeRecord() {
        const excludeReason = this.ignoreReasonSelect.value.trim();

        if (!excludeReason) {
            alert('Please select a reason for excluding this record.');
            return;
        }

        this.closeIgnoreModal();

        if (this.isSaving) {
            console.log('Save operation already in progress, skipping...');
            return;
        }

        const record = this.inputData[this.currentRecordIndex];
        const recordId = record[this.config.idColumnName];

        this.isSaving = true;

        try {
            // Delete all existing annotations for this record first
            const existingAnnotations = this.annotations[recordId] || [];
            const nonIgnoreAnnotations = existingAnnotations.filter(ann => ann.span !== 'IGNORE');

            if (nonIgnoreAnnotations.length > 0) {
                // Delete from file
                await this.deleteFromOutputFile(nonIgnoreAnnotations);

                // Remove from local annotations array
                this.annotations[recordId] = [];

                // Remove from output data
                this.outputData = this.outputData.filter(row =>
                    !(row[this.config.idColumnName] === recordId && row.span !== 'IGNORE')
                );
            }

            // Now add the IGNORE annotation
            const ignoreAnnotation = {
                [this.config.idColumnName]: recordId,
                span: 'IGNORE',
                text: excludeReason,  // Store the exclude reason as the text
                start: 0,
                end: 1,
                timestamp: this.getLocalTimestamp()
            };

            await this.saveToOutputFile(ignoreAnnotation);

            // Add to local data structures
            if (!this.annotations[recordId]) {
                this.annotations[recordId] = [];
            }
            this.annotations[recordId].push({
                span: 'IGNORE',
                text: excludeReason,  // Store the exclude reason as the text
                start: 0,
                end: 1,
                username: 'system'
            });

            this.outputData.push(ignoreAnnotation);
            this.updateAnnotationCount();

            // Force refresh output data to ensure exclude status persists
            await this.loadOutputData();

            await this.displayCurrentRecord();

            console.log(`Record ${recordId} excluded with reason: ${excludeReason}`);

        } catch (error) {
            console.error('Error excluding record:', error);
            alert('Error excluding record. Please try again.');
        } finally {
            this.isSaving = false;
        }
    }

    isRecordIgnored(recordId) {
        return this.annotations[recordId] &&
               this.annotations[recordId].some(annotation => annotation.span === 'IGNORE');
    }

    getIgnoreReason(recordId) {
        if (!this.annotations[recordId]) {
            return null;
        }
        const ignoreAnnotation = this.annotations[recordId].find(annotation => annotation.span === 'IGNORE');
        return ignoreAnnotation ? ignoreAnnotation.text : null;
    }

    updateDetailsPanel() {
        if (this.isUpdatingDetailsPanel) {
            return; // Prevent recursive calls
        }

        this.isUpdatingDetailsPanel = true;
        try {
            const record = this.inputData[this.currentRecordIndex];
            const recordId = record[this.config.idColumnName];

            this.updateSelectedAnnotations(recordId);
            this.updateAvailableAnnotations(recordId);
        } finally {
            this.isUpdatingDetailsPanel = false;
        }
    }

    updateSelectedAnnotations(recordId) {
        this.selectedAnnotationsList.innerHTML = '';

        const annotations = this.annotations[recordId] || [];
        const nonIgnoreAnnotations = annotations.filter(ann => ann.span !== 'IGNORE');

        // Sort by span name order (same as button order)
        const sortedAnnotations = nonIgnoreAnnotations.sort((a, b) => {
            const indexA = this.config.spanNames.indexOf(a.span);
            const indexB = this.config.spanNames.indexOf(b.span);
            return indexA - indexB;
        });

        sortedAnnotations.forEach(annotation => {
            const item = this.createSelectedAnnotationItem(annotation, recordId);
            this.selectedAnnotationsList.appendChild(item);
        });

        if (sortedAnnotations.length === 0) {
            this.selectedAnnotationsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">No annotations yet</p>';
        }
    }

    createSelectedAnnotationItem(annotation, recordId) {
        const item = document.createElement('div');
        item.className = 'annotation-detail-item';

        // Get color from span index
        const spanIndex = this.config.spanNames.indexOf(annotation.span);
        const colorIndex = spanIndex >= 0 ? spanIndex % this.spanColors.length : 0;
        item.style.backgroundColor = this.spanColors[colorIndex];

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'annotation-delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.setAttribute('type', 'button');
        deleteBtn.id = 'delete-' + annotation.start + '-' + annotation.end;

        // Use mousedown instead of click to fire before DOM updates
        const self = this;
        deleteBtn.onmousedown = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            self.deleteAnnotationFromPanel(annotation, recordId);
            return false;
        };

        // Span type label
        const spanLabelDiv = document.createElement('div');
        spanLabelDiv.className = 'annotation-detail-label';
        spanLabelDiv.textContent = annotation.span;

        // Text
        const textDiv = document.createElement('div');
        textDiv.className = 'annotation-detail-text';
        textDiv.textContent = `"${annotation.text}"`;

        // Meta (username and date)
        const metaDiv = document.createElement('div');
        metaDiv.className = 'annotation-detail-meta';
        const timestamp = annotation.timestamp || 'Unknown date';
        const username = annotation.username || 'Unknown user';
        metaDiv.textContent = `${username} • ${this.formatTimestamp(timestamp)}`;

        item.appendChild(deleteBtn);
        item.appendChild(spanLabelDiv);
        item.appendChild(textDiv);
        item.appendChild(metaDiv);

        // Note: No hover preview on selected annotations to avoid DOM conflicts with delete button

        return item;
    }

    updateAvailableAnnotations(recordId) {
        this.availableAnnotationsList.innerHTML = '';

        const suggestions = this.suggestions[recordId] || [];

        // Sort by start position
        const sortedSuggestions = [...suggestions].sort((a, b) => a.start - b.start);

        // Update header with count
        if (this.availableAnnotationsHeader) {
            this.availableAnnotationsHeader.textContent = `Available Annotations (${sortedSuggestions.length})`;
        }

        sortedSuggestions.forEach(suggestion => {
            const item = this.createAvailableSuggestionItem(suggestion, recordId);
            this.availableAnnotationsList.appendChild(item);
        });

        if (sortedSuggestions.length === 0) {
            this.availableAnnotationsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">No suggestions available</p>';
        }
    }

    createAvailableSuggestionItem(suggestion, recordId) {
        const item = document.createElement('div');
        item.className = 'annotation-detail-item';

        // If suggestion has a span name, show with color
        if (suggestion.span && suggestion.span.trim() !== '') {
            const spanIndex = this.config.spanNames.indexOf(suggestion.span);
            if (spanIndex >= 0) {
                const colorIndex = spanIndex % this.spanColors.length;
                item.style.backgroundColor = this.spanColors[colorIndex];
            }
        }

        // Text
        const textDiv = document.createElement('div');
        textDiv.className = 'annotation-detail-text';
        const scoreText = suggestion.score !== undefined ? ` (${suggestion.score})` : '';
        textDiv.textContent = `"${suggestion.text}"${scoreText}`;

        item.appendChild(textDiv);

        // Hover preview
        item.addEventListener('mouseenter', () => {
            let previewColor;
            if (this.selectedSpan) {
                const spanIndex = this.config.spanNames.indexOf(this.selectedSpan);
                const colorIndex = spanIndex >= 0 ? spanIndex % this.spanColors.length : 0;
                previewColor = this.spanColors[colorIndex];
            } else {
                previewColor = 'rgba(255, 255, 0, 0.3)'; // Light yellow
            }
            this.showSuggestionPreview(suggestion.start, suggestion.end, previewColor);
        });

        item.addEventListener('mouseleave', (e) => {
            // Only hide preview if the mouse is genuinely leaving the list,
            // not when the item is removed from the DOM during a panel rebuild
            // (which fires a spurious mouseleave with relatedTarget null or inside the list).
            if (e.relatedTarget && !this.availableAnnotationsList.contains(e.relatedTarget)) {
                this.hideSuggestionPreview();
            }
        });

        // Click to annotate - use mousedown to avoid DOM conflicts
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.selectedSpan) {
                return; // Silently ignore if no annotation button selected
            }
            this.annotateFromPanel(suggestion);
        });

        return item;
    }

    formatTimestamp(timestamp) {
        if (!timestamp || timestamp === 'Unknown date') {
            return 'Unknown date';
        }

        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                // Invalid date, return the original timestamp
                return timestamp;
            }
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch {
            return timestamp;
        }
    }

    async annotateFromPanel(suggestion) {
        try {
            // Hide any preview first
            this.hideSuggestionPreview();

            await this.saveAnnotation(suggestion.text, suggestion.start, suggestion.end);

            // Deselect the span button (same as dropdown workflow)
            document.querySelectorAll('.span-button').forEach(btn => btn.classList.remove('active'));
            this.selectedSpan = null;

            this.updateDetailsPanel();
        } catch (error) {
            console.error('Error saving annotation from panel:', error);
        }
    }

    async deleteAnnotationFromPanel(annotation, recordId) {
        try {
            // Remove from local data structures
            if (this.annotations[recordId]) {
                const index = this.annotations[recordId].findIndex(a =>
                    a.span === annotation.span &&
                    a.text === annotation.text &&
                    a.start === annotation.start &&
                    a.end === annotation.end
                );

                if (index !== -1) {
                    this.annotations[recordId].splice(index, 1);
                }
            }

            // Remove from output data
            const outputIndex = this.outputData.findIndex(row =>
                row[this.config.idColumnName] === recordId &&
                row.span === annotation.span &&
                row.text === annotation.text &&
                parseInt(row.start) === annotation.start &&
                parseInt(row.end) === annotation.end
            );

            if (outputIndex !== -1) {
                this.outputData.splice(outputIndex, 1);
            }

            // Delete from file
            await this.deleteFromOutputFile([annotation]);

            // Update display
            this.updateAnnotationCount();
            await this.displayCurrentRecord();
            this.updateDetailsPanel();
        } catch (error) {
            console.error('Error deleting annotation from panel:', error);
        }
    }

    async saveAnnotation(text, start, end, isFromAcceptedSuggestion = false) {
        if (this.isSaving) {
            console.log('Save operation already in progress, skipping...');
            return;
        }

        this.isSaving = true;

        try {
            const record = this.inputData[this.currentRecordIndex];
            const recordId = record[this.config.idColumnName];

            const annotation = {
                [this.config.idColumnName]: recordId,
                span: this.selectedSpan,
                text: text,
                start: start,
                end: end,
                timestamp: this.getLocalTimestamp()
            };

            await this.saveToOutputFile(annotation);

            if (!this.annotations[recordId]) {
                this.annotations[recordId] = [];
            }
            this.annotations[recordId].push(annotation);

            this.outputData.push(annotation);
            this.updateAnnotationCount();

            // Track manual annotations for session state
            // Note: This won't hide suggestions in the current session (visibility decision is cached),
            // but it's used to determine initial visibility when first entering/returning to a record
            if (!isFromAcceptedSuggestion) {
                this.recordsWithManualAnnotations.add(recordId);
                // Also remove from accepted suggestions set since there's now a manual annotation
                this.recordsWithOnlyAcceptedSuggestions.delete(recordId);
            }

            await this.displayCurrentRecord();

            // Update details panel if open
            if (this.detailsPanel.classList.contains('open')) {
                this.updateDetailsPanel();
            }

        } catch (error) {
            console.error('Error saving annotation:', error);
            alert('Error saving annotation. Please try again.');
        } finally {
            this.isSaving = false;
        }
    }

    async saveToOutputFile(annotation) {
        const csvLine = this.formatCSVLine(annotation);

        try {
            const response = await fetch('api/annotation/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    csvLine: csvLine,
                    outputFile: this.config.outputCsvFile
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Annotation saved:', result.message);

        } catch (error) {
            console.error('Error calling save API:', error);
            this.saveToLocalStorage(annotation);
            throw error;
        }
    }

    formatCSVLine(annotation) {
        // Output CSV always uses 'id' as the column name, regardless of input column name
        const headers = ['id', 'span', 'text', 'start', 'end', 'timestamp'];
        const values = headers.map(header => {
            let value;
            if (header === 'id') {
                // Map from the config's ID column name to 'id'
                value = annotation[this.config.idColumnName] || annotation.id;
            } else {
                value = annotation[header];
            }

            if (value === undefined || value === null) {
                value = '';
            }
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            if (header === 'span') {
                value = value.replace('?', ''); // Remove '?' from span names when saving
            }
            return value;
        });
        return values.join(',');
    }

    saveToLocalStorage(annotation) {
        const key = `annotations_${this.config.outputCsvFile}`;
        let stored = JSON.parse(localStorage.getItem(key) || '[]');
        stored.push(annotation);
        localStorage.setItem(key, JSON.stringify(stored));

        console.log('Annotation saved to local storage as fallback');
    }

    async deleteFromOutputFile(annotationsToDelete) {
        try {
            const record = this.inputData[this.currentRecordIndex];
            const recordId = record[this.config.idColumnName];

            // Convert annotations to the format expected by the server
            const annotationsForServer = annotationsToDelete.map(annotation => ({
                Id: recordId,
                Span: annotation.span,
                Text: annotation.text,
                Start: annotation.start,
                End: annotation.end
            }));

            const response = await fetch('api/annotation/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    annotations: annotationsForServer,
                    outputFile: this.config.outputCsvFile
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Annotations deleted:', result.message);

        } catch (error) {
            console.error('Error calling delete API:', error);
            console.log('Delete operation completed in memory only');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SPANnotator();
});